import Stripe from "stripe";
import { Base } from "../../service/base.js";
import { CONFIG } from "../../config/flavour.js";

const stripe = new Stripe(CONFIG.STRIPE_SECRET_KEY, { apiVersion: "2023-11-15" });

export default class StripeWebhook extends Base {
  constructor()
  {
    super()
  }
  async webhook(req, res) {
    let event;
    const signature = req.headers["stripe-signature"];
    const raw = req.rawBody; 

    try {
      event = stripe.webhooks.constructEvent(raw, signature, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      this.s = 0;
      this.m = `Invalid webhook signature: ${err.message}`;
      this.err = err.message;
      return this.send_res(res);
    }

    try {
      const payloadJson = JSON.stringify(event.data?.object || {});
      await this.insert(
        `INSERT INTO webhook_logs (event_id, event_type, payload, status, created_at)
         VALUES (?, ?, ?, 'received', NOW())`,
        [event.id, event.type, payloadJson]
      );
    } catch (logErr) {
      console.error("Failed to insert webhook_logs:", logErr.message);
    }

    const existing = await this.selectOne(
      `SELECT id, status FROM webhook_logs WHERE event_id = ? LIMIT 1`,
      [event.id]
    );

    if (existing && existing.status === "processed") {
      this.s = 1;
      this.m = "Event already processed";
      return this.send_res(res);
    }
    try {
      switch (event.type) {
        case "account.updated": {
          const acc = event.data.object;
          if (acc?.details_submitted === true) {
            await this.update(
              `UPDATE users 
               SET stripe_onboarding_status='completed',
                   stripe_onboarding_completed=1,
                   stripe_onboarding_completed_at=NOW()
               WHERE stripe_account_id=?`,
              [acc.id]
            );
          } else if (acc.requirements?.currently_due?.length > 0) {
            await this.update(
              `UPDATE users SET stripe_onboarding_status='pending' WHERE stripe_account_id=?`,
              [acc.id]
            );
          }
          break;
        }

        case "payment_intent.succeeded": {
          const pi = event.data.object;
          const payment = await this.selectOne(
            `SELECT * FROM payment_history WHERE transaction_id = ? LIMIT 1`,
            [pi.id]
          );

          if (payment) {
            await this.update(
              `UPDATE payment_history 
               SET status='succeeded', description = COALESCE(description, '') || ' | Client payment successful', updated_at=NOW()
               WHERE transaction_id=?`,
              [pi.id]
            );

            if (payment.assignment_id) {
              await this.update(
                `UPDATE assignments SET payment_status=1, payment_amount = COALESCE(payment_amount, ?) WHERE id=?`,
                [payment.amount, payment.assignment_id]
              );
            }
          } else {
            console.warn("Orphan payment_intent:", pi.id);
          }
          break;
        }

        case "transfer.created":
        case "transfer.paid":
        case "transfer.failed": {
          const transfer = event.data.object;
          const payment = await this.selectOne(
            `SELECT * FROM payment_history WHERE transaction_id=? AND type='transfer' LIMIT 1`,
            [transfer.id]
          );

          if (payment) {
            await this.update(
              `UPDATE payment_history 
               SET status=?, description=COALESCE(description, '') || ' | Interpreter payout update', updated_at=NOW()
               WHERE transaction_id=?`,
              [transfer.status || "unknown", transfer.id]
            );

            if (transfer.status === "paid" && payment.assignment_id) {
              await this.update(
                `UPDATE assignments SET payment_status=2 WHERE id=?`,
                [payment.assignment_id]
              );
            }
          } else {
            await this.insert(
              `INSERT INTO payment_history (assignment_id, client_id, interpreter_id, transaction_id, type, amount, status, description, metadata)
               VALUES (NULL, NULL, NULL, ?, 'transfer', ?, ?, 'Unlinked transfer', ?)`,
              [transfer.id, (transfer.amount / 100).toFixed(2), transfer.status || 'unknown', JSON.stringify(transfer)]
            );
          }
          break;
        }

        default:
          console.log("Unhandled Stripe event:", event.type);
      }

      if (existing) {
        await this.update(
          `UPDATE webhook_logs SET status='processed', processed_at=NOW() WHERE id=?`,
          [existing.id]
        );
      } else {
        await this.insert(
          `INSERT INTO webhook_logs (event_id, event_type, payload, status, processed_at, created_at)
           VALUES (?, ?, ?, 'processed', NOW(), NOW())`,
          [event.id, event.type, JSON.stringify(event.data?.object || {})]
        );
      }

      this.s = 1;
      this.m = "Webhook processed successfully";
      return this.send_res(res);
    } catch (procErr) {
      console.error("Webhook processing error:", procErr.message);

      if (existing) {
        await this.update(
          `UPDATE webhook_logs SET status='error', error_message=?, processed_at=NOW() WHERE id=?`,
          [procErr.message, existing.id]
        );
      } else {
        await this.insert(
          `INSERT INTO webhook_logs (event_id, event_type, payload, status, error_message, processed_at, created_at)
           VALUES (?, ?, ?, 'error', ?, NOW(), NOW())`,
          [event.id, event.type, JSON.stringify(event.data?.object || {}), procErr.message]
        );
      }

      this.s = 0;
      this.m = "Webhook processing failed";
      this.err = procErr.message;
      return this.send_res(res);
    }
  }
}
