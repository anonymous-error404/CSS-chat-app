const API_BASE = "https://css-chat-app.onrender.com/api";

function getHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
  };
}

async function request(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: getHeaders(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Something went wrong");
  }

  return data;
}

// Auth
export const authAPI = {
  register: (username, email, password) =>
    request("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password }),
    }),

  login: (email, password) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  getMe: () => request("/auth/me"),

  searchUsers: (query) => request(`/auth/search?q=${encodeURIComponent(query)}`),

  updatePublicKey: (publicKey) =>
    request("/auth/public-key", {
      method: "PUT",
      body: JSON.stringify({ publicKey }),
    }),
};

// Chats
export const chatAPI = {
  findOrCreate: (recipientId) =>
    request("/chats/find-or-create", {
      method: "POST",
      body: JSON.stringify({ recipientId }),
    }),

  getAll: () => request("/chats"),

  getOne: (chatId) => request(`/chats/${chatId}`),

  sendMessage: (chatId, content, iv) =>
    request(`/chats/${chatId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, iv }),
    }),
};
