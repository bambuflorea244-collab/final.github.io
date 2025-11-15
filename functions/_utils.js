// ---------- AUTH ----------
export function requireAuth(c) {
  const auth = c.req.header("x-auth");
  const master = c.env.MASTER_PASSWORD;

  if (!auth || auth !== master) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return null; // Means OK
}


// ---------- DATABASE HELPERS ----------
export async function getSetting(c, key) {
  const db = c.env.private_ai_db;
  const row = await db.prepare(
    "SELECT value FROM settings WHERE key = ?"
  ).bind(key).first();

  return row?.value ?? null;
}


export async function setSetting(c, key, value) {
  const db = c.env.private_ai_db;
  await db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) " +
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(key, value).run();

  return true;
}


// ---------- ATTACHMENT HELPERS ----------
export async function getAttachmentsMeta(c, chat_id) {
  const db = c.env.private_ai_db;

  return await db.prepare(
    `SELECT id, name, mime_type, r2_key, created_at
     FROM attachments
     WHERE chat_id = ?`
  ).bind(chat_id).all();
}


// ---------- BINARY UTIL ----------
export function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}


// ---------- SMALL UTIL ----------
export function jsonError(c, message, code = 400) {
  return c.json({ error: message }, code);
}
