import { Router } from "express";
import rateReviewController from "../controller/interpreter/rateReviewController.js";

const router = Router();

// Add review
router.route("/review/add").post((req, res, next) => {
  const c = new rateReviewController();
  return c.rateReview(req, res, next);
});
router.route("/review/:interpreter_id").get((req,res,next)=>{
  const c = new rateReviewController();
  return c.getInterpreterReviews(req, res, next);
})

export default router;
