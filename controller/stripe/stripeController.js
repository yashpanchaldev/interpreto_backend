import Stripe from "stripe";
import { Base } from "../../service/base.js";
import { CONFIG } from "../../config/flavour.js";

const stripe = new Stripe(CONFIG.STRIPE_SECRET_KEY)

export default class PaymentController extends Base {

  constructor() {
    super();
  }

  async createOnboardingLink(req,res,next){
    try {
      const user_id = req._id

      const user = await this.selectOne("SELECT stripe_account_id FROM users WHERE id = ?",[user_id])

      if(!user || !user.stripe_account_id){
        this.s =0;
         this.m = "Stripe account not found"
         return this.send_res(res)
      }

          const link = await stripe.accountLinks.create({
      account: user.stripe_account_id,
      refresh_url: `${process.env.FRONTEND_URL}/stripe-onboarding/retry`,
      return_url: `${process.env.FRONTEND_URL}/stripe-onboarding/success`,
      type: "account_onboarding"
    });

        // Log the generated link for audit
    await this.insert(
      `INSERT INTO stripe_account_logs (user_id, stripe_account_id, event, meta, created_at) VALUES (?, ?, 'onboarding_link_generated', ?, NOW())`,
      [user_id, user.stripe_account_id, JSON.stringify({ url: link.url })]
    );
    this.s =1;
     this.m = "onboarding link generated"
     this.r = {url:link}

    } catch (error) {
      this.err = error.message
      return this.send_res(res)
    }

  }

 async createPaymentIntent(req, res) {
  try {
    const client_id = req._id;
    const { assignment_id } = req.body;
    if (!assignment_id) { 
      this.s = 0;
      this.m = "Assignment ID required"; 
      return this.send_res(res); }

    const assignment = await this.selectOne(
      `SELECT a.id, a.payment_amount, a.client_id, a.interpreter_id, u.stripe_account_id
       FROM assignments a
       LEFT JOIN users u ON a.interpreter_id = u.id
       WHERE a.id = ? LIMIT 1`,
      [assignment_id]
    );
    if (!assignment) { 
      this.s = 0; 
      this.m = "Assignment not found"; 
      return this.send_res(res); }
    if (!assignment.payment_amount) { 
      this.s = 0;
      this.m = "Assignment payment amount not set";
      return this.send_res(res); }

    const amountInCents = Math.round(Number(assignment.payment_amount) * 100);

    const idempotencyKey = `payment_${client_id}_${assignment_id}_${Date.now()}`;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: process.env.DEFAULT_CURRENCY || "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        assignment_id: String(assignment_id),
        client_id: String(client_id),
        interpreter_id: String(assignment.interpreter_id || "")
      }
    }, { idempotencyKey });

    await this.insert(
      `INSERT INTO payment_history
       (assignment_id, client_id, interpreter_id, transaction_id, type, amount, status, description, created_at)
       VALUES (?, ?, ?, ?, 'charge', ?, 'pending', 'Client started payment', NOW())`,
      [assignment.id, client_id, assignment.interpreter_id, paymentIntent.id, assignment.payment_amount]
    );

    this.s = 1; 
    this.m = "Payment intent created"; 
    this.r = { client_secret: paymentIntent.client_secret }; 
    return this.send_res(res);
  } catch (err) {
    console.error("Payment Intent Error", err);
    this.s = 0; this.m = "Failed to create payment intent"; this.err = err.message; return this.send_res(res);
  }
}
async releasePaymentToInterpreter(req, res) {
  try {
    const admin_id = req._id; // assume admin
    const { assignment_id } = req.body;
    if (!assignment_id) { this.s = 0; this.m = "Assignment ID required"; return this.send_res(res); }

    const assignment = await this.selectOne(
      `SELECT a.id, a.payment_amount, a.payment_status, u.stripe_account_id
       FROM assignments a
       JOIN users u ON a.interpreter_id = u.id
       WHERE a.id = ?`,
      [assignment_id]
    );

    if (!assignment) { 
      this.s = 0; 
      this.m = "Assignment not found"; 
      return  this.send_res(res); }
    if (assignment.payment_status !== 1) { 
      this.s = 0; 
      this.m = "Client payment not completed yet."; 
      return  this.send_res(res); }
    if (!assignment.stripe_account_id) { 
      this.s = 0; 
      this.m = "Interpreter Stripe account missing"; 
      return this.send_res(res); }

    const amountInCents = Math.round(Number(assignment.payment_amount) * 100);

    const idempotencyKey = `transfer_${assignment_id}_${Date.now()}`;
    const transfer = await stripe.transfers.create({
      amount: amountInCents,
      currency: process.env.DEFAULT_CURRENCY || "usd",
      destination: assignment.stripe_account_id,
      metadata: { assignment_id: String(assignment_id), admin_id: String(admin_id) }
    }, { idempotencyKey });

    await this.insert(
      `INSERT INTO payment_history
       (assignment_id, client_id, interpreter_id, transaction_id, type, amount, status, description, created_at)
       VALUES (?, ?, ?, ?, 'transfer', ?, 'pending', 'Admin sent payout to interpreter', NOW())`,
      [assignment.id, 0, assignment.interpreter_id, transfer.id, assignment.payment_amount]
    );

    
    this.s = 1; 
    this.m = "Payout released to interpreter."; 
    this.r = { transfer }; 
    return   this.send_res(res);
  } catch (err) {
    console.error("Release payout error", err);
    
    this.s = 0; 
    this.m = "Failed to release payout"; 
    this.err = err.message; 
    return this.send_res(res);
  }
}

}
