export function getDB(env) {
    return env.private_ai_db; // <-- matches Cloudflare binding EXACTLY
}

export function getR2(env) {
    return env.R2; // <-- matches Cloudflare binding EXACTLY
}

export function getPassword(env) {
    return env.MASTER_PASSWORD; // <-- secure secret
}

export function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}
