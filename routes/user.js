  import { Router } from "express";
  import Auth from "../controller/user/userController.js";
  import Like from "../controller/user/likeController.js";
  const router = Router();

  router.route("/update-profile").put((req, res, next) => {
    const c = new Auth();
    return c.updateProfile(req, res, next);
  });
  router.route("/profile").get((req, res, next) => {
    const c = new Auth();
    return c.getProfile(req, res, next);
  });
  router.route("/allow-location").put((req, res, next) => {
    const c = new Auth();
    return c.allowLocation(req, res, next);
  });
  router.route("/referrals/history").get((req, res, next) => {
    const c = new Auth();
    return c.referralHistory(req, res, next);
  });
  router.route("/toggle").post((req, res, next) => {
    const c = new Like();
    return c.toggleLike(req, res, next);
  });
  router.route("/liked").get((req, res, next) => {
    const c = new Like();
    return c.getMyLikes(req, res, next);
  });


  console.log("");

  export default router;
