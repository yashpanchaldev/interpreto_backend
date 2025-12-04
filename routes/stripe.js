import { Router } from "express";
import express from "express";
import PaymentController from "../controller/stripe/stripeController.js";
import StripeWebhook from "../controller/stripe/webhookController.js";

const router = Router();
router.route("/onboarding-link").post((req, res, next) => {
  const c = new PaymentController();
  return c.createOnboardingLink(req, res, next);
});
router.route("/create").post((req, res, next) => {
  const c = new PaymentController();
  return c.createAccount(req, res, next);
});
router.route("/create-intent").post((req, res, next) => {
  const c = new PaymentController();
  return c.createPaymentIntent(req, res, next);
});
router.route("/release-payout").post((req, res, next) => {
  const c = new PaymentController();
  return c.releasePaymentToInterpreter(req, res, next);
});


router.post("/webhooks", express.raw({ type: "application/json" }), (req, res, next) => {
  req.rawBody = req.body; 
  const W = new StripeWebhook();
  return W.webhook(req, res, next);
});

export default router;
