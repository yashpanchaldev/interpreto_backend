import { Router } from "express";
import agreementsController from "../controller/interpreter/agreementsController.js";

const router = Router();

// Add new language (with certificates)
router.route("/add-agreement").post((req, res, next) => {
  const c = new agreementsController();
  return c.addAgreement(req, res, next);
});
router.route("/update-agreement/:id").put((req, res, next) => {
  const c = new agreementsController();
  return c.updateAgreement(req, res, next);
});
router.route("/delete-agreement/:id").delete((req, res, next) => {
  const c = new agreementsController();
  return c.deleteAgreement(req, res, next);
});

export default router;
