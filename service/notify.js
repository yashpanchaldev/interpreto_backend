import admin from "firebase-admin";
import serviceAccount from "./firebase.json" with { type: "json" };
import { Base } from "./base.js";

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export default class Notify extends Base {
  async subscribe_topic(fcm_token, topics) {
    for (const topic of topics) {
      try {
        await admin.messaging().subscribeToTopic(fcm_token, topic);
        console.log(`Subscribed to topic: ${topic}`);
      } catch (error) {
        console.error(`Error subscribing to topic ${topic}:`, error.message);
      }
    }
    return true;
  }

  async send_notification(
    uids,
    title,
    message,
    type,
    type_id,
    payload,
    send_by,
    is_store // 1: store, 0: not store
  ) {
    try {
      const query = await this.select(
        `SELECT fcm_token FROM fcm_token WHERE user_id IN (${uids})`
      );

      const obj = {
        message: {
          notification: {
            title: title,
            body: message,
          },
          data: {
            type: `${type}`,
            type_id: `${type_id}`,
            send_by: `${send_by}`,
            payload: `${payload}`,
            sound: `default`,
          },
          android: {
            notification: {
              sound: `default`,
            },
          },
          apns: {
            payload: {
              aps: {
                sound: `default`,
              },
            },
          },
        },
      };

      if (is_store == 1) {
        const users = await this.select(
          `SELECT id AS user_id FROM user WHERE id IN (${uids}) AND status = 1`
        );
        for (const val of users) {
          await this.insert(
            "INSERT INTO notification (user_id,title,message,type,type_id,topic,payload,send_by) VALUES (?,?,?,?,?,?,?,?)",
            [
              val.user_id,
              title,
              message,
              type,
              type_id,
              null,
              JSON.stringify(obj),
              send_by,
            ]
          );
        }
      }

      if (query.length > 0) {
        for (let i = 0; i < query.length; i++) {
          const fcm_token = query[i].fcm_token;
          const message = {
            ...obj.message,
            token: fcm_token,
          };

          await admin
            .messaging()
            .send(message)
            .then((response) => {
              console.log("Notification sent successfully:", response);
            })
            .catch((error) => {
              console.log("Notification sent error:", error.message);
            });
        }
      }
      return true;
    } catch (err) {
      console.log(err);
      return this.response(req, res, {
        s: 0,
        m: "Something went wrong please try again...",
        r: err,
      });
    }
  }

  async send_topic_notification(
    topic,
    title,
    message,
    type,
    type_id,
    payload,
    send_by,
    is_store
  ) {
    try {
      const obj = {
        notification: {
          title: title,
          body: message,
        },
        data: {
          type: `${type}`,
          type_id: `${type_id}`,
          send_by: `${send_by}`,
          payload: `${payload}`,
          sound: `default`,
        },
        android: {
          notification: {
            sound: `default`,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: `default`,
            },
          },
        },
        topic: topic,
      };

      if (is_store == 1) {
        await this.insert(
          "INSERT INTO notification (user_id, title, message, type, type_id, topic, payload, send_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [
            0,
            title,
            message,
            type,
            type_id,
            topic,
            JSON.stringify(obj),
            send_by,
          ]
        );
      }

      await admin
        .messaging()
        .send(obj)
        .then((response) => {
          console.log("Topic notification sent successfully:", response);
        })
        .catch((error) => {
          console.log("Error sending topic notification:", error.message);
        });

      return true;
    } catch (err) {
      console.log("send topic notification error:", err.message);
      return false;
    }
  }
}
