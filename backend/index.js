import "dotenv/config";
import connectDB from "./config/database.config.js";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import authRoutes from "./routes/auth.routes.js";
import chatRouter from "./routes/chat.routes.js";
import Chat from "./models/chat.model.js";
import User from "./models/user.model.js";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use("/api/auth", authRoutes);
app.use("/api/chats", chatRouter);

// Socket.IO auth middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication error"));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (!user) return next(new Error("User not found"));

    socket.user = user;
    next();
  } catch (error) {
    next(new Error("Authentication error"));
  }
});

// Online users tracking
const onlineUsers = new Map(); // userId -> socketId

io.on("connection", (socket) => {
  const userId = socket.user._id.toString();
  onlineUsers.set(userId, socket.id);

  // Broadcast online status
  io.emit("user-online", userId);
  socket.emit("online-users", Array.from(onlineUsers.keys()));

  // Join a chat room
  socket.on("join-chat", (chatId) => {
    socket.join(chatId);
  });

  socket.on("leave-chat", (chatId) => {
    socket.leave(chatId);
  });

  // Handle new encrypted message
  socket.on("send-message", async (data) => {
    try {
      const { chatId, content, iv } = data;

      const chat = await Chat.findOne({
        _id: chatId,
        participants: socket.user._id,
      });

      if (!chat) return;

      const message = {
        sender: socket.user._id,
        content,
        iv,
        timestamp: new Date(),
      };

      chat.messages.push(message);
      await chat.save();

      const savedChat = await Chat.findById(chat._id)
        .populate("messages.sender", "username _id");

      const savedMessage = savedChat.messages[savedChat.messages.length - 1];

      io.to(chatId).emit("new-message", {
        chatId,
        message: savedMessage,
      });
    } catch (error) {
      console.error("Socket send-message error:", error);
    }
  });

  // Typing indicators
  socket.on("typing", (chatId) => {
    socket.to(chatId).emit("user-typing", {
      chatId,
      username: socket.user.username,
    });
  });

  socket.on("stop-typing", (chatId) => {
    socket.to(chatId).emit("user-stop-typing", { chatId });
  });

  socket.on("disconnect", () => {
    onlineUsers.delete(userId);
    io.emit("user-offline", userId);
  });
});

connectDB();

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});