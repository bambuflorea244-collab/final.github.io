const MODEL = "gemini-2.5-flash"; // change here if you want another model

async function getMessages(env, chatId, limit = 40) {
  const { results } = await env.DB.prepare(
    "SELECT role, content, created_at FROM messages WHERE chat_id=? ORDER BY created_at ASC LIMIT ?"
  )
    .bind(chatId, limit)
    .all();
  return results || [];
}

async function storeMessage(env, chatId, role, content) {
  await env.DB.prepare(
    "INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)"
  )
    .bind(chatId, role, content)
    .run();
}

export async function onRequestGet(context) {
  const { env, params } = context;
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
  const { env, params, request } = context;
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

    // Build Gemini contents[] from history
    const contents = history.map((m) => ({
      role: m.role === "model" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    // Add latest user message explicitly (it is already in DB but we want to be sure it's included)
    contents.push({
      role: "user",
      parts: [{ text: message }]
    });

    const body = {
      model: MODEL,
      contents
    };

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY
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
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n") ||
      "";

    // store model reply
    await storeMessage(env, chatId, "model", reply);

    return Response.json({ reply });
  } catch (err) {
    console.error("POST /api/chats/:id/messages error", err);
    return new Response("Failed to process message", { status: 500 });
  }
}
