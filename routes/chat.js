import { Router } from "express";
import chat from "../controller/chat/chatController.js";
const router = Router();

// 1. Put STATIC routes FIRST
router.route("/create").post((req, res, next) => {
  const c = new chat();
  return c.createChat(req, res, next);
});


router.route("/clear").post((req, res, next) => {
  const c = new chat();
  return c.clearChat(req, res, next);
});
router.route("/message/delete/:message_id").delete((req, res, next) => {
  const c = new chat();
  return c.deleteChatMessage(req, res, next);
});

router.route("/single/:chat_id").get((req, res, next) => {
  const c = new chat();
  return c.getMyChatMessages(req, res, next);
});
router.route("/list").get((req, res, next) => {
  const c = new chat();
  return c.myAllChatsWithUnread(req, res, next);
});

export default router;