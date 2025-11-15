import { requireAuth, getAttachmentsMeta } from "../../../_utils";

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

    // get attachments and delete from R2
    const attachments = await getAttachmentsMeta(env, chatId);
    for (const a of attachments) {
      try {
        await env.FILES.delete(a.r2_key);
      } catch (err) {
        console.error("Failed to delete R2 object", a.r2_key, err);
      }
    }

    // delete rows in DB
    await env.DB.prepare(
      "DELETE FROM messages WHERE chat_id=?"
    ).bind(chatId).run();

    await env.DB.prepare(
      "DELETE FROM attachments WHERE chat_id=?"
    ).bind(chatId).run();

    await env.DB.prepare(
      "DELETE FROM chats WHERE id=?"
    ).bind(chatId).run();

    return Response.json({ ok: true });
  } catch (err) {
    console.error("DELETE chat error", err);
    return new Response("Failed to delete chat", { status: 500 });
  }
}
