// functions/api/folders/[id]/index.js
import { requireAuth } from "../../../_utils";

export async function onRequestPatch(context) {
  const { env, request, params } = context;
  const auth = await requireAuth(env, request);
  if (!auth.ok) return auth.response;

  const folderId = params.id;

  try {
    const body = await request.json();
    const name = (body.name || "").trim();
    if (!name) {
      return new Response("Folder name required", { status: 400 });
    }

    await env.DB.prepare(
      "UPDATE folders SET name=? WHERE id=?"
    ).bind(name, folderId).run();

    return Response.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/folders/:id error", err);
    return new Response("Failed to rename folder", { status: 500 });
  }
}

// delete folder: move its chats to root (folder_id=NULL) and remove folder
export async function onRequestDelete(context) {
  const { env, request, params } = context;
  const auth = await requireAuth(env, request);
  if (!auth.ok) return auth.response;

  const folderId = params.id;

  try {
    // Move chats from this folder to root (no folder)
    await env.DB.prepare(
      "UPDATE chats SET folder_id=NULL WHERE folder_id=?"
    ).bind(folderId).run();

    // For simplicity, also move subfolders' parent to NULL,
    // so you don't accidentally lose nested stuff.
    await env.DB.prepare(
      "UPDATE folders SET parent_id=NULL WHERE parent_id=?"
    ).bind(folderId).run();

    await env.DB.prepare(
      "DELETE FROM folders WHERE id=?"
    ).bind(folderId).run();

    return Response.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/folders/:id error", err);
    return new Response("Failed to delete folder", { status: 500 });
  }
}
