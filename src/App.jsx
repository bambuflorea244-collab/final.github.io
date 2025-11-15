import React, { useEffect, useState } from "react";

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}

async function apiFetch(path, token, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(path, { ...options, headers });
}

export default function App() {
  const [authToken, setAuthToken] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authError, setAuthError] = useState("");

  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loadingChats, setLoadingChats] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [geminiSet, setGeminiSet] = useState(false);
  const [pythonSet, setPythonSet] = useState(false);
  const [geminiInput, setGeminiInput] = useState("");
  const [pythonInput, setPythonInput] = useState("");

  const [passwordInput, setPasswordInput] = useState("");

  // ---- AUTH ----

  useEffect(() => {
    const stored = window.localStorage.getItem("authToken");
    if (!stored) {
      setAuthChecking(false);
      return;
    }

    (async () => {
      try {
        const r = await apiFetch("/api/auth/check", stored);
        if (r.ok) {
          setAuthToken(stored);
        } else {
          window.localStorage.removeItem("authToken");
        }
      } catch {
        window.localStorage.removeItem("authToken");
      } finally {
        setAuthChecking(false);
      }
    })();
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setAuthError("");

    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput })
      });

      if (!r.ok) {
        const text = await r.text();
        setAuthError(text || "Login failed");
        return;
      }

      const data = await r.json();
      window.localStorage.setItem("authToken", data.token);
      setAuthToken(data.token);
      setPasswordInput("");
    } catch (err) {
      console.error(err);
      setAuthError("Could not reach auth service.");
    }
  }

  // ---- API: chats & messages ----

  async function fetchChats() {
    if (!authToken) return;
    try {
      setLoadingChats(true);
      const res = await apiFetch("/api/chats", authToken);
      if (!res.ok) throw new Error("Failed to load chats");
      const data = await res.json();
      setChats(data);
    } catch (err) {
      console.error(err);
      setError("Could not load chats. Check D1 binding & schema.");
    } finally {
      setLoadingChats(false);
    }
  }

  async function createChat() {
    setError("");
    if (!authToken) return;

    try {
      const res = await apiFetch("/api/chats", authToken, { method: "POST" });
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
    if (!authToken) return;

    try {
      const res = await apiFetch(`/api/chats/${chatId}/messages`, authToken);
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
    if (!activeChatId || !authToken) return;
    const text = input.trim();
    if (!text || sending) return;
    setError("");
    setSending(true);

    const tempUser = {
      id: "temp-user-" + Date.now(),
      role: "user",
      content: text,
      created_at: Math.floor(Date.now() / 1000)
    };
    setMessages((prev) => [...prev, tempUser]);
    setInput("");

    try {
      const res = await apiFetch(
        `/api/chats/${activeChatId}/messages`,
        authToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text })
        }
      );
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
        "Sending to Gemini failed. Check Settings → Gemini API key."
      );
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (!authToken) return;
    fetchChats();
  }, [authToken]);

  useEffect(() => {
    if (!activeChatId || !authToken) return;
    loadMessages(activeChatId);
  }, [activeChatId, authToken]);

  // ---- SETTINGS ----

  async function openSettings() {
    if (!authToken) return;
    setSettingsOpen(true);
    setSettingsLoading(true);
    setSettingsSaving(false);
    setError("");
    try {
      const r = await apiFetch("/api/settings", authToken);
      if (!r.ok) throw new Error("Failed to load settings");
      const data = await r.json();
      setGeminiSet(data.geminiApiKeySet);
      setPythonSet(data.pythonAnywhereKeySet);
      setGeminiInput("");
      setPythonInput("");
    } catch (err) {
      console.error(err);
      setError("Could not load settings.");
    } finally {
      setSettingsLoading(false);
    }
  }

  async function saveSettings(e) {
    e.preventDefault();
    if (!authToken) return;
    setSettingsSaving(true);
    setError("");
    try {
      const payload = {};
      if (geminiInput.trim()) payload.geminiApiKey = geminiInput.trim();
      if (pythonInput.trim()) payload.pythonAnywhereKey = pythonInput.trim();

      const r = await apiFetch("/api/settings", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!r.ok) throw new Error("Failed to save settings");

      if (geminiInput.trim()) setGeminiSet(true);
      if (pythonInput.trim()) setPythonSet(true);
      setGeminiInput("");
      setPythonInput("");
      setSettingsOpen(false);
    } catch (err) {
      console.error(err);
      setError("Could not save settings.");
    } finally {
      setSettingsSaving(false);
    }
  }

  // ---- RENDER ----

  if (authChecking) {
    return (
      <div className="lock-screen">
        <div className="lock-card">
          <div className="modal-title">Checking access…</div>
          <div className="modal-subtitle">
            Validating your private session.
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {!authToken && (
        <div className="lock-screen">
          <div className="lock-card">
            <div className="modal-title">Private Vault</div>
            <div className="modal-subtitle">
              This console is protected. Enter your access password.
            </div>
            {authError && (
              <div
                style={{
                  borderRadius: 10,
                  border: "1px solid rgba(255,66,103,0.7)",
                  background: "rgba(80,8,26,0.75)",
                  padding: "6px 8px",
                  fontSize: 12,
                  marginBottom: 8
                }}
              >
                <strong>Error:</strong> {authError}
              </div>
            )}
            <form onSubmit={handleLogin}>
              <div className="modal-field">
                <label>Password</label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter password"
                />
              </div>
              <div className="modal-footer">
                <button type="submit" className="btn btn-primary">
                  Unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
              <div style={{ fontSize: 12, color: "#b68488" }}>
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
                <span className="icon">🔥</span>
                <span style={{ flex: 1, overflow: "hidden" }}>
                  {c.title || `Chat ${c.id.slice(0, 6)}`}
                </span>
              </button>
            ))}
          </div>

          <div className="sidebar-footer">
            <div className="key-pill">
              <span>🔐</span>
              <span>API keys stored server-side in Cloudflare D1.</span>
            </div>
            <div>Protected externally by Cloudflare Access (email login).</div>
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
              <button
                className="btn btn-sm settings-button"
                onClick={openSettings}
              >
                ⚙ Settings
              </button>
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
                  border: "1px solid rgba(255,66,103,0.6)",
                  background: "rgba(80,8,26,0.8)",
                  padding: "8px 10px",
                  fontSize: 12,
                  marginBottom: 10
                }}
              >
                <strong style={{ color: "#ffd0dd" }}>Error:</strong> {error}
              </div>
            )}

            {!activeChatId && (
              <div className="empty-state">
                <div>
                  <div style={{ marginBottom: 8 }}>
                    This space is only for you (Cloudflare Access + password).
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
                  🔥 Memory: stored in D1 per chat
                </span>
                <span>SHIFT+ENTER for new line</span>
              </div>
            </form>
          </div>
        </main>
      </div>

      {/* SETTINGS MODAL */}
      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Settings</div>
            <div className="modal-subtitle">
              Paste your API keys once. They’re stored server-side and hidden
              afterwards.
            </div>

            {settingsLoading ? (
              <div>Loading…</div>
            ) : (
              <form onSubmit={saveSettings}>
                <div className="modal-field">
                  <label>Gemini API key</label>
                  <input
                    type="password"
                    value={geminiInput}
                    onChange={(e) => setGeminiInput(e.target.value)}
                    placeholder={
                      geminiSet ? "•••••••••••• (already set)" : "Paste key…"
                    }
                  />
                </div>
                <div className="modal-field">
                  <label>PythonAnywhere API key</label>
                  <input
                    type="password"
                    value={pythonInput}
                    onChange={(e) => setPythonInput(e.target.value)}
                    placeholder={
                      pythonSet ? "•••••••••••• (already set)" : "Paste key…"
                    }
                  />
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setSettingsOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={settingsSaving}
                  >
                    {settingsSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
