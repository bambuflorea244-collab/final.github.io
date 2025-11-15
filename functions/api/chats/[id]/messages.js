import { requireAuth, getSetting } from "../../../_utils";

const MODEL = "gemini-2.5-flash";

async function getMessages(env, chatId, limit = 40) {
  const { results } = await env.DB.prepare(
    "SELECT role, content, created_at FROM messages WHERE chat_id=? " +
    "ORDER BY created_at ASC LIMIT ?"
  ).bind(chatId, limit).all();
  return results || [];
}

async function storeMessage(env, chatId, role, content) {
  await env.DB.prepare(
    "INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)"
  ).bind(chatId, role, content).run();
}

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

    const messages = await getMessages(env, chatId, 200);
    return Response.json(messages);
  } catch (err) {
    console.error("GET /api/chats/:id/messages error", err);
    return new Response("Failed to fetch messages", { status: 500 });
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

    const { message } = await request.json();
    if (!message || typeof message !== "string") {
      return new Response("Invalid 'message' payload", { status: 400 });
    }

    // store user message
    await storeMessage(env, chatId, "user", message);

    const history = await getMessages(env, chatId, 40);

    const contents = history.map((m) => ({
      role: m.role === "model" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    contents.push({
      role: "user",
      parts: [{ text: message }]
    });

    // Get Gemini API key from settings
    const apiKey = await getSetting(env, "gemini_api_key");
    if (!apiKey) {
      return new Response(
        "Gemini API key not set. Go to Settings and save it first.",
        { status: 500 }
      );
    }

    const body = { model: MODEL, contents };

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify(body)
      }
    );

    if (!r.ok) {
      const text = await r.text();
      console.error("Gemini error", r.status, text);
      return new Response("Gemini API error: " + text, { status: 500 });
    }

    const data = await r.json();
    const reply =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || "")
        .join("\n") || "";

    await storeMessage(env, chatId, "model", reply);

    return Response.json({ reply });
  } catch (err) {
    console.error("POST /api/chats/:id/messages error", err);
    return new Response("Failed to process message", { status: 500 });
  }
}
