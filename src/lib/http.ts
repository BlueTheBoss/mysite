// Small helpers shared by the API endpoints.

export function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...headers },
    });
}

// Parses a JSON body with the same 32 KB cap express.json() used to enforce.
// Returns null for missing/oversized/malformed bodies.
export async function readJson(request: Request, maxBytes = 32 * 1024): Promise<Record<string, any> | null> {
    const declared = Number(request.headers.get('content-length') || '0');
    if (declared > maxBytes) return null;
    let text: string;
    try {
        text = await request.text();
    } catch {
        return null;
    }
    if (text.length > maxBytes) return null;
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}
