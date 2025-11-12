import { Router } from "express";
import Auth from "../controller/user/userController.js";
const router = Router();

router.route("/add-more-info-interpreter").post((req, res, next) => {
  const c = new Auth();
  return c.addMoreInfo(req, res, next);
});



export default router;
