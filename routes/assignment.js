import { Router } from "express";
import AssignmentController from "../controller/interpreter/assignmentController.js";

const router = Router();

/*-----------------------------------------
   CLIENT ROUTES
-----------------------------------------*/

// Create assignment
router.route("/create").post((req, res, next) => {
  const c = new AssignmentController();
  return c.createAssignment(req, res, next);
});

// List assignments
router.route("/list").get((req, res, next) => {
  const c = new AssignmentController();
  return c.getAllAssignments(req, res, next);
});

// Search assignments
router.route("/search").get((req, res, next) => {
  const c = new AssignmentController();
  return c.searchAssignments(req, res, next);
});

// Interpreter request (Apply now)
router.route("/request").post((req, res, next) => {
  const c = new AssignmentController();
  return c.requestInterpreter(req, res, next);
});

// Get assignment requests (client)
router.route("/requests/:assignment_id").get((req, res, next) => {
  const c = new AssignmentController();
  return c.getAssignmentRequests(req, res, next);
});

// Approve interpreter request (client)
router.route("/approve-request").post((req, res, next) => {
  const c = new AssignmentController();
  return c.approveRequest(req, res, next);
});


/*-----------------------------------------
   INTERPRETER ROUTES
-----------------------------------------*/

// My requested assignments
router.route("/interpreter/requested").get((req, res, next) => {
  const c = new AssignmentController();
  return c.getMyRequests(req, res, next);
});

// Upcoming assignments
router.route("/interpreter/upcoming").get((req, res, next) => {
  const c = new AssignmentController();
  return c.getUpcomingAssignments(req, res, next);
});

// Active assignments
router.route("/interpreter/active").get((req, res, next) => {
  const c = new AssignmentController();
  return c.getActiveAssignments(req, res, next);
});

// Completed assignments
router.route("/interpreter/completed").get((req, res, next) => {
  const c = new AssignmentController();
  return c.getCompletedAssignments(req, res, next);
});

// Session details (timeline)
router.route("/session/:assignment_id").get((req, res, next) => {
  const c = new AssignmentController();
  return c.getSessionDetails(req, res, next);
});

// Update assignment status
router.route("/update-status").post((req, res, next) => {
  const c = new AssignmentController();
  return c.updateStatus(req, res, next);
});

router.route('/incomplete').post((req,res,next)=>{
  const c = new AssignmentController()
  return c.submitIncompleteCase(req,res,next)
})
router.route('/ratereview').post((req,res,next)=>{
  const c = new AssignmentController()
  return c.rateReview(req,res,next)
})

export default router;
