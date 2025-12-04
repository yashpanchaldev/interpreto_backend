import { Router } from "express";
import Auth from "../controller/auth/authcontroller.js";
const router = Router();

router.route("/signup").post((req, res, next) => {
  const c = new Auth();
  return c.signup(req, res, next);
});
router.route("/login").post((req, res, next) => {
  const c = new Auth();
  return c.login(req, res, next);
});
router.route("/verify-email").post((req, res, next) => {
  const c = new Auth();
  return c.verifyEmail(req, res, next);
});
router.route("/resend-email").post((req, res, next) => {
  const c = new Auth();
  return c.resendEmailOtp(req, res, next);
});
router.route("/forgot-password").post((req, res, next) => {
  const c = new Auth();
  return c.forgotPassword(req, res, next);
});
router.route("/reset-password").post((req, res, next) => {
  const c = new Auth();
  return c.resetPassword(req, res, next);
});
router.route("/createStripeAccount").post((req, res, next) => {
  const c = new Auth();
  return c.createStripe(req, res, next);
});





export default router;
