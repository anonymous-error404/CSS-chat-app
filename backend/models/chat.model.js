import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  iv: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const chatSchema = new mongoose.Schema({
  participants: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    validate: [arr => arr.length === 2, "Chat must have exactly 2 participants"],
  },
  messages: [messageSchema],
}, { timestamps: true });

// Ensure unique 1-on-1 chat between any two users
chatSchema.index({ participants: 1 });

const Chat = mongoose.model("Chat", chatSchema);

export default Chat;