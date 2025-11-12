import { Router } from "express";
import InterpreterLanguageController from "../controller/interpreter/languageController.js";

const router = Router();

// Add new language (with certificates)
router.route("/add-language").post((req, res, next) => {
  const c = new InterpreterLanguageController();
  return c.addLanguage(req, res, next);
});

// Update existing language (add or modify)
router.route("/update-language/:id").put((req, res, next) => {
  const c = new InterpreterLanguageController();
  return c.updateLanguage(req, res, next);
});

// Get all languages for one interpreter
router.route("/get-languages/:user_id").get((req, res, next) => {
  const c = new InterpreterLanguageController();
  return c.getLanguages(req, res, next);
});

// Delete specific language
router.route("/delete-language/:id").delete((req, res, next) => {
  const c = new InterpreterLanguageController();
  return c.deleteLanguage(req, res, next);
});
router.route("/delete-certificate/:id").delete((req, res, next) => {
  const c = new InterpreterLanguageController();
  return c.deleteCertificate(req, res, next);
});

export default router;
