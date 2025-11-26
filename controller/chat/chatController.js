// path: controllers/chatController.js
import { Base } from "../../service/base.js";

export default class chatController extends Base {
  constructor() {
    super();
  }

  // 🔥 CREATE CHAT (only when assignment is officially assigned)
  async createChat(req, res) {
    try {
      const user_id = req._id;
      const { assignment_id } = req.body;

      if (!assignment_id) {
        this.s = 0; this.m = "assignment_id is required"; return this.send_res(res);
      }

      // 1) CHECK USER (client / interpreter)
      const user = await this.selectOne(
        `SELECT id, role FROM users WHERE id = ?`,
        [user_id]
      );

      if (!user) {
        this.s = 0; 
        this.m = "Invalid user";
         return this.send_res(res);
      }

      // 2) FETCH ASSIGNMENT DETAILS
      const assignment = await this.selectOne(
        `SELECT id, client_id, interpreter_id, status FROM assignments WHERE id = ?`,
        [assignment_id]
      );

      if (!assignment) {
        this.s = 0; this.m = "Assignment not found"; return this.send_res(res);
      }

      const { client_id, interpreter_id, status } = assignment;

      // 3) VALIDATE ALLOWED CHAT RULES
      if (!interpreter_id) {
        this.s = 0; this.m = "Chat not allowed until interpreter is assigned"; return this.send_res(res);
      }

      const allowedStatuses = [
        "assigned","in_route","started","in_progress","ongoing","completed","checked_out"
      ];
      if (!allowedStatuses.includes(status)) {
        this.s = 0; this.m = "Chat is not available for this assignment stage"; return this.send_res(res);
      }

      const hire = await this.selectOne(
        `SELECT status FROM hire_requests WHERE assignment_id = ? AND interpreter_id = ?`,
        [assignment_id, interpreter_id]
      );

      if (!hire || hire.status !== "accepted") {
        this.s = 0; this.m = "Interpreter has not accepted the hire request yet"; return this.send_res(res);
      }

      if (user_id !== client_id && user_id !== interpreter_id) {
        this.s = 0; this.m = "You are not allowed in this chat"; return this.send_res(res);
      }

      // 4) CHECK IF CHAT ALREADY EXISTS (private chat between two users)
      const existingChat = await this.selectOne(
        `SELECT id FROM chats 
         WHERE (user_one_id = ? AND user_two_id = ?) OR (user_one_id = ? AND user_two_id = ?) AND type = 'private'`,
        [client_id, interpreter_id, interpreter_id, client_id]
      );

      if (existingChat) {
        this.s = 1; this.m = "Chat already exists"; this.r = { chat_id: existingChat.id }; return this.send_res(res);
      }

      // 5) CREATE NEW CHAT
      const chatId = await this.insert(
        `INSERT INTO chats (user_one_id, user_two_id, status, type, created_at, updated_at)
         VALUES (?, ?, 'active', 'private', NOW(), NOW())`,
        [client_id, interpreter_id]
      );

      this.s = 1; this.m = "Chat created successfully"; this.r = { chat_id: chatId };
      return this.send_res(res);

    } catch (error) {
      this.s = 0; this.err = error.message; return this.send_res(res);
    }
  }

  // GET MESSAGES FOR A CHAT (skip messages user marked deleted)
  async getMyChatMessages(req, res) {
    try {
      const user_id = req._id;
      const { chat_id } = req.params;

      if (this.varify_req(req,["chat_id"])) {
        this.s = 0; this.m = "chat_id is required"; return this.send_res(res);
      }

      // Validate user is part of chat
      const chat = await this.selectOne(
        `SELECT * FROM chats WHERE id = ? AND (user_one_id = ? OR user_two_id = ?)`,
        [chat_id, user_id, user_id]
      );
    
      if (!chat) {
        this.s = 0; 
        this.m = "You are not part of this chat"; 
        return this.send_res(res);
      }

      // Fetch messages excluding those user has marked deleted (soft-delete)
      const messages = await this.select(
        `SELECT
           cm.id,
           cm.chat_id,
           cm.sender_id,
           u.name AS sender_name,
           cm.receiver_id,
           cm.message,
           cm.media,
           cm.thumb,
           cm.created_at,
           IF(cmr.last_read_msg_id >= cm.id, 1, 0) AS is_read
         FROM chat_message cm
         JOIN users u ON u.id = cm.sender_id
         LEFT JOIN chat_message_delete cmd ON cmd.message_id = cm.id AND cmd.user_id = ?
         LEFT JOIN chat_message_read cmr ON cmr.chat_id = cm.chat_id AND cmr.user_id = ?
         WHERE cm.chat_id = ?
           AND (cmd.status IS NULL OR cmd.status = 0)
         ORDER BY cm.id ASC`,
        [user_id, user_id, chat_id]
      );

      // Find last message id (for read pointer)
      const lastMsgId = messages.length > 0 ? messages[messages.length - 1].id : null;

      // Update chat_message_read for this user to last message (if any)
      if (lastMsgId) {
        const existing = await this.selectOne(
          `SELECT id FROM chat_message_read WHERE chat_id = ? AND user_id = ?`,
          [chat_id, user_id]
        );

        if (existing) {
          await this.update(
            `UPDATE chat_message_read SET last_read_msg_id = ? , updated_at = NOW() WHERE chat_id = ? AND user_id = ?`,
            [lastMsgId, chat_id, user_id]
          );
        } else {
          await this.insert(
            `INSERT INTO chat_message_read (chat_id, user_id, last_read_msg_id, created_at) VALUES (?, ?, ?, NOW())`,
            [chat_id, user_id, lastMsgId]
          );
        }
      }

      this.s = 1; this.m = "Chat messages loaded"; this.r = { chat_id, messages };
      return this.send_res(res);

    } catch (err) {
      this.s = 0; this.err = err.message; return this.send_res(res);
    }
  }

  // SOFT DELETE single message for current user (mark chat_message_delete.status = 1)
  async deleteChatMessage(req, res) {
    try {
      const user_id = req._id;
      const { message_id } = req.body;

      if (!message_id) {
        this.s = 0; this.m = "message_id is required"; return this.send_res(res);
      }

      // fetch message
      const message = await this.selectOne(
        `SELECT id, chat_id, sender_id, receiver_id FROM chat_message WHERE id = ?`,
        [message_id]
      );

      if (!message) {
        this.s = 0; this.m = "Message not found"; return this.send_res(res);
      }

      // ensure user is part of chat
      const chat = await this.selectOne(
        `SELECT id, user_one_id, user_two_id FROM chats WHERE id = ? AND (user_one_id = ? OR user_two_id = ?)`,
        [message.chat_id, user_id, user_id]
      );

      if (!chat) {
        this.s = 0; this.m = "You are not part of this chat"; return this.send_res(res);
      }

      // upsert chat_message_delete as soft-delete for this user
      const existing = await this.selectOne(
        `SELECT id, status FROM chat_message_delete WHERE message_id = ? AND user_id = ?`,
        [message_id, user_id]
      );

      if (existing) {
        // If already marked deleted, keep status = 1
        if (existing.status !== 1) {
          await this.update(
            `UPDATE chat_message_delete SET status = 1, updated_at = NOW() WHERE id = ?`,
            [existing.id]
          );
        }
      } else {
        await this.insert(
          `INSERT INTO chat_message_delete (message_id, user_id, chat_id, status, created_at, updated_at)
           VALUES (?, ?, ?, 1, NOW(), NOW())`,
          [message_id, user_id, message.chat_id]
        );
      }

      // Return success and chat/message info; front-end should hide the message for this user
      this.s = 1; this.m = "Message deleted for you (soft)"; this.r = { message_id, chat_id: message.chat_id };
      return this.send_res(res);

    } catch (err) {
      this.s = 0; this.err = err.message; return this.send_res(res);
    }
  }

  // CLEAR entire chat for current user (soft delete all messages for that user)
  async clearChat(req, res) {
    try {
      const user_id = req._id;
      const { chat_id } = req.body;

      if (!chat_id) {
        this.s = 0; this.m = "chat_id is required"; return this.send_res(res);
      }

      // validate chat membership
      const chat = await this.selectOne(
        `SELECT id, user_one_id, user_two_id FROM chats WHERE id = ? AND (user_one_id = ? OR user_two_id = ?)`,
        [chat_id, user_id, user_id]
      );
      if (!chat) {
        this.s = 0; this.m = "Invalid chat"; return this.send_res(res);
      }

      // 1) Insert soft-delete rows for messages that don't yet have one for this user
      // (INSERT ... SELECT approach)
      await this.insert(
        `INSERT INTO chat_message_delete (message_id, user_id, chat_id, status, created_at, updated_at)
         SELECT cm.id, ?, cm.chat_id, 1, NOW(), NOW()
         FROM chat_message cm
         LEFT JOIN chat_message_delete cmd ON cmd.message_id = cm.id AND cmd.user_id = ?
         WHERE cm.chat_id = ? AND (cmd.id IS NULL)`,
        [user_id, user_id, chat_id]
      ).catch(()=>{}); // some drivers may return different result; ignore if no-op

      // 2) Ensure existing rows for this user are set to status = 1
      await this.update(
        `UPDATE chat_message_delete SET status = 1, updated_at = NOW() WHERE chat_id = ? AND user_id = ?`,
        [chat_id, user_id]
      );

      // Optionally: mark chat as 'deactivated_for_user' — but we keep single status column on chats,
      // so we'll just return success. Front-end should hide chat on user's list after clear.
      this.s = 1; this.m = "Chat cleared for you (soft)"; this.r = { chat_id };
      return this.send_res(res);

    } catch (err) {
      this.s = 0; this.err = err.message; return this.send_res(res);
    }
  }

  // GET all chats for the user with last message and unread count
  async myAllChatsWithUnread(req, res) {
    try {
      const user_id = req._id;
      console.log(user_id)

      const chats = await this.select(
        `SELECT
           c.id AS chat_id,
           IF(c.user_one_id = ?, c.user_two_id, c.user_one_id) AS other_user_id,
           u.name AS other_user_name,
           lm.message AS last_message,
           lm.sender_id AS last_sender_id,
           lm.created_at AS last_message_time,
           COALESCE(unread.unread_count, 0) AS unread_count
         FROM chats c
         JOIN users u ON u.id = IF(c.user_one_id = ?, c.user_two_id, c.user_one_id)
         LEFT JOIN (
           SELECT cm.chat_id, cm.message, cm.sender_id, cm.created_at
           FROM chat_message cm
           JOIN (
             SELECT chat_id, MAX(id) AS max_id FROM chat_message GROUP BY chat_id
           ) mx ON mx.chat_id = cm.chat_id AND mx.max_id = cm.id
         ) lm ON lm.chat_id = c.id
         LEFT JOIN (
           SELECT cm.chat_id, COUNT(*) AS unread_count
           FROM chat_message cm
           LEFT JOIN chat_message_read cmr ON cmr.chat_id = cm.chat_id AND cmr.user_id = ?
           LEFT JOIN chat_message_delete cmd ON cmd.message_id = cm.id AND cmd.user_id = ?
           WHERE cm.receiver_id = ? AND (cmd.status IS NULL OR cmd.status = 0)
             AND (cmr.last_read_msg_id IS NULL OR cm.id > cmr.last_read_msg_id)
           GROUP BY cm.chat_id
         ) unread ON unread.chat_id = c.id
         WHERE c.user_one_id = ? OR c.user_two_id = ?
         ORDER BY lm.created_at DESC`,
        [user_id, user_id, user_id, user_id, user_id, user_id]
      );

      this.s = 1; this.m = "Chats loaded"; this.r = { chats };
      return this.send_res(res);

    } catch (err) {
      this.s = 0; this.err = err.message; return this.send_res(res);
    }
  }
}
