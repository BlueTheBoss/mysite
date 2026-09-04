import 'dotenv/config';
import { createClient, type Client } from '@libsql/client';

let client: Client | null = null;

export function getTurso(): Client {
    if (client) return client;
    const url = process.env.TURSO_DATABASE_URL?.trim();
    const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

    if (!url || !authToken) {
        throw new Error('Missing Turso credentials: set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN');
    }

    client = createClient({ url, authToken });
    return client;
}

// ── Notes ──────────────────────────────────────────────────────────────────────
export interface TursoNote {
    id?: number;
    slug: string;
    title: string;
    content: string;
    created_at: string;
    updated_at: string;
}

export async function listTursoNotes(): Promise<TursoNote[]> {
    const db = getTurso();
    const rs = await db.execute('SELECT * FROM notes ORDER BY updated_at DESC');
    return rs.rows.map(r => ({
        id: Number(r.id),
        slug: String(r.slug),
        title: String(r.title),
        content: String(r.content),
        created_at: String(r.created_at),
        updated_at: String(r.updated_at),
    }));
}

export async function getTursoNote(slug: string): Promise<TursoNote | null> {
    const db = getTurso();
    const rs = await db.execute({
        sql: 'SELECT * FROM notes WHERE slug = ? LIMIT 1',
        args: [slug]
    });
    if (rs.rows.length === 0) return null;
    const r = rs.rows[0];
    return {
        id: Number(r.id),
        slug: String(r.slug),
        title: String(r.title),
        content: String(r.content),
        created_at: String(r.created_at),
        updated_at: String(r.updated_at),
    };
}

export async function upsertTursoNote(slug: string, title: string, content: string): Promise<void> {
    const db = getTurso();
    const now = new Date().toISOString();
    await db.execute({
        sql: `INSERT INTO notes (slug, title, content, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(slug) DO UPDATE SET
                title = excluded.title,
                content = excluded.content,
                updated_at = excluded.updated_at`,
        args: [slug, title, content, now, now]
    });
}

export async function deleteTursoNote(slug: string): Promise<void> {
    const db = getTurso();
    await db.execute({
        sql: 'DELETE FROM notes WHERE slug = ?',
        args: [slug]
    });
}

// ── Contacts ───────────────────────────────────────────────────────────────────
export interface TursoContact {
    id?: number;
    name: string;
    email: string;
    message: string;
    ip?: string;
    honeypot: boolean;
    created_at: string;
}

export async function insertTursoContact(contact: {
    name: string;
    email: string;
    message: string;
    ip?: string;
    honeypot?: boolean;
}): Promise<void> {
    const db = getTurso();
    const now = new Date().toISOString();
    await db.execute({
        sql: `INSERT INTO contacts (name, email, message, ip, honeypot, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
            contact.name,
            contact.email,
            contact.message,
            contact.ip || '0.0.0.0',
            contact.honeypot ? 1 : 0,
            now
        ]
    });
}

export async function listTursoContacts(limit = 100): Promise<TursoContact[]> {
    const db = getTurso();
    const rs = await db.execute({
        sql: 'SELECT * FROM contacts ORDER BY created_at DESC LIMIT ?',
        args: [limit]
    });
    return rs.rows.map(r => ({
        id: Number(r.id),
        name: String(r.name),
        email: String(r.email),
        message: String(r.message),
        ip: r.ip ? String(r.ip) : undefined,
        honeypot: Boolean(r.honeypot),
        created_at: String(r.created_at),
    }));
}

// ── Telemetry ──────────────────────────────────────────────────────────────────
export async function recordTursoView(path: string): Promise<void> {
    const db = getTurso();
    const day = new Date().toISOString().slice(0, 10);
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    await db.execute({
        sql: `INSERT INTO telemetry_views (day, path, count)
              VALUES (?, ?, 1)
              ON CONFLICT(day, path) DO UPDATE SET count = count + 1`,
        args: [day, cleanPath]
    });
}

export interface TursoTelemetrySummary {
    days: Array<{ day: string; count: number }>;
    totalViews: number;
    topRoutes: Array<{ path: string; count: number }>;
}

export async function getTursoTelemetry(limitDays = 14): Promise<TursoTelemetrySummary> {
    const db = getTurso();
    
    // Total views
    const totalRs = await db.execute('SELECT SUM(count) as total FROM telemetry_views');
    const totalViews = Number(totalRs.rows[0]?.total || 0);

    // Days aggregate
    const daysRs = await db.execute({
        sql: `SELECT day, SUM(count) as count
              FROM telemetry_views
              GROUP BY day
              ORDER BY day DESC
              LIMIT ?`,
        args: [limitDays]
    });
    const days = daysRs.rows.map(r => ({
        day: String(r.day),
        count: Number(r.count),
    })).reverse();

    // Top routes
    const routesRs = await db.execute({
        sql: `SELECT path, SUM(count) as count
              FROM telemetry_views
              GROUP BY path
              ORDER BY count DESC
              LIMIT 10`
    });
    const topRoutes = routesRs.rows.map(r => ({
        path: String(r.path),
        count: Number(r.count),
    }));

    return { days, totalViews, topRoutes };
}

import crypto from 'node:crypto';

function hashItemPin(pin: string): string {
    return crypto.createHash('sha256').update(`vault_item_pin_v1:${pin.trim()}`).digest('hex');
}

// ── Locks (Files & Folders) ────────────────────────────────────────────────────
export async function isVaultPathLocked(path: string): Promise<boolean> {
    const db = getTurso();
    const rs = await db.execute({
        sql: 'SELECT is_locked FROM vault_locks WHERE path = ? LIMIT 1',
        args: [path]
    });
    if (rs.rows.length === 0) return false;
    return Boolean(rs.rows[0].is_locked);
}

function getFallbackPin(): string | null {
    const pin = (process.env.FALLBACK_PIN || process.env.VAULT_FALLBACK_PIN || '').trim();
    return /^\d{4}$/.test(pin) ? pin : null;
}

export async function setVaultLock(path: string, locked: boolean, pin?: string): Promise<boolean> {
    const db = getTurso();
    const now = new Date().toISOString();
    const fallbackPin = getFallbackPin();
    const cleanPin = pin?.trim() || fallbackPin;
    const pinHash = (locked && cleanPin) ? hashItemPin(cleanPin) : null;
    await db.execute({
        sql: `INSERT INTO vault_locks (path, is_locked, pin_hash, locked_at)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(path) DO UPDATE SET
                is_locked = excluded.is_locked,
                pin_hash = CASE WHEN excluded.is_locked = 1 THEN excluded.pin_hash ELSE NULL END,
                locked_at = excluded.locked_at`,
        args: [path, locked ? 1 : 0, pinHash, now]
    });
    return locked;
}

export async function unlockVaultPath(path: string, enteredPin: string): Promise<{ success: boolean; error?: string }> {
    const db = getTurso();
    const cleanPin = (enteredPin || '').trim();
    if (!/^\d{4}$/.test(cleanPin)) {
        return { success: false, error: 'PIN must be exactly 4 digits' };
    }

    const rs = await db.execute({
        sql: 'SELECT is_locked, pin_hash FROM vault_locks WHERE path = ? LIMIT 1',
        args: [path]
    });
    if (rs.rows.length === 0 || !rs.rows[0].is_locked) {
        return { success: true }; // Not currently locked
    }

    const storedHash = rs.rows[0].pin_hash ? String(rs.rows[0].pin_hash) : null;
    const enteredHash = hashItemPin(cleanPin);
    const fallbackPin = getFallbackPin();

    // Unlocks if:
    // 1. PIN matches the emergency fallback from env (FALLBACK_PIN)
    // 2. PIN matches the item's stored PIN hash
    // 3. (Legacy lock without a hash)
    // NOTE: SECRET_PIN (dashboard login) does NOT unlock items.
    if (
        (fallbackPin && cleanPin === fallbackPin) ||
        (storedHash && storedHash === enteredHash) ||
        !storedHash
    ) {
        await db.execute({
            sql: 'UPDATE vault_locks SET is_locked = 0, pin_hash = NULL WHERE path = ?',
            args: [path]
        });
        return { success: true };
    }

    return { success: false, error: 'Incorrect 4-digit PIN' };
}

export async function listVaultLocks(): Promise<Record<string, boolean>> {
    const db = getTurso();
    const rs = await db.execute('SELECT path, is_locked FROM vault_locks');
    const map: Record<string, boolean> = {};
    for (const r of rs.rows) {
        if (Boolean(r.is_locked)) {
            map[String(r.path)] = true;
        }
    }
    return map;
}
