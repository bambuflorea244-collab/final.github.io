// Shared helpers for auth and settings and attachments

export async function requireAuth(env, request) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return { ok: false, response: new Response("Unauthorized", { status: 401 }) };
  }

  const session = await env.DB.prepare(
    "SELECT token FROM sessions WHERE token = ?"
  ).bind(token).first();

  if (!session) {
    return { ok: false, response: new Response("Unauthorized", { status: 401 }) };
  }

  return { ok: true, token };
}

export async function getSetting(env, key) {
  const row = await env.DB.prepare(
    "SELECT value FROM settings WHERE key = ?"
  ).bind(key).first();
  return row ? row.value : null;
}

export async function setSetting(env, key, value) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    "INSERT INTO settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
  )
    .bind(key, value, now, now)
    .run();
}

// ---- attachments helpers ----

export async function getAttachmentsMeta(env, chatId) {
  const { results } = await env.DB.prepare(
    "SELECT id, name, mime_type, r2_key, created_at FROM attachments WHERE chat_id=? ORDER BY created_at ASC"
  ).bind(chatId).all();
  return results || [];
}

// convert ArrayBuffer -> base64 (for inline image data)
export function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
