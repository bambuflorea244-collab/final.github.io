import { getSetting, setSetting } from "../../_utils";

export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    const body = await request.json();
    const password = body?.password || "";

    const expected = env.MASTER_PASSWORD;
    if (!expected) {
      return new Response("MASTER_PASSWORD is not set in environment", {
        status: 500
      });
    }

    if (password !== expected) {
      return new Response("Invalid password", { status: 401 });
    }

    // Password correct → create session token
    const token = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO sessions (token) VALUES (?)"
    ).bind(token).run();

    return Response.json({ token });
  } catch (err) {
    console.error("auth/login error", err);
    return new Response("Auth error", { status: 500 });
  }
}
