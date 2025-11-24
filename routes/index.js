import { authMiddleware } from "../middleware/auth.js";
import { Router } from "express";
import Auth from "./auth.js";
import laguage from "./laguage.js";
import signature from "./signature.js";
import Agreement from "./agreements.js";
import ratereview from "./rateReview.js";
import assignment from "./assignment.js";
import interpreter from "./interpreter.js";
import admin from "./admin.js";
import User from "./user.js";

const router = Router();

// without middleware routes
router.use("/auth", Auth);

// with middleware routes
router.use(authMiddleware);
router.use("/user", User);
router.use("/interpreter",laguage)
router.use("/interpreter",signature)
router.use("/interpreter",ratereview)
router.use("/interpreter",Agreement)
router.use("/assignment",assignment)
router.use("/interpreter",interpreter)
router.use("/admin",admin)


export default router;
