import { requireAuth, getSetting, getAttachmentsMeta, arrayBufferToBase64 } from "../../../_utils";

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

// read up to 3 image attachments for this chat and prepare inlineData
async function buildAttachmentParts(env, chatId) {
  const attachments = await getAttachmentsMeta(env, chatId);
  const images = attachments.filter((a) => a.mime_type.startsWith("image/")).slice(0, 3);

  const parts = [];

  for (const img of images) {
    try {
      const object = await env.FILES.get(img.r2_key);
      if (!object) continue;

      const buffer = await object.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);

      parts.push({
        role: "user",
        parts: [
          { text: `Reference image: ${img.name}` },
          { inlineData: { mimeType: img.mime_type, data: base64 } }
        ]
      });
    } catch (err) {
      console.error("Error loading attachment from R2", img.r2_key, err);
    }
  }

  // for non-image attachments, just include a textual description
  const other = attachments.filter((a) => !a.mime_type.startsWith("image/")).slice(0, 5);
  if (other.length) {
    const desc = other
      .map((a) => `${a.name} (${a.mime_type})`)
      .join(", ");
    parts.push({
      role: "user",
      parts: [
        {
          text:
            "Additional attached files for this chat (consider their content if relevant): " +
            desc
        }
      ]
    });
  }

  return parts;
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

    await storeMessage(env, chatId, "user", message);

    const history = await getMessages(env, chatId, 40);
    const contents = history.map((m) => ({
      role: m.role === "model" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    // add attachments as context (images + file list)
    const attachmentParts = await buildAttachmentParts(env, chatId);
    contents.push(...attachmentParts);

    contents.push({
      role: "user",
      parts: [{ text: message }]
    });

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
