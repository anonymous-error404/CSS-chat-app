import Chat from "../models/chat.model.js";
import User from "../models/user.model.js";

// Find or create a 1-on-1 chat with another user
export const findOrCreateChat = async (req, res) => {
  try {
    const { recipientId } = req.body;

    if (!recipientId) {
      return res.status(400).json({ message: "Recipient ID is required" });
    }

    if (recipientId === req.user._id.toString()) {
      return res.status(400).json({ message: "Cannot chat with yourself" });
    }

    const recipient = await User.findById(recipientId).select("username email publicKey _id");
    if (!recipient) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if a chat already exists between these two
    let chat = await Chat.findOne({
      participants: { $all: [req.user._id, recipientId], $size: 2 },
    })
      .populate("participants", "username email publicKey _id")
      .populate("messages.sender", "username _id");

    if (!chat) {
      chat = new Chat({
        participants: [req.user._id, recipientId],
        messages: [],
      });
      await chat.save();
      await chat.populate("participants", "username email publicKey _id");
    }

    res.json(chat);
  } catch (error) {
    console.error("Find or create chat error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get all chats for the current user
export const getChats = async (req, res) => {
  try {
    const chats = await Chat.find({
      participants: req.user._id,
    })
      .populate("participants", "username email publicKey _id")
      .sort({ updatedAt: -1 });

    // Return chats with last message info (don't send all messages for the list)
    const chatList = chats.map((chat) => {
      const other = chat.participants.find(
        (p) => p._id.toString() !== req.user._id.toString()
      );
      const lastMsg = chat.messages[chat.messages.length - 1] || null;
      return {
        _id: chat._id,
        participant: other,
        lastMessage: lastMsg
          ? { content: lastMsg.content, iv: lastMsg.iv, timestamp: lastMsg.timestamp, sender: lastMsg.sender }
          : null,
        updatedAt: chat.updatedAt,
        messageCount: chat.messages.length,
      };
    });

    res.json(chatList);
  } catch (error) {
    console.error("Get chats error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get a specific chat with all messages
export const getChat = async (req, res) => {
  try {
    const chat = await Chat.findOne({
      _id: req.params.chatId,
      participants: req.user._id,
    })
      .populate("participants", "username email publicKey _id")
      .populate("messages.sender", "username _id");

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    res.json(chat);
  } catch (error) {
    console.error("Get chat error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Send a message (already encrypted on client)
export const sendMessage = async (req, res) => {
  try {
    const { content, iv } = req.body;

    if (!content || !iv) {
      return res.status(400).json({ message: "Encrypted content and IV are required" });
    }

    const chat = await Chat.findOne({
      _id: req.params.chatId,
      participants: req.user._id,
    });

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    const message = {
      sender: req.user._id,
      content,
      iv,
      timestamp: new Date(),
    };

    chat.messages.push(message);
    await chat.save();

    const savedChat = await Chat.findById(chat._id)
      .populate("messages.sender", "username _id");

    const savedMessage = savedChat.messages[savedChat.messages.length - 1];

    res.status(201).json(savedMessage);
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
