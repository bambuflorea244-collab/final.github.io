import { requireAuth } from "../../_utils";

export async function onRequestGet(context) {
  const { env, request } = context;

  const auth = await requireAuth(env, request);
  if (!auth.ok) return auth.response;

  try {
    const { results } = await env.DB.prepare(
      "SELECT id, title, created_at FROM chats ORDER BY created_at DESC"
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
    const id = crypto.randomUUID();
    const title = "Untitled chat";

    await env.DB.prepare(
      "INSERT INTO chats (id, title) VALUES (?, ?)"
    ).bind(id, title).run();

    return Response.json({ id, title });
  } catch (err) {
    console.error("POST /api/chats error", err);
    return new Response("Failed to create chat", { status: 500 });
  }
}
