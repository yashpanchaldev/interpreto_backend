import { Router } from "express";
import SignatureController from "../controller/interpreter/signatureController.js";

const router = Router();

// Add signature
router.route("/add-signature").post((req, res, next) => {
  const c = new SignatureController();
  return c.addSignature(req, res, next);
});

// Get single signature
router.route("/signature/:signature_id").get((req, res, next) => {
  const c = new SignatureController();
  return c.getSignatureById(req, res, next);
});

// Get all my signatures
router.route("/my-signatures").get((req, res, next) => {
  const c = new SignatureController();
  return c.getMySignatures(req, res, next);
});
// Get all my signatures
router.route("/signature/:signature_id").delete((req, res, next) => {
  const c = new SignatureController();
  return c.deleteSignature(req, res, next);
});

export default router;
