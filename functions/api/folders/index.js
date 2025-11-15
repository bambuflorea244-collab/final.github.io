// functions/api/folders/index.js
import { requireAuth } from "../../_utils";

export async function onRequestGet(context) {
  const { env, request } = context;
  const auth = await requireAuth(env, request);
  if (!auth.ok) return auth.response;

  try {
    const { results } = await env.DB.prepare(
      "SELECT id, name, parent_id, created_at FROM folders ORDER BY created_at ASC"
    ).all();
    return Response.json(results || []);
  } catch (err) {
    console.error("GET /api/folders error", err);
    return new Response("Failed to list folders", { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const auth = await requireAuth(env, request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const name = (body.name || "").trim();
    const parentId = body.parentId || null;

    if (!name) {
      return new Response("Folder name required", { status: 400 });
    }

    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO folders (id, name, parent_id) VALUES (?, ?, ?)"
    ).bind(id, name, parentId).run();

    return Response.json({ id, name, parent_id: parentId });
  } catch (err) {
    console.error("POST /api/folders error", err);
    return new Response("Failed to create folder", { status: 500 });
  }
}
