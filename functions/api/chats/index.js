// functions/api/chats/index.js
import { requireAuth } from "../../_utils";

function generateChatApiKey() {
  // short, random per-chat key (you can make this longer if you want)
  return "chat_" + crypto.randomUUID().replace(/-/g, "");
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const auth = await requireAuth(env, request);
  if (!auth.ok) return auth.response;

  try {
    const { results } = await env.DB.prepare(
      "SELECT id, title, folder_id, created_at FROM chats ORDER BY created_at DESC"
    ).all();
    return Response.json(results || []);
  } catch (err) {
    console.error("GET /api/chats error", err);
    return new Response("Failed to list chats", { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const auth = await requireAuth(env, request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const title = (body.title || "Untitled chat").trim();
    const folderId = body.folderId || null;
    const systemPrompt = (body.systemPrompt || "").trim() || null;

    const id = crypto.randomUUID();
    const apiKey = generateChatApiKey();

    await env.DB.prepare(
      "INSERT INTO chats (id, title, folder_id, api_key, system_prompt) VALUES (?, ?, ?, ?, ?)"
    ).bind(id, title, folderId, apiKey, systemPrompt).run();

    return Response.json({ id, title, folder_id: folderId, api_key: apiKey });
  } catch (err) {
    console.error("POST /api/chats error", err);
    return new Response("Failed to create chat", { status: 500 });
  }
}
