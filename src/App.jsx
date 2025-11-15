import React, { useEffect, useState } from "react";

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}

export default function App() {
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loadingChats, setLoadingChats] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function fetchChats() {
    try {
      setLoadingChats(true);
      const res = await fetch("/api/chats");
      if (!res.ok) throw new Error("Failed to load chats");
      const data = await res.json();
      setChats(data);
    } catch (err) {
      console.error(err);
      setError("Could not load chats. Check your API / D1 config.");
    } finally {
      setLoadingChats(false);
    }
  }

  async function createChat() {
    setError("");
    try {
      const res = await fetch("/api/chats", { method: "POST" });
      if (!res.ok) throw new Error("Failed to create chat");
      const data = await res.json();
      await fetchChats();
      setActiveChatId(data.id);
      await loadMessages(data.id);
    } catch (err) {
      console.error(err);
      setError("Could not create chat.");
    }
  }

  async function loadMessages(chatId) {
    setError("");
    try {
      const res = await fetch(`/api/chats/${chatId}/messages`);
      if (!res.ok) throw new Error("Failed to load messages");
      const data = await res.json();
      setMessages(data);
    } catch (err) {
      console.error(err);
      setError("Could not load messages for this chat.");
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!activeChatId) return;
    const text = input.trim();
    if (!text || sending) return;
    setError("");
    setSending(true);

    // Optimistic user message
    const tempUser = {
      id: "temp-user-" + Date.now(),
      role: "user",
      content: text,
      created_at: Math.floor(Date.now() / 1000)
    };
    setMessages((prev) => [...prev, tempUser]);
    setInput("");

    try {
      const res = await fetch(`/api/chats/${activeChatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text })
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Failed to send message");
      }
      const data = await res.json();
      const modelMessage = {
        id: "temp-model-" + Date.now(),
        role: "model",
        content: data.reply || "",
        created_at: Math.floor(Date.now() / 1000)
      };
      setMessages((prev) => [...prev, modelMessage]);
    } catch (err) {
      console.error(err);
      setError(
        "Sending to Gemini failed. Check `GEMINI_API_KEY` and Cloudflare settings."
      );
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    fetchChats();
  }, []);

  useEffect(() => {
    if (!activeChatId) return;
    loadMessages(activeChatId);
  }, [activeChatId]);

  return (
    <div className="app-shell">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <span className="brand-title">Gemini Studio</span>
            <span className="brand-subtitle">Private Workspace</span>
          </div>
          <span className="chip">Owner only</span>
        </div>

        <button className="btn btn-primary" onClick={createChat}>
          <span>＋</span> New chat
        </button>

        <div className="chat-list">
          {loadingChats && <div>Loading chats…</div>}
          {!loadingChats && chats.length === 0 && (
            <div style={{ fontSize: 12, color: "#8d99b3" }}>
              No chats yet. Create your first conversation.
            </div>
          )}
          {chats.map((c) => (
            <button
              key={c.id}
              className={
                "chat-item" + (c.id === activeChatId ? " active" : "")
              }
              onClick={() => setActiveChatId(c.id)}
            >
              <span className="icon">💬</span>
              <span style={{ flex: 1, overflow: "hidden" }}>
                {c.title || `Chat ${c.id.slice(0, 6)}`}
              </span>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="key-pill">
            <span>🔑</span>
            <span>Set GEMINI_API_KEY in Cloudflare → Settings → Variables</span>
          </div>
          <div>Protected externally by Cloudflare Access (only your login).</div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="main">
        <div className="main-header">
          <div className="main-header-titles">
            <div className="main-title">
              {activeChatId
                ? `Chat ${activeChatId.slice(0, 6)}`
                : "Private Gemini Console"}
            </div>
            <div className="main-subtitle">
              Each chat keeps its own memory in D1. Gemini runs server-side.
            </div>
          </div>
          <div className="main-header-meta">
            <span>Model: gemini-2.5-flash</span>
            {sending && (
              <span>
                <span className="loading-dot" />
                <span className="loading-dot" />
                <span className="loading-dot" /> thinking…
              </span>
            )}
          </div>
        </div>

        <div className="messages">
          {error && (
            <div
              style={{
                borderRadius: 12,
                border: "1px solid rgba(255,92,122,0.45)",
                background: "rgba(68,12,30,0.5)",
                padding: "8px 10px",
                fontSize: 12,
                marginBottom: 10
              }}
            >
              <strong style={{ color: "#ffb3c1" }}>Error:</strong> {error}
            </div>
          )}

          {!activeChatId && (
            <div className="empty-state">
              <div>
                <div style={{ marginBottom: 8 }}>
                  This space is only for you (Cloudflare Access).
                </div>
                <button className="btn btn-primary" onClick={createChat}>
                  Start a new chat
                </button>
              </div>
            </div>
          )}

          {activeChatId &&
            messages.map((m, idx) => (
              <div key={idx} style={{ marginBottom: 4 }}>
                <div className="bubble-meta">
                  {m.role === "user" ? "You" : "Gemini"}{" "}
                  {m.created_at ? "· " + formatTime(m.created_at) : ""}
                </div>
                <div
                  className={
                    "bubble " +
                    (m.role === "user" ? "bubble-user" : "bubble-model")
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
        </div>

        <div className="composer">
          <form className="composer-inner" onSubmit={handleSend}>
            <div className="composer-row">
              <textarea
                placeholder={
                  activeChatId
                    ? "Ask Gemini anything…"
                    : "Create or select a chat first."
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={!activeChatId || sending}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!activeChatId || sending || !input.trim()}
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
            <div className="composer-footer">
              <span className="badge">
                🔐 Memory: stored in D1, per chat_id
              </span>
              <span>SHIFT+ENTER for new line</span>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
