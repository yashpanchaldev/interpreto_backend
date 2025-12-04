// path: controllers/chatController.js
import { Base } from "../../service/base.js";

export default class chatController extends Base {
  constructor() {
    super();
  }
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

async getMyChatMessages(req, res) {
  try {
    const user_id = req._id;
    const { chat_id } = req.params;

    if (this.varify_req(req, ["chat_id"])) {
      this.s = 0;
      this.m = "chat_id is required";
      return this.send_res(res);
    }

    // 1️ Validate chat membership
    const chat = await this.selectOne(
      `SELECT id FROM chats 
       WHERE id = ? AND (user_one_id = ? OR user_two_id = ?)`,
      [chat_id, user_id, user_id]
    );

    if (!chat) {
      this.s = 0;
      this.m = "You are not part of this chat";
      return this.send_res(res);
    }

    //  Fetch clear-marker (Instagram clear chat)
    const clearMarker = await this.selectOne(
      `SELECT message_id 
       FROM chat_message_delete 
       WHERE chat_id = ? AND user_id = ? AND status = 1
       ORDER BY id DESC LIMIT 1`,
      [chat_id, user_id]
    );

    const hideUntil = clearMarker ? clearMarker.message_id : 0;

    // Fetch ALL messages (NOT filtering in SQL)
    const allMessages = await this.select(
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
          cm.is_delete
       FROM chat_message cm
       JOIN users u ON u.id = cm.sender_id
       WHERE cm.chat_id = ?
       ORDER BY cm.id ASC`,
      [chat_id]
    );

    //  Filter messages in Node.js (simple)
    const messages = allMessages.filter((msg) => {
      // skip old messages before clear-marker
      if (msg.id <= hideUntil) return false;

      // skip single deleted messages
      if (msg.is_delete === 1) return false;

      return true;
    });

    //  Get read-pointer
    const readPointer = await this.selectOne(
      `SELECT last_read_msg_id FROM chat_message_read 
       WHERE chat_id = ? AND user_id = ?`,
      [chat_id, user_id]
    );

    const lastRead = readPointer?.last_read_msg_id ?? 0;

    //  Attach is_read = 1/0 manually
    const finalMessages = messages.map((msg) => ({
      ...msg,
      is_read: msg.id <= lastRead ? 1 : 0,
    }));

    //   Update read pointer only if messages exist
    if (messages.length > 0) {
      const lastMsgId = messages[messages.length - 1].id;

      const existing = await this.selectOne(
        `SELECT id FROM chat_message_read 
         WHERE chat_id = ? AND user_id = ?`,
        [chat_id, user_id]
      );

      if (existing) {
        await this.update(
          `UPDATE chat_message_read 
           SET last_read_msg_id = ?, updated_at = NOW()
           WHERE chat_id = ? AND user_id = ?`,
          [lastMsgId, chat_id, user_id]
        );
      } else {
        await this.insert(
          `INSERT INTO chat_message_read 
           (chat_id, user_id, last_read_msg_id, created_at)
           VALUES (?, ?, ?, NOW())`,
          [chat_id, user_id, lastMsgId]
        );
      }
    }

    //   Final output
    this.s = 1;
    this.m = "Messages loaded";
    this.r = { chat_id, messages: finalMessages };

    return this.send_res(res);

  } catch (err) {
    this.s = 0;
    this.err = err.message;
    return this.send_res(res);
  }
}
 async deleteChatMessage(req, res) {
  try {
    const user_id = req._id;
    const { message_id } = req.params;

    if (!message_id) {
      this.s = 0; 
      this.m = "message_id is required"; 
      return this.send_res(res);
    }

    // Message exists?
    const message = await this.selectOne(
      `SELECT id, chat_id FROM chat_message WHERE id = ?`,
      [message_id]
    );

    if (!message) {
      this.s = 0; 
      this.m = "Message not found"; 
      return this.send_res(res);
    }

    // User belongs to chat?
    const chat = await this.selectOne(
      `SELECT id FROM chats 
       WHERE id = ? AND (user_one_id = ? OR user_two_id = ?)`,
      [message.chat_id, user_id, user_id]
    );

    if (!chat) {
      this.s = 0; 
      this.m = "You are not part of this chat"; 
      return this.send_res(res);
    }

    // 🔥 Single delete → set is_delete = 1
    await this.update(
      `UPDATE chat_message SET is_delete = 1 WHERE id = ?`,
      [message_id]
    );

    this.s = 1;
    this.m = "Message deleted for you";
    this.r = { message_id, chat_id: message.chat_id };
    return this.send_res(res);

  } catch (error) {
    this.s = 0; 
    this.err = error.message; 
    return this.send_res(res);
  }
}

async clearChat(req, res) {
  try {
    const user_id = req._id;
    const { chat_id } = req.body;

    if (this.varify_req(req, ["chat_id"])) {
      this.s = 0; this.m = "chat_id is required"; return this.send_res(res);
    }

    const chat = await this.selectOne(
      `SELECT id FROM chats WHERE id = ? AND (user_one_id = ? OR user_two_id = ?)`,
      [chat_id, user_id, user_id]
    );

    if (!chat) {
      this.s = 0; this.m = "Invalid chat"; return this.send_res(res);
    }

    const last = await this.selectOne(
      `SELECT id FROM chat_message WHERE chat_id = ? ORDER BY id DESC LIMIT 1`,
      [chat_id]
    );

    if (!last) {
      await this.delete?.(
        `DELETE FROM chat_message_delete WHERE chat_id = ? AND user_id = ?`,
        [chat_id, user_id]
      ).catch(()=>{});
      this.s = 1; this.m = "Chat cleared for you (no messages)"; this.r = { chat_id };
      return this.send_res(res);
    }

    const lastMessageId = last.id;
    if (typeof this.delete === "function") {
      await this.delete(
        `DELETE FROM chat_message_delete WHERE chat_id = ? AND user_id = ?`,
        [chat_id, user_id]
      );
    } else {
      await this.update(
        `UPDATE chat_message_delete SET status = 0, updated_at = NOW() WHERE chat_id = ? AND user_id = ?`,
        [chat_id, user_id]
      );
    }

    await this.insert(
      `INSERT INTO chat_message_delete (chat_id, message_id, user_id, status, created_at, updated_at)
       VALUES (?, ?, ?, 1, NOW(), NOW())`,
      [chat_id, lastMessageId, user_id]
    );

    this.s = 1;
    this.m = "Chat cleared for you (marker set to last message)";
    this.r = { chat_id, last_message_id: lastMessageId };
    return this.send_res(res);

  } catch (err) {
    this.s = 0;
    this.err = err.message;
    return this.send_res(res);
  }
}
async myAllChatsWithUnread(req, res) {
  try {
    const user_id = req._id;

    // ----------------------------------------
    //   Get all chats of this user
    // ----------------------------------------
    const chatList = await this.select(
      `SELECT 
          id AS chat_id,
          user_one_id,
          user_two_id
       FROM chats
       WHERE user_one_id = ? OR user_two_id = ?
       ORDER BY updated_at DESC`,
      [user_id, user_id]
    );

    // Empty? return early
    if (!chatList.length) {
      this.s = 1;
      this.m = "No chats found";
      this.r = { chats: [] };
      return this.send_res(res);
    }

    const finalChats = [];

    //  Loop through each chat
    for (const chat of chatList) {
      const chat_id = chat.chat_id;

      // find the other user
      const other_user_id =
        chat.user_one_id === user_id ? chat.user_two_id : chat.user_one_id;

      // Fetch other user details
      const otherUser = await this.selectOne(
        `SELECT id, name, avatar_url 
         FROM users WHERE id = ?`,
        [other_user_id]
      );

      //   Get clear-marker (Instagram clear chat)
      const clearMarker = await this.selectOne(
        `SELECT message_id
         FROM chat_message_delete
         WHERE chat_id = ? AND user_id = ? AND status = 1
         ORDER BY id DESC LIMIT 1`,
        [chat_id, user_id]
      );

      const hideUntil = clearMarker ? clearMarker.message_id : 0;

      //  LAST VISIBLE MESSAGE (simple query)
      const lastMessage = await this.selectOne(
        `SELECT 
            cm.id,
            cm.message,
            cm.sender_id,
            cm.created_at
         FROM chat_message cm
         WHERE cm.chat_id = ?
           AND cm.is_delete = 0
           AND cm.id > ?
         ORDER BY cm.id DESC
         LIMIT 1`,
        [chat_id, hideUntil]
      );

      let lastSender = null;
      if (lastMessage) {
        lastSender = await this.selectOne(
          `SELECT id, name, avatar_url FROM users WHERE id = ?`,
          [lastMessage.sender_id]
        );
      }
      const unread = await this.selectOne(
  `SELECT COUNT(*) AS unread_count
   FROM chat_message cm
   LEFT JOIN chat_message_read cmr 
     ON cmr.chat_id = cm.chat_id AND cmr.user_id = ?
   WHERE cm.chat_id = ?
     AND cm.sender_id != ?        -- 👈 NEW: do not count my own messages
     AND cm.receiver_id = ?       -- must be sent to me
     AND cm.is_delete = 0
     AND cm.id > ?                -- clear-marker logic
     AND (cmr.last_read_msg_id IS NULL OR cm.id > cmr.last_read_msg_id)`,
  [user_id, chat_id, user_id, user_id, hideUntil]
);


      finalChats.push({
        chat_id,
        other_user: otherUser,
        last_message: lastMessage || null,
        last_sender: lastSender || null,
        unread_count: unread?.unread_count ?? 0
      });
    }

    // Return final result
    this.s = 1;
    this.m = "Chats loaded";
    this.r = { chats: finalChats };
    return this.send_res(res);

  } catch (err) {
    this.s = 0;
    this.err = err.message;
    return this.send_res(res);
  }
}
}
