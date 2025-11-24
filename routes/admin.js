import { Router } from "express";
import AdminVerificationController from "../controller/admin/adminController.js"

const router = Router();

router.get("/pending", (req, res) => {
  const c = new AdminVerificationController();
  return c.getPendingInterpreters(req, res);
});

router.get("/approved", (req, res) => {
  const c = new AdminVerificationController();
  return c.getApprovedRequests(req, res);
});

router.get("/rejected", (req, res) => {
  const c = new AdminVerificationController();
  return c.getRejectedRequests(req, res);
});

router.get("/interpreter/:interpreter_id", (req, res) => {
  const c = new AdminVerificationController();
  return c.getInterpreterDetails(req, res);
});

router.post("/approve/:interpreter_id", (req, res) => {
  const c = new AdminVerificationController();
  return c.approveInterpreter(req, res);
});

router.post("/reject/:interpreter_id", (req, res) => {
  const c = new AdminVerificationController();
  return c.rejectInterpreter(req, res);
});

export default router;
