import 'dotenv/config';
import type { files } from 'dropbox';
import { getDbx } from './dropbox';

// ── Layout ─────────────────────────────────────────────────────────────────────
// Everything the vault persists lives inside one Dropbox folder (default
// /VibeVault), separate from the music library:
//
//   /VibeVault
//     notes/<slug>.md          private markdown journal
//     ops/contact/<ts>.json    one small JSON per contact-form submission
//     ops/visits/<day>.json    per-day page-view counters
//     files/<name>             private file vault uploads
const clean = (v: string | undefined): string => (v ? v.trim() : '');

let VAULT_PATH = clean(process.env.DROPBOX_VAULT_PATH) || '/VibeVault';
if (!VAULT_PATH.startsWith('/')) VAULT_PATH = '/' + VAULT_PATH;
if (VAULT_PATH === '/') VAULT_PATH = '/VibeVault';

export const NOTE_DIR = `${VAULT_PATH}/notes`;
export const OPS_CONTACT_DIR = `${VAULT_PATH}/ops/contact`;
export const OPS_VISITS_DIR = `${VAULT_PATH}/ops/visits`;
export const FILES_DIR = `${VAULT_PATH}/files`;

// ── Folder bootstrap ───────────────────────────────────────────────────────────
const FOLDERS = [NOTE_DIR, OPS_CONTACT_DIR, OPS_VISITS_DIR, FILES_DIR];
let bootstrapped: Promise<void> | null = null;

function ensureVaultFolders(): Promise<void> {
    if (!bootstrapped) {
        bootstrapped = (async () => {
            const dbx = getDbx();
            await Promise.all(
                FOLDERS.map(async (path) => {
                    try {
                        await dbx.filesCreateFolderV2({ path, autorename: false });
                    } catch (err: any) {
                        // "already exists" is the normal case after first run
                        if (!String(err?.error_summary || '').includes('conflict')) {
                            throw new Error(
                                `Cannot create vault folder ${path} — ${err?.error_summary || err?.message}. ` +
                                `If this says insufficient_permissions/scope, grant files.content.write ` +
                                `+ files.metadata.write to the app and re-authorize the refresh token.`
                            );
                        }
                    }
                })
            );
        })().catch(err => {
            // Reset so the next request retries — a transient failure here
            // shouldn't poison the module for the lambda's lifetime.
            bootstrapped = null;
            throw err;
        });
    }
    return bootstrapped;
}

// ── Listings (cached, de-duplicated) ───────────────────────────────────────────
export interface VaultEntry {
    name: string;
    path_lower: string;
    server_modified: string | null;
    size: number | null;
}

const listCache = new Map<string, { at: number; entries: VaultEntry[] }>();
const inFlight = new Map<string, Promise<VaultEntry[]>>();
const LIST_TTL_MS = 60_000;

export async function listVaultDir(dir: string, opts: { fresh?: boolean } = {}): Promise<VaultEntry[]> {
    if (!opts.fresh) {
        const hit = listCache.get(dir);
        if (hit && Date.now() - hit.at < LIST_TTL_MS) return hit.entries;
        const pending = inFlight.get(dir);
        if (pending) return pending;
    }

    const job = (async () => {
        const dbx = getDbx();
        const entries: VaultEntry[] = [];
        let response = await dbx.filesListFolder({ path: dir, limit: 500 });
        entries.push(...(response.result.entries as any[]).map(toEntry));
        while (response.result.has_more) {
            response = await dbx.filesListFolderContinue({ cursor: response.result.cursor });
            entries.push(...(response.result.entries as any[]).map(toEntry));
        }
        const result = entries;
        listCache.set(dir, { at: Date.now(), entries: result });
        return result;
    })().finally(() => inFlight.delete(dir));

    inFlight.set(dir, job);
    return job;

    function toEntry(e: files.Metadata): VaultEntry {
        const f = e as files.FileMetadata;
        return {
            name: e.name,
            path_lower: e.path_lower || '',
            server_modified: f.server_modified || null,
            size: typeof f.size === 'number' ? f.size : null,
        };
    }
}

export function invalidateVaultList(dir?: string) {
    if (dir) listCache.delete(dir);
    else listCache.clear();
}

// ── Read / write ───────────────────────────────────────────────────────────────
async function binaryToBuffer(data: unknown): Promise<Buffer> {
    if (Buffer.isBuffer(data)) return data;
    if (data instanceof Uint8Array) return Buffer.from(data);
    if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
        return Buffer.from(new Uint8Array(await data.arrayBuffer()));
    }
    throw new Error('Unsupported binary payload from filesDownload');
}

export async function readVaultText(path: string): Promise<string> {
    const dbx = getDbx();
    const res = await dbx.filesDownload({ path } as any);
    const buf = await binaryToBuffer((res.result as any).fileBinary);
    return buf.toString('utf8');
}

export async function readVaultJson<T>(path: string): Promise<T | null> {
    try {
        return JSON.parse(await readVaultText(path)) as T;
    } catch {
        return null;
    }
}

export async function writeVaultText(path: string, contents: string): Promise<void> {
    await ensureVaultFolders();
    const dbx = getDbx();
    await dbx.filesUpload({
        path,
        contents,
        mode: { '.tag': 'overwrite' },
        mute: true,
    } as any);
    invalidateVaultList();
}

export async function writeVaultJson(path: string, data: unknown): Promise<void> {
    await writeVaultText(path, JSON.stringify(data, null, 2));
}

export async function deleteVaultPath(path: string): Promise<void> {
    const dbx = getDbx();
    await dbx.filesDeleteV2({ path } as any);
    invalidateVaultList();
}

// Short-lived (~4h), unguessable link — same mechanism as music streaming.
export async function vaultTempLink(path: string): Promise<string> {
    const dbx = getDbx();
    const res = await dbx.filesGetTemporaryLink({ path } as any);
    return res.result.link;
}

// ── Chunked upload sessions (large files) ──────────────────────────────────────
export function startUploadSession(firstChunk: Buffer): Promise<string> {
    const dbx = getDbx();
    return dbx
        .filesUploadSessionStart({ contents: firstChunk, close: false } as any)
        .then(r => r.result.session_id);
}

export function appendUploadSession(sessionId: string, offset: number, chunk: Buffer, close = false): Promise<void> {
    const dbx = getDbx();
    return dbx
        .filesUploadSessionAppendV2({
            cursor: { session_id: sessionId, offset },
            contents: chunk,
            close,
        } as any)
        .then(() => undefined);
}

export async function finishUploadSession(
    sessionId: string,
    offset: number,
    finalChunk: Buffer,
    commitPath: string
): Promise<void> {
    await ensureVaultFolders();
    const dbx = getDbx();
    await dbx.filesUploadSessionFinish({
        cursor: { session_id: sessionId, offset },
        contents: finalChunk,
        commit: { path: commitPath, mode: { '.tag': 'overwrite' }, mute: true },
    } as any);
    invalidateVaultList();
}

// ── Name safety ────────────────────────────────────────────────────────────────
// Slugs/filenames arrive from URLs and form fields — never trust them.
export function slugify(input: string, maxLength = 80): string {
    return input
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, maxLength)
        .replace(/-+$/g, '');
}

export function safeFilename(input: string, maxLength = 120): string {
    return input
        .replace(/[/\\<>:"|?*\u0000-\u001f]/g, '')
        .replace(/\.\./g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength)
        || 'unnamed';
}
