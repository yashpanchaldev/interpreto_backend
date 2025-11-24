import { Base } from "../../service/base.js";

export default class ReviewController extends Base {
  constructor() {
    super();
  }

  // ⭐ Submit Rating & Review
  async rateReview(req, res) {
    try {
      const client_id = req._id;

      const { assignment_id, rating, review_text } = req.body;

      if (!assignment_id || !rating) {
        this.s = 0;
        this.m = "assignment_id and rating required";
        return this.send_res(res);
      }

      // Check role = client
      const user = await this.selectOne("SELECT role FROM users WHERE id = ?", [client_id]);
      if (!user || user.role !== "client") {
        this.s = 0;
        this.m = "Only clients can rate";
        return this.send_res(res);
      }

      // Check assignment exists
      const assignment = await this.selectOne(
        `SELECT interpreter_id, status 
         FROM assignments WHERE id = ? AND client_id = ?`,
        [assignment_id, client_id]
      );

      if (!assignment) {
        this.s = 0;
        this.m = "Assignment not found";
        return this.send_res(res);
      }

      if (assignment.status !== "checked_out") {
        this.s = 0;
        this.m = "You can only rate after checkout";
        return this.send_res(res);
      }

      // Prevent duplicate review
      const exists = await this.selectOne(
        "SELECT id FROM assignment_reviews WHERE assignment_id = ?",
        [assignment_id]
      );

      if (exists) {
        this.s = 0;
        this.m = "You already submitted a review";
        return this.send_res(res);
      }

      // Insert review
      await this.insert(
        `INSERT INTO assignment_reviews 
         (assignment_id, client_id, interpreter_id, rating, review_text)
         VALUES (?, ?, ?, ?, ?)`,
        [
          assignment_id,
          client_id,
          assignment.interpreter_id,
          rating,
          review_text || null
        ]
      );

      // Update interpreter average rating (optional)
      const avg = await this.selectOne(
        `SELECT AVG(rating) AS avg_rating 
         FROM assignment_reviews 
         WHERE interpreter_id = ?`,
        [assignment.interpreter_id]
      );

      await this.update(
        `UPDATE interpreter_profiles 
         SET experience_years = ? 
         WHERE user_id = ?`,
        [avg.avg_rating || 0, assignment.interpreter_id]
      );

      this.s = 1;
      this.m = "Review submitted successfully";
      return this.send_res(res);

    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  // ⭐ Fetch interpreter reviews (for profile)
  async getInterpreterReviews(req, res) {
    try {
      const interpreter_id = req.params.interpreter_id;
      console.log(interpreter_id)

      const rows = await this.select(
        `SELECT ar.rating, ar.review_text, ar.created_at,
                u.name AS client_name
         FROM assignment_reviews ar
         JOIN users u ON u.id = ar.client_id
         WHERE ar.interpreter_id = ?
         ORDER BY ar.id DESC`,
        [interpreter_id]
      );

      this.s = 1;
      this.m = "Reviews fetched";
      this.r = rows;
      return this.send_res(res);

    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }
}
