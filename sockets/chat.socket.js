// path: sockets/socketHandlers.js
import { POOL } from "../config/database.js";

export const registerSocketHandlers = (io) => {
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // LOGIN: store socket id and join chat rooms
    socket.on("login", async ({ userId }) => {
      try {
        if (!userId) return;
        await POOL.query("UPDATE users SET socket_id = ? WHERE id = ?", [socket.id, userId]);

        // fetch all chats of this user and join rooms
        const [chats] = await POOL.query(
          `SELECT id FROM chats WHERE user_one_id = ? OR user_two_id = ?`,
          [userId, userId]
        );

        chats.forEach((c) => {
          socket.join(`chat_${c.id}`);
        });

        console.log(`User ${userId} joined ${chats.length} chat rooms`);
      } catch (err) {
        console.error("Login/socket join error:", err);
      }
    });

    // SEND MESSAGE
    socket.on("send-message", async ({ sender_id, chat_id, message, media = null, thumb = null }) => {
      try {
        if (!sender_id || !chat_id || (!message && !media && !thumb)) {
          return socket.emit("error", { message: "Missing fields" });
        }

        // 1) Check chat exists
        const [rows] = await POOL.query(`SELECT * FROM chats WHERE id = ?`, [chat_id]);
        if (rows.length === 0) return socket.emit("error", { message: "Chat not found" });
        const chat = rows[0];

        // 2) validate sender belongs to chat
        if (chat.user_one_id !== sender_id && chat.user_two_id !== sender_id) {
          return socket.emit("error", { message: "Unauthorized user" });
        }

        // 3) determine receiver
        const receiver_id = chat.user_one_id === sender_id ? chat.user_two_id : chat.user_one_id;

        // 4) save message (soft-delete fields default 0)
        const [insertResult] = await POOL.query(
          `INSERT INTO chat_message (chat_id, sender_id, receiver_id, message, media, thumb, is_delete, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, 1, NOW(), NOW())`,
          [chat_id, sender_id, receiver_id, message || null, media || null, thumb || null]
        );

        const messageData = {
          id: insertResult.insertId,
          chat_id,
          sender_id,
          receiver_id,
          message: message || null,
          media: media || null,
          thumb: thumb || null,
          created_at: new Date()
        };

        // 5) emit to chat room
        io.to(`chat_${chat_id}`).emit("receive-message", messageData);

        // 6) notify receiver directly if online
        const [receiverRows] = await POOL.query(`SELECT socket_id FROM users WHERE id = ?`, [receiver_id]);
        if (receiverRows.length > 0 && receiverRows[0].socket_id) {
          io.to(receiverRows[0].socket_id).emit("new-message-notification", messageData);
        }

        // 7) update chat.updated_at
        await POOL.query(`UPDATE chats SET updated_at = NOW() WHERE id = ?`, [chat_id]);

        // 8) send confirmation back to sender
        socket.emit("message-sent", messageData);

      } catch (err) {
        console.error("send-message error:", err);
        socket.emit("error", { message: "Server error" });
      }
    });

    // MESSAGE READ - update last_read_msg_id and emit read notification
    socket.on("message-read", async ({ userId, chat_id, last_read_msg_id }) => {
      try {
        if (!userId || !chat_id) return;

        // upsert chat_message_read
        const [existing] = await POOL.query(`SELECT id FROM chat_message_read WHERE chat_id = ? AND user_id = ?`, [chat_id, userId]);
        if (existing.length > 0) {
          await POOL.query(
            `UPDATE chat_message_read SET last_read_msg_id = GREATEST(IFNULL(last_read_msg_id,0), ?) , updated_at = NOW() WHERE chat_id = ? AND user_id = ?`,
            [last_read_msg_id || 0, chat_id, userId]
          );
        } else {
          await POOL.query(
            `INSERT INTO chat_message_read (chat_id, user_id, last_read_msg_id, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())`,
            [chat_id, userId, last_read_msg_id || 0]
          );
        }

        // Emit read notification to everyone in chat room (UI can update)
        io.to(`chat_${chat_id}`).emit("message-read-notification", {
          chat_id,
          user_id: userId,
          last_read_msg_id: last_read_msg_id || 0
        });

      } catch (err) {
        console.error("message-read handler error:", err);
      }
    });



    socket.on("request-delete-message", async ({ userId, message_id }) => {
      try {
        if (!userId || !message_id) return;
        // fetch message to get chat_id
        const [msgRows] = await POOL.query(`SELECT id, chat_id FROM chat_message WHERE id = ?`, [message_id]);
        if (msgRows.length === 0) return;
        const chat_id = msgRows[0].chat_id;
        // emit an event so clients hide it for this user
        io.to(`chat_${chat_id}`).emit("delete-chat-message", { message_id, user_id: userId });
      } catch (err) {
        console.error("request-delete-message error:", err);
      }
    });

    socket.on("disconnect", async () => {
      console.log("User disconnected:", socket.id);
      try {
        await POOL.query("UPDATE users SET socket_id = NULL WHERE socket_id = ?", [socket.id]);
      } catch (err) {
        console.error("Error clearing socket_id:", err);
      }
    });
  });
};
