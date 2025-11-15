// src/App.jsx
import React, { useEffect, useRef, useState } from "react";

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

// Build a tree from folders (supports multi-level)
function buildFolderTree(folders) {
  const map = new Map();
  folders.forEach((f) => {
    map.set(f.id, { ...f, children: [] });
  });
  const roots = [];
  folders.forEach((f) => {
    const node = map.get(f.id);
    if (f.parent_id && map.has(f.parent_id)) {
      map.get(f.parent_id).children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

export default function App() {
  // ---- AUTH ----
  const [authToken, setAuthToken] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authError, setAuthError] = useState("");
  const [passwordInput, setPasswordInput] = useState("");

  // ---- CORE DATA ----
  const [chats, setChats] = useState([]);
  const [folders, setFolders] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [input, setInput] = useState("");

  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // ---- GLOBAL SETTINGS (API keys) ----
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [geminiSet, setGeminiSet] = useState(false);
  const [pythonSet, setPythonSet] = useState(false);
  const [geminiInput, setGeminiInput] = useState("");
  const [pythonInput, setPythonInput] = useState("");

  // ---- DELETE CHAT CONFIRM ----
  const [confirmDelete, setConfirmDelete] = useState(null);

  // ---- NEW CHAT MODAL ----
  const [newChatModalOpen, setNewChatModalOpen] = useState(false);
  const [newChatName, setNewChatName] = useState("");
  const [newChatFolderId, setNewChatFolderId] = useState("");

  // ---- NEW FOLDER MODAL ----
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParentId, setNewFolderParentId] = useState("");

  // ---- PER-CHAT SETTINGS MODAL ----
  const [chatSettingsOpen, setChatSettingsOpen] = useState(false);
  const [chatSettings, setChatSettings] = useState(null);
  const [chatSettingsSaving, setChatSettingsSaving] = useState(false);

  const fileInputRef = useRef(null);

  // ---------- AUTH FLOW ----------

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

  // ---------- DATA FETCHING ----------

  async function fetchFolders() {
    if (!authToken) return;
    try {
      setLoadingFolders(true);
      const res = await apiFetch("/api/folders", authToken);
      if (!res.ok) throw new Error("Failed to load folders");
      const data = await res.json();
      setFolders(data);
    } catch (err) {
      console.error(err);
      setError("Could not load folders.");
    } finally {
      setLoadingFolders(false);
    }
  }

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
      setError("Could not load chats.");
    } finally {
      setLoadingChats(false);
    }
  }

  async function loadMessages(chatId) {
    if (!authToken) return;
    setError("");
    try {
      const res = await apiFetch(`/api/chats/${chatId}/messages`, authToken);
      if (!res.ok) throw new Error("Failed to load messages");
      const data = await res.json();
      setMessages(data);
    } catch (err) {
      console.error(err);
      setError("Could not load messages.");
    }
  }

  async function loadAttachments(chatId) {
    if (!authToken) return;
    setError("");
    try {
      const res = await apiFetch(
        `/api/chats/${chatId}/attachments`,
        authToken
      );
      if (!res.ok) throw new Error("Failed to load attachments");
      const data = await res.json();
      setAttachments(data);
    } catch (err) {
      console.error(err);
      setError("Could not load attachments.");
    }
  }

  // After auth, load folders & chats
  useEffect(() => {
    if (!authToken) return;
    fetchFolders();
    fetchChats();
  }, [authToken]);

  // When activeChatId changes, load its data
  useEffect(() => {
    if (!activeChatId || !authToken) return;
    loadMessages(activeChatId);
    loadAttachments(activeChatId);
  }, [activeChatId, authToken]);

  // ---------- CHAT ACTIONS ----------

  function openNewChatModal() {
    setNewChatName("");
    setNewChatFolderId("");
    setNewChatModalOpen(true);
  }

  async function submitNewChat(e) {
    e.preventDefault();
    if (!authToken) return;
    setError("");
    try {
      const res = await apiFetch("/api/chats", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newChatName || "Untitled chat",
          folderId: newChatFolderId || null
        })
      });
      if (!res.ok) throw new Error("Failed to create chat");
      const data = await res.json();
      setNewChatModalOpen(false);
      await fetchChats();
      setActiveChatId(data.id);
      await loadMessages(data.id);
      await loadAttachments(data.id);
    } catch (err) {
      console.error(err);
      setError("Could not create chat.");
    }
  }

  function openNewFolderModal() {
    setNewFolderName("");
    setNewFolderParentId("");
    setNewFolderModalOpen(true);
  }

  async function submitNewFolder(e) {
    e.preventDefault();
    if (!authToken) return;
    setError("");
    try {
      const res = await apiFetch("/api/folders", authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFolderName || "New folder",
          parentId: newFolderParentId || null
        })
      });
      if (!res.ok) throw new Error("Failed to create folder");
      await fetchFolders();
      setNewFolderModalOpen(false);
    } catch (err) {
      console.error(err);
      setError("Could not create folder.");
    }
  }

  async function deleteChat(chatId) {
    if (!authToken) return;
    setError("");
    try {
      const res = await apiFetch(
        `/api/chats/${chatId}/delete`,
        authToken,
        { method: "POST" }
      );
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Failed to delete chat");
      }
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      if (activeChatId === chatId) {
        setActiveChatId(null);
        setMessages([]);
        setAttachments([]);
      }
    } catch (err) {
      console.error(err);
      setError("Could not delete chat fully.");
    } finally {
      setConfirmDelete(null);
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

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file || !authToken || !activeChatId) return;
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await apiFetch(
        `/api/chats/${activeChatId}/attachments`,
        authToken,
        { method: "POST", body: formData }
      );
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Upload failed");
      }
      const data = await res.json();
      setAttachments((prev) => [...prev, data]);
    } catch (err) {
      console.error(err);
      setError("Could not upload file. Check R2 binding.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // ---------- GLOBAL SETTINGS ----------

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

  // ---------- PER-CHAT SETTINGS MODAL ----------

  async function openChatSettings(chatId) {
    if (!authToken || !chatId) return;
    setChatSettingsOpen(true);
    setChatSettings(null);
    setChatSettingsSaving(false);
    setError("");
    try {
      const res = await apiFetch(
        `/api/chats/${chatId}/settings`,
        authToken
      );
      if (!res.ok) throw new Error("Failed to load chat settings");
      const data = await res.json();
      setChatSettings(data);
    } catch (err) {
      console.error(err);
      setError("Could not load chat settings.");
    }
  }

  async function saveChatSettings(e) {
    e.preventDefault();
    if (!authToken || !chatSettings || !chatSettings.id) return;
    setChatSettingsSaving(true);
    setError("");
    try {
      const payload = {
        title: chatSettings.title,
        folderId: chatSettings.folder_id || null,
        systemPrompt: chatSettings.system_prompt || ""
      };

      const res = await apiFetch(
        `/api/chats/${chatSettings.id}/settings`,
        authToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      if (!res.ok) throw new Error("Failed to save chat settings");
      const data = await res.json();
      setChatSettings(data);
      await fetchChats();
      setChatSettingsOpen(false);
    } catch (err) {
      console.error(err);
      setError("Could not save chat settings.");
    } finally {
      setChatSettingsSaving(false);
    }
  }

  async function regenerateChatApiKey() {
    if (!authToken || !chatSettings || !chatSettings.id) return;
    setChatSettingsSaving(true);
    setError("");
    try {
      const res = await apiFetch(
        `/api/chats/${chatSettings.id}/settings`,
        authToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ regenerateApiKey: true })
        }
      );
      if (!res.ok) throw new Error("Failed to regenerate API key");
      const data = await res.json();
      setChatSettings(data);
    } catch (err) {
      console.error(err);
      setError("Could not regenerate API key.");
    } finally {
      setChatSettingsSaving(false);
    }
  }

  // ---------- HELPERS FOR RENDER ----------

  // group chats by folder_id
  const chatsByFolder = {};
  chats.forEach((c) => {
    const key = c.folder_id || "root";
    if (!chatsByFolder[key]) chatsByFolder[key] = [];
    chatsByFolder[key].push(c);
  });

  const folderTree = buildFolderTree(folders);

  function renderChatRow(chat) {
    return (
      <div key={chat.id} className="chat-row">
        <button
          className={
            "chat-item" + (chat.id === activeChatId ? " active" : "")
          }
          onClick={() => setActiveChatId(chat.id)}
        >
          <span className="icon">🔥</span>
          <span className="chat-title">
            {chat.title || `Chat ${chat.id.slice(0, 6)}`}
          </span>
        </button>
        <button
          className="btn btn-sm delete-chat-btn"
          onClick={() => setConfirmDelete(chat.id)}
          title="Delete chat"
        >
          🗑
        </button>
      </div>
    );
  }

  function renderFolderNode(node, depth = 0) {
    return (
      <div key={node.id}>
        <div
          className="folder-row"
          style={{ paddingLeft: 4 + depth * 12, marginTop: 4 }}
        >
          <span style={{ marginRight: 6 }}>📁</span>
          <span style={{ fontSize: 12 }}>{node.name}</span>
        </div>
        {(chatsByFolder[node.id] || []).map((chat) => renderChatRow(chat))}
        {node.children.map((child) => renderFolderNode(child, depth + 1))}
      </div>
    );
  }

  // ---------- RENDER ----------

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
              <div className="error-banner">
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

          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn btn-primary" onClick={openNewChatModal}>
              <span>＋</span> New chat
            </button>
            <button className="btn btn-sm" onClick={openNewFolderModal}>
              📁 New folder
            </button>
          </div>

          <div className="chat-list">
            {loadingFolders && <div>Loading folders…</div>}
            {loadingChats && <div>Loading chats…</div>}

            {/* Chats without folder */}
            {(chatsByFolder["root"] || []).length > 0 && (
              <>
                <div className="folder-row" style={{ marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: "#b68488" }}>
                    (No folder)
                  </span>
                </div>
                {(chatsByFolder["root"] || []).map((chat) =>
                  renderChatRow(chat)
                )}
              </>
            )}

            {/* Folder tree */}
            {folderTree.map((node) => renderFolderNode(node))}
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
                Each chat keeps its own memory and attachments.
              </div>
            </div>
            <div className="main-header-meta">
              {activeChatId && (
                <button
                  className="btn btn-sm"
                  onClick={() => openChatSettings(activeChatId)}
                >
                  🧩 Chat settings
                </button>
              )}
              <button
                className="btn btn-sm settings-button"
                onClick={openSettings}
              >
                ⚙ Global settings
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
              <div className="error-banner">
                <strong>Error:</strong> {error}
              </div>
            )}

            {!activeChatId && (
              <div className="empty-state">
                <div>
                  <div style={{ marginBottom: 8 }}>
                    This space is only for you.
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={openNewChatModal}
                  >
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
              {activeChatId && (
                <div className="attachments-row">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    ➕ Attach file / image
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: "none" }}
                    onChange={handleFileChange}
                  />
                  {attachments.map((a) => (
                    <span key={a.id} className="attachment-pill">
                      📎 {a.name}
                      <button
                        className="remove-attachment"
                        type="button"
                        onClick={() =>
                          setAttachments((prev) =>
                            prev.filter((x) => x.id !== a.id)
                          )
                        }
                        aria-label="Remove attachment"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
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
            </form>
          </div>
        </main>
      </div>

      {/* GLOBAL SETTINGS MODAL */}
      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Global settings</div>
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

      {/* NEW CHAT MODAL */}
      {newChatModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setNewChatModalOpen(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">New chat</div>
            <div className="modal-subtitle">
              Name your chat and choose a folder (optional).
            </div>
            <form onSubmit={submitNewChat}>
              <div className="modal-field">
                <label>Chat name</label>
                <input
                  value={newChatName}
                  onChange={(e) => setNewChatName(e.target.value)}
                  placeholder="e.g. Product research agent"
                />
              </div>
              <div className="modal-field">
                <label>Folder</label>
                <select
                  value={newChatFolderId}
                  onChange={(e) => setNewChatFolderId(e.target.value)}
                >
                  <option value="">(No folder)</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setNewChatModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW FOLDER MODAL */}
      {newFolderModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setNewFolderModalOpen(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">New folder</div>
            <div className="modal-subtitle">
              Folders can contain chats and other folders.
            </div>
            <form onSubmit={submitNewFolder}>
              <div className="modal-field">
                <label>Folder name</label>
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. Work / Personal"
                />
              </div>
              <div className="modal-field">
                <label>Parent folder</label>
                <select
                  value={newFolderParentId}
                  onChange={(e) => setNewFolderParentId(e.target.value)}
                >
                  <option value="">(Top level)</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setNewFolderModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CHAT SETTINGS MODAL */}
      {chatSettingsOpen && chatSettings && (
        <div
          className="modal-backdrop"
          onClick={() => setChatSettingsOpen(false)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Chat settings</div>
            <div className="modal-subtitle">
              Configure this chat’s name, folder, system prompt, and external
              API.
            </div>
            <form onSubmit={saveChatSettings}>
              <div className="modal-field">
                <label>Chat name</label>
                <input
                  value={chatSettings.title || ""}
                  onChange={(e) =>
                    setChatSettings((prev) => ({
                      ...prev,
                      title: e.target.value
                    }))
                  }
                />
              </div>
              <div className="modal-field">
                <label>Folder</label>
                <select
                  value={chatSettings.folder_id || ""}
                  onChange={(e) =>
                    setChatSettings((prev) => ({
                      ...prev,
                      folder_id: e.target.value || null
                    }))
                  }
                >
                  <option value="">(No folder)</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="modal-field">
                <label>System prompt (optional)</label>
                <textarea
                  rows={3}
                  style={{ resize: "vertical" }}
                  value={chatSettings.system_prompt || ""}
                  onChange={(e) =>
                    setChatSettings((prev) => ({
                      ...prev,
                      system_prompt: e.target.value
                    }))
                  }
                  placeholder="e.g. You are my senior Python assistant…"
                />
              </div>

              <div className="modal-field">
                <label>External API key (per chat)</label>
                <input
                  readOnly
                  value={chatSettings.api_key || ""}
                  style={{ fontFamily: "monospace", fontSize: 11 }}
                />
                <div style={{ fontSize: 11, color: "#b68488" }}>
                  Use this with <code>/api/chats/{chatSettings.id}/external</code>{" "}
                  from PythonAnywhere.
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ marginTop: 6 }}
                  onClick={regenerateChatApiKey}
                  disabled={chatSettingsSaving}
                >
                  🔁 Regenerate key
                </button>
              </div>

              <div className="modal-field">
                <label>PythonAnywhere example</label>
                <pre
                  style={{
                    background: "#050204",
                    borderRadius: 10,
                    padding: 8,
                    fontSize: 11,
                    whiteSpace: "pre-wrap"
                  }}
                >
{`import requests, base64

CHAT_ID = "${chatSettings.id}"
API_KEY = "${chatSettings.api_key || "YOUR_KEY"}"
URL = "https://YOUR_DOMAIN/api/chats/" + CHAT_ID + "/external"

payload = {
    "message": "Hello from PythonAnywhere!",
    "attachments": []
}

resp = requests.post(
    URL,
    headers={
        "X-CHAT-API-KEY": API_KEY,
        "Content-Type": "application/json",
    },
    json=payload,
)
print(resp.json()["reply"])`}
                </pre>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setChatSettingsOpen(false)}
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={chatSettingsSaving}
                >
                  {chatSettingsSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CHAT MODAL */}
      {confirmDelete && (
        <div
          className="modal-backdrop"
          onClick={() => setConfirmDelete(null)}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Delete chat?</div>
            <div className="modal-subtitle">
              This will remove the chat, its messages, and all attachments from
              storage.
            </div>
            <div className="modal-footer">
              <button
                className="btn"
                type="button"
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => deleteChat(confirmDelete)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
