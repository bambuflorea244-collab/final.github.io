// functions/api/chats/[id]/settings.js
import { requireAuth } from "../../../_utils";

function generateChatApiKey() {
  return "chat_" + crypto.randomUUID().replace(/-/g, "");
}

export async function onRequestGet(context) {
  const { env, request, params } = context;
  const auth = await requireAuth(env, request);
  if (!auth.ok) return auth.response;

  const chatId = params.id;

  try {
    const row = await env.DB.prepare(
      "SELECT id, title, folder_id, api_key, system_prompt, created_at FROM chats WHERE id=?"
    ).bind(chatId).first();

    if (!row) {
      return new Response("Chat not found", { status: 404 });
    }

    return Response.json(row);
  } catch (err) {
    console.error("GET /api/chats/:id/settings error", err);
    return new Response("Failed to load chat settings", { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { env, request, params } = context;
  const auth = await requireAuth(env, request);
  if (!auth.ok) return auth.response;

  const chatId = params.id;

  try {
    const body = await request.json();
    const updates = [];
    const values = [];

    if (typeof body.title === "string") {
      updates.push("title=?");
      values.push(body.title.trim() || "Untitled chat");
    }

    if ("folderId" in body) {
      updates.push("folder_id=?");
      values.push(body.folderId || null);
    }

    if (typeof body.systemPrompt === "string") {
      updates.push("system_prompt=?");
      values.push(body.systemPrompt.trim() || null);
    }

    if (body.regenerateApiKey === true) {
      updates.push("api_key=?");
      values.push(generateChatApiKey());
    }

    if (!updates.length) {
      return new Response("Nothing to update", { status: 400 });
    }

    values.push(chatId);

    await env.DB.prepare(
      `UPDATE chats SET ${updates.join(", ")} WHERE id=?`
    ).bind(...values).run();

    const row = await env.DB.prepare(
      "SELECT id, title, folder_id, api_key, system_prompt, created_at FROM chats WHERE id=?"
    ).bind(chatId).first();

    return Response.json(row);
  } catch (err) {
    console.error("POST /api/chats/:id/settings error", err);
    return new Response("Failed to update chat settings", { status: 500 });
  }
}
