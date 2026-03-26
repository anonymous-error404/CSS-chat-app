import { useState, useEffect, useRef, useCallback } from "react";
import { chatAPI, authAPI } from "../utils/api";
import {
  getOrDeriveKey,
  encryptMessage,
  decryptMessage,
  hasKeyPair,
  generateKeyPair,
} from "../utils/crypto";
import { connectSocket, getSocket, disconnectSocket } from "../utils/socket";

export default function ChatLayout({ user, onLogout }) {
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [activeChatData, setActiveChatData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [typingChat, setTypingChat] = useState(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const searchTimerRef = useRef(null);

  // ── Init ──
  useEffect(() => {
    initApp();

    return () => {
      disconnectSocket();
    };
  }, []);

  const initApp = async () => {
    // Ensure key pair exists
    if (!hasKeyPair()) {
      const pubKey = await generateKeyPair();
      await authAPI.updatePublicKey(pubKey);
    }

    // Connect socket
    const token = localStorage.getItem("token");
    if (token) connectSocket(token);

    // Load chats
    loadChats();
  };

  // ── Socket listeners ──
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onNewMessage = async (data) => {
      const { chatId, message } = data;

      // Update chat list
      setChats((prev) => {
        const idx = prev.findIndex((c) => c._id === chatId);
        if (idx === -1) {
          // New chat appeared — reload list
          loadChats();
          return prev;
        }
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          lastMessage: {
            content: message.content,
            iv: message.iv,
            timestamp: message.timestamp,
            sender: message.sender,
          },
          updatedAt: message.timestamp,
        };
        // Move to top
        const [chat] = updated.splice(idx, 1);
        updated.unshift(chat);
        return updated;
      });

      // If this is the active chat, add decrypted message
      if (chatId === activeChat) {
        const otherUser = activeChatData?.participants.find(
          (p) => p._id !== user.id
        );
        if (otherUser?.publicKey) {
          const key = await getOrDeriveKey(otherUser.publicKey, otherUser._id);
          const decrypted = await decryptMessage(key, message.content, message.iv);
          setMessages((prev) => [...prev, { ...message, decryptedContent: decrypted }]);
        } else {
          setMessages((prev) => [...prev, { ...message, decryptedContent: message.content }]);
        }
      }
    };

    const onTyping = ({ chatId, username }) => {
      setTypingChat({ chatId, username });
      setTimeout(() => setTypingChat(null), 3000);
    };

    const onStopTyping = () => setTypingChat(null);

    const onUserOnline = (userId) => {
      setOnlineUsers((prev) => new Set([...prev, userId]));
    };

    const onUserOffline = (userId) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    };

    const onOnlineUsers = (userIds) => {
      setOnlineUsers(new Set(userIds));
    };

    socket.on("new-message", onNewMessage);
    socket.on("user-typing", onTyping);
    socket.on("user-stop-typing", onStopTyping);
    socket.on("user-online", onUserOnline);
    socket.on("user-offline", onUserOffline);
    socket.on("online-users", onOnlineUsers);

    return () => {
      socket.off("new-message", onNewMessage);
      socket.off("user-typing", onTyping);
      socket.off("user-stop-typing", onStopTyping);
      socket.off("user-online", onUserOnline);
      socket.off("user-offline", onUserOffline);
      socket.off("online-users", onOnlineUsers);
    };
  }, [activeChat, activeChatData, user.id]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Load chats ──
  const loadChats = async () => {
    try {
      const data = await chatAPI.getAll();
      setChats(data);
    } catch (err) {
      console.error("Load chats:", err);
    }
  };

  // ── Search users ──
  const handleSearch = (query) => {
    setSearchQuery(query);

    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await authAPI.searchUsers(query);
        setSearchResults(results);
      } catch (err) {
        console.error("Search:", err);
      }
    }, 300);
  };

  // ── Start / Open Chat ──
  const startChat = async (recipientId) => {
    setLoading(true);
    setSearchQuery("");
    setSearchResults([]);
    setIsSearching(false);

    try {
      const chat = await chatAPI.findOrCreate(recipientId);
      await openChat(chat._id);
      loadChats();
    } catch (err) {
      console.error("Start chat:", err);
    } finally {
      setLoading(false);
    }
  };

  const openChat = async (chatId) => {
    const socket = getSocket();
    if (activeChat) socket?.emit("leave-chat", activeChat);

    setActiveChat(chatId);
    setIsMobileOpen(true);

    socket?.emit("join-chat", chatId);

    try {
      const data = await chatAPI.getOne(chatId);
      setActiveChatData(data);

      const otherUser = data.participants.find((p) => p._id !== user.id);

      // Derive key and decrypt messages
      let decryptedMsgs = [];
      if (otherUser?.publicKey) {
        const key = await getOrDeriveKey(otherUser.publicKey, otherUser._id);
        decryptedMsgs = await Promise.all(
          data.messages.map(async (msg) => ({
            ...msg,
            decryptedContent: await decryptMessage(key, msg.content, msg.iv),
          }))
        );
      } else {
        decryptedMsgs = data.messages.map((msg) => ({
          ...msg,
          decryptedContent: "[waiting for encryption keys]",
        }));
      }

      setMessages(decryptedMsgs);
    } catch (err) {
      console.error("Open chat:", err);
    }
  };

  // ── Send Message ──
  const sendMessage = async () => {
    if (!messageText.trim() || !activeChat || !activeChatData) return;

    const otherUser = activeChatData.participants.find((p) => p._id !== user.id);
    if (!otherUser?.publicKey) return;

    try {
      const key = await getOrDeriveKey(otherUser.publicKey, otherUser._id);
      const { content, iv } = await encryptMessage(key, messageText.trim());

      const socket = getSocket();
      socket?.emit("send-message", { chatId: activeChat, content, iv });
      socket?.emit("stop-typing", activeChat);

      setMessageText("");
    } catch (err) {
      console.error("Send:", err);
    }
  };

  const handleTyping = () => {
    const socket = getSocket();
    if (!socket || !activeChat) return;

    socket.emit("typing", activeChat);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("stop-typing", activeChat);
    }, 2000);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Helpers ──
  const getInitials = (name) => (name || "?")[0].toUpperCase();

  const getAvatarColor = (name) => {
    const hash = (name || "x").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    return `avatar-color-${hash % 6}`;
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatChatTime = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    const dayMs = 86400000;

    if (diff < dayMs && d.getDate() === now.getDate()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    if (diff < dayMs * 2) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const getOtherUser = useCallback(
    (chat) => chat.participant,
    []
  );

  const getChatOtherUser = useCallback(() => {
    if (!activeChatData) return null;
    return activeChatData.participants.find((p) => p._id !== user.id);
  }, [activeChatData, user.id]);

  const otherUser = getChatOtherUser();

  return (
    <div className="app-wrapper">
      <div className={`chat-layout ${isMobileOpen ? "chat-open" : ""}`}>
        {/* ═══ SIDEBAR ═══ */}
        <div className="sidebar">
          {/* Sidebar Header */}
          <div className="sidebar-header">
            <div className="user-section">
              <div className={`avatar avatar-sm ${getAvatarColor(user.username)}`}>
                {getInitials(user.username)}
              </div>
              <span className="username">{user.username}</span>
            </div>
            <div className="header-actions">
              <button className="icon-btn" onClick={onLogout} title="Logout" id="logout-btn">
                ⏻
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="search-container">
            <div className="search-box">
              <span className="search-icon">🔍</span>
              <input
                id="user-search"
                type="text"
                placeholder="Search or start a new chat"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Search Results or Chat List */}
          {isSearching ? (
            <div className="search-results-dropdown">
              {searchResults.length === 0 && searchQuery.length > 0 ? (
                <div className="search-info">No users found</div>
              ) : (
                searchResults.map((u) => (
                  <div
                    key={u._id}
                    className="search-result-item"
                    onClick={() => startChat(u._id)}
                  >
                    <div className={`avatar ${getAvatarColor(u.username)}`}>
                      {getInitials(u.username)}
                      {onlineUsers.has(u._id) && <span className="online-dot"></span>}
                    </div>
                    <div className="result-info">
                      <div className="result-name">{u.username}</div>
                      <div className="result-email">{u.email}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="chat-list">
              {chats.length === 0 ? (
                <div className="chat-list-empty">
                  <div className="empty-icon">💬</div>
                  <h3>No conversations yet</h3>
                  <p>Search for a username to start chatting</p>
                </div>
              ) : (
                chats.map((chat) => {
                  const other = getOtherUser(chat);
                  if (!other) return null;
                  const isActive = activeChat === chat._id;
                  const isOnline = onlineUsers.has(other._id);
                  const isTypingHere = typingChat?.chatId === chat._id;

                  return (
                    <div
                      key={chat._id}
                      className={`chat-item ${isActive ? "active" : ""}`}
                      onClick={() => openChat(chat._id)}
                    >
                      <div className={`avatar ${getAvatarColor(other.username)}`}>
                        {getInitials(other.username)}
                        {isOnline && <span className="online-dot"></span>}
                      </div>
                      <div className="chat-item-content">
                        <div className="chat-item-top">
                          <span className="chat-item-name">{other.username}</span>
                          <span className="chat-item-time">
                            {chat.lastMessage
                              ? formatChatTime(chat.lastMessage.timestamp)
                              : ""}
                          </span>
                        </div>
                        <div className="chat-item-preview">
                          {isTypingHere ? (
                            <span style={{ color: "var(--accent)" }}>typing...</span>
                          ) : chat.lastMessage ? (
                            <>
                              <span>🔒</span>
                              <span>Encrypted message</span>
                            </>
                          ) : (
                            <span>Start a conversation</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* ═══ CHAT AREA ═══ */}
        <div className="chat-area">
          {!activeChat ? (
            <div className="chat-empty-state">
              <div className="empty-illustration">💬</div>
              <h2>CryptChat Web</h2>
              <p>
                Send and receive messages with end-to-end encryption.
                Search for a username in the sidebar to start a conversation.
                <br /> Your messages stay between you and the recipient.
              </p>
              <div className="e2e-note">
                🔒 End-to-end encrypted
              </div>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="chat-header">
                <div className="chat-header-left">
                  <button
                    className="back-btn"
                    onClick={() => {
                      setIsMobileOpen(false);
                      setActiveChat(null);
                      setActiveChatData(null);
                      setMessages([]);
                    }}
                  >
                    ←
                  </button>
                  <div className={`avatar ${otherUser ? getAvatarColor(otherUser.username) : ""}`}>
                    {otherUser ? getInitials(otherUser.username) : "?"}
                    {otherUser && onlineUsers.has(otherUser._id) && (
                      <span className="online-dot"></span>
                    )}
                  </div>
                  <div className="chat-header-info">
                    <h3>{otherUser?.username || "Chat"}</h3>
                    <div
                      className={`status-text ${
                        typingChat?.chatId === activeChat
                          ? "typing"
                          : otherUser && onlineUsers.has(otherUser._id)
                          ? "online"
                          : ""
                      }`}
                    >
                      {typingChat?.chatId === activeChat
                        ? "typing..."
                        : otherUser && onlineUsers.has(otherUser._id)
                        ? "online"
                        : "offline"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="messages-container">
                <div className="e2e-banner">
                  🔒 Messages are end-to-end encrypted. No one outside of this chat can read them.
                </div>

                {messages.map((msg, idx) => {
                  const senderId = msg.sender?._id || msg.sender;
                  const isOwn = senderId === user.id;

                  // Date divider logic
                  let showDate = false;
                  if (idx === 0) showDate = true;
                  else {
                    const prevDate = new Date(messages[idx - 1].timestamp).toDateString();
                    const currDate = new Date(msg.timestamp).toDateString();
                    showDate = prevDate !== currDate;
                  }

                  return (
                    <div key={msg._id || idx}>
                      {showDate && (
                        <div className="message-date-divider">
                          {new Date(msg.timestamp).toLocaleDateString([], {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          })}
                        </div>
                      )}
                      <div className={`message ${isOwn ? "message-own" : "message-other"}`}>
                        <div className="message-bubble">
                          <span className="message-text">
                            {msg.decryptedContent || msg.content}
                          </span>
                          <span className="message-meta">
                            <span className="message-time">{formatTime(msg.timestamp)}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {typingChat?.chatId === activeChat && (
                  <div className="typing-bubble">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="message-input-area">
                <div className="message-input-wrapper">
                  <div className="message-input-box">
                    <input
                      id="message-input"
                      type="text"
                      className="message-input"
                      placeholder="Type a message"
                      value={messageText}
                      onChange={(e) => {
                        setMessageText(e.target.value);
                        handleTyping();
                      }}
                      onKeyDown={handleKeyDown}
                    />
                  </div>
                  <button
                    id="send-btn"
                    className="btn-send"
                    onClick={sendMessage}
                    disabled={!messageText.trim()}
                  >
                    ➤
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
