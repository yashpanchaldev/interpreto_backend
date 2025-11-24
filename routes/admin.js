import { Router } from "express";
import AdminController from "../controller/admin/adminController.js"

const router = Router();

router.get("/pending", (req, res) => {
  const c = new AdminController();
  return c.getPendingInterpreters(req, res);
});

router.get("/approved", (req, res) => {
  const c = new AdminController();
  return c.getApprovedRequests(req, res);
});

router.get("/rejected", (req, res) => {
  const c = new AdminController();
  return c.getRejectedRequests(req, res);
});

router.get("/interpreter/:interpreter_id", (req, res) => {
  const c = new AdminController();
  return c.getInterpreterDetails(req, res);
});

router.post("/approve/:interpreter_id", (req, res) => {
  const c = new AdminController();
  return c.approveInterpreter(req, res);
});

router.post("/reject/:interpreter_id", (req, res) => {
  const c = new AdminController();
  return c.rejectInterpreter(req, res);
});

router.get("/dashboard/stats", (req, res, next) => {
  const c = new AdminController();
  return c.getDashboardStats(req, res, next);
});

router.get("/users", (req, res, next) => {
  const c = new AdminController();
  return c.getAllUsers(req, res, next);
});
router.get("/interpreter/:id", (req, res, next) => {
  const c = new AdminController();
  return c.getProfile(req, res, next);
});



export default router;
