import {
  findOrCreateChat,
  getChats,
  getChat,
  sendMessage,
} from "../controllers/chat.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import express from "express";

const router = express.Router();

router.use(authMiddleware);

router.post("/find-or-create", findOrCreateChat);
router.get("/", getChats);
router.get("/:chatId", getChat);
router.post("/:chatId/messages", sendMessage);

export default router;
