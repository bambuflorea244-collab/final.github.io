import { requireAuth, getAttachmentsMeta, arrayBufferToBase64 } from "../../../_utils";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB

export async function onRequestGet(context) {
  const { env, request, params } = context;
  const auth = await requireAuth(env, request);
  if (!auth.ok) return auth.response;

  const chatId = params.id;

  try {
    const chat = await env.DB.prepare(
      "SELECT id FROM chats WHERE id=?"
    ).bind(chatId).first();
    if (!chat) {
      return new Response("Chat not found", { status: 404 });
    }

    const attachments = await getAttachmentsMeta(env, chatId);
    return Response.json(attachments);
  } catch (err) {
    console.error("GET /attachments error", err);
    return new Response("Failed to fetch attachments", { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { env, request, params } = context;
  const auth = await requireAuth(env, request);
  if (!auth.ok) return auth.response;

  const chatId = params.id;

  try {
    const chat = await env.DB.prepare(
      "SELECT id FROM chats WHERE id=?"
    ).bind(chatId).first();
    if (!chat) {
      return new Response("Chat not found", { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return new Response("No file uploaded", { status: 400 });
    }

    const size = file.size;
    if (size > MAX_FILE_BYTES) {
      return new Response("File too large (max 15MB)", { status: 400 });
    }

    const mime = file.type || "application/octet-stream";
    const name = file.name || "file";

    const key = `${chatId}/${Date.now()}-${name}`;

    const buffer = await file.arrayBuffer();
    await env.FILES.put(key, buffer);

    await env.DB.prepare(
      "INSERT INTO attachments (chat_id, name, mime_type, r2_key) VALUES (?, ?, ?, ?)"
    ).bind(chatId, name, mime, key).run();

    const { lastRowId } = await env.DB.prepare(
      "SELECT last_insert_rowid() AS id"
    ).first();

    return Response.json({
      id: lastRowId,
      chat_id: chatId,
      name,
      mime_type: mime,
      r2_key: key
    });
  } catch (err) {
    console.error("POST /attachments error", err);
    return new Response("Failed to upload attachment", { status: 500 });
  }
}
