import { io } from "socket.io-client";

let socket = null;

export function connectSocket(token) {
  if (socket?.connected) return socket;

  socket = io("http://localhost:5000", {
    auth: { token },
  });

  socket.on("connect", () => {
    console.log("Socket connected");
  });

  socket.on("connect_error", (err) => {
    console.error("Socket connection error:", err.message);
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
