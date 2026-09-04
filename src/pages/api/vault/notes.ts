import type { APIRoute } from 'astro';
import { isAuthenticated } from '../../../lib/security';
import { jsonResponse, readJson } from '../../../lib/http';
import { slugify } from '../../../lib/vault';
import { upsertTursoNote, deleteTursoNote } from '../../../lib/turso';

export const prerender = false;

const MAX_NOTE_BYTES = 512 * 1024; // 512 KB of markdown is plenty

function resolveSlug(provided: string | undefined, title: string): string {
    const slug = slugify(provided || title);
    return slug || `note-${Date.now()}`;
}

// POST /api/vault/notes — create or update { slug?, title, content }
export const POST: APIRoute = async ({ request }) => {
    if (!isAuthenticated(request.headers)) return jsonResponse({ error: 'Unauthorized' }, 401);

    const body = await readJson(request, 600 * 1024);
    if (!body) return jsonResponse({ error: 'Invalid request' }, 400);

    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : '';
    const content = typeof body.content === 'string' ? body.content : '';

    if (!title && !content.trim()) {
        return jsonResponse({ error: 'Empty note' }, 400);
    }

    const displayTitle = title || 'Untitled';
    const slug = resolveSlug(typeof body.slug === 'string' ? body.slug : undefined, displayTitle);

    const doc = `# ${displayTitle}\n\n${content}`;
    if (Buffer.byteLength(doc, 'utf8') > MAX_NOTE_BYTES) {
        return jsonResponse({ error: 'Note too large (max 512 KB)' }, 413);
    }

    try {
        await upsertTursoNote(slug, displayTitle, doc);
        return jsonResponse({ success: true, slug });
    } catch (err: any) {
        console.error('Turso note save failed:', err.message);
        return jsonResponse({ error: err.message || 'Database write failed' }, 502);
    }
};

// DELETE /api/vault/notes?slug=<slug>
export const DELETE: APIRoute = async ({ request }) => {
    if (!isAuthenticated(request.headers)) return jsonResponse({ error: 'Unauthorized' }, 401);

    const slug = slugify(new URL(request.url).searchParams.get('slug') || '');
    if (!slug) return jsonResponse({ error: 'Missing slug' }, 400);

    try {
        await deleteTursoNote(slug);
        return jsonResponse({ success: true });
    } catch (err: any) {
        console.error('Turso note delete failed:', err.message);
        return jsonResponse({ error: err.message || 'Database delete failed' }, 502);
    }
};
