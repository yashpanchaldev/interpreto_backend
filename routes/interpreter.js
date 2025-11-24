import { Router } from "express";
import interpreterController from "../controller/interpreter/interpreterController.js";

const router = Router();

// Add new language (with certificates)
router.route("/filter").get((req, res, next) => {
  const c = new interpreterController();
  return c.searchInterpreters(req, res, next);
});

// /routes/assignment.js

router.route("/hire-direct").post((req, res, next) => {
  const c = new interpreterController();
  return c.hireDirect(req, res, next);
});
router.route("/accept-hire").post((req, res, next) => {
  const c = new interpreterController();
  return c.acceptHire(req, res, next);
});
router.route("/reject-hire").post((req, res, next) => {
  const c = new interpreterController();
  return c.rejectHire(req, res, next);
});
router.route("/myRequests").get((req, res, next) => {
  const c = new interpreterController();
  return c.getMyAllRequests(req, res, next);
});



export default router;
