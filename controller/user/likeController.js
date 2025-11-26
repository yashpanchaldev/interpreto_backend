import { Base } from "../../service/base.js";

export default class likeController extends Base {
  constructor() {
    super();
  }
async toggleLike(req, res) {
  try {
    const user_id = req._id;

    // Get user role
    const user = await this.selectOne(
      "SELECT role FROM users WHERE id = ?",
      [user_id]
    );

    if (!user) {
      this.s = 0;
      this.m = "Invalid user";
      return this.send_res(res);
    }

    const { target_id } = req.body;

    let target_type = null;

    // =============================
    // ROLE BASED TARGET VALIDATION
    // =============================
    if (user.role === "interpreter") {
      // Interpreter can like ASSIGNMENTS
      target_type = "assignment";
      const existassignment = await this.selectOne(
        "SELECT id FROM assignments WHERE id = ?",
        [target_id]
      );
      if (!existassignment) {
        this.s = 0;
        this.m = "Assignment not found";
        return this.send_res(res);
      }

    } else if (user.role === "client") {
      // Client can like INTERPRETER profiles
      target_type = "interpreter";
      const existinterpreter = await this.selectOne(
        `SELECT id FROM users WHERE id = ? AND role = 'interpreter'`,
        [target_id]
      );
      if (!existinterpreter) {
        this.s = 0;
        this.m = "Interpreter not found";
        return this.send_res(res);
      }

    } else {
      this.s = 0;
      this.m = "Invalid role";
      return this.send_res(res);
    }

    // =============================
    // CHECK EXISTING LIKE
    // =============================
    const existing = await this.selectOne(
      `SELECT id, status FROM likes 
       WHERE user_id=? AND target_type=? AND target_id=?`,
      [user_id, target_type, target_id]
    );

    if (existing) {
      // --------- TOGGLE STATUS ----------
      const newStatus = existing.status === 1 ? 0 : 1;

      await this.update(
        `UPDATE likes SET status=? WHERE id=?`,
        [newStatus, existing.id]
      );

      this.s = 1;
      this.m = newStatus === 1 ? "Liked" : "Unliked";
      this.r = { liked: newStatus === 1, target_type };
      return this.send_res(res);
    }

    // =============================
    // INSERT NEW LIKE
    // =============================
    await this.insert(
      `INSERT INTO likes (user_id, target_type, target_id, status)
       VALUES (?, ?, ?, 1)`,
      [user_id, target_type, target_id]
    );

    this.s = 1;
    this.m = "Liked successfully";
    this.r = { liked: true, target_type };
    return this.send_res(res);

  } catch (err) {
    this.s = 0;
    this.err = err.message;
    return this.send_res(res);
  }
}
async getMyLikes(req, res) {
  try {
    const user_id = req._id;

    // Check user role
    const user = await this.selectOne(
      "SELECT id,role FROM users WHERE id = ?",
      [user_id]
    );

console.log(user)
    if (!user) {
      this.s = 0;
      this.m = "Invalid user";
      return this.send_res(res);
    }

    let data = [];

    // ============================
    // CLIENT → liked interpreters
    // ============================
    if (user.role === "client") {
      data = await this.select(
        `SELECT 
           l.id AS like_id,
           u.id AS interpreter_id,
           u.name,
           u.email,
           u.phone,
           u.avatar_url,
           ip.experience_years,
           ip.fee_min,
           ip.fee_max
         FROM likes l
         JOIN users u ON u.id = l.target_id AND u.role = 'interpreter'
         LEFT JOIN interpreter_profiles ip ON ip.user_id = u.id
         WHERE l.user_id = ? AND l.target_type = 'interpreter' AND l.status = 1
         ORDER BY l.id DESC`,
        [user_id]
      );
    }

    // ============================
    // INTERPRETER → liked assignments
    // ============================
    else if (user.role === "interpreter") {
      data = await this.select(
        `SELECT 
           l.id AS like_id,
           a.id AS assignment_id,
           a.title,
           a.date,
           a.start_time,
           a.location,
           a.language_from,
           a.language_to
         FROM likes l
         JOIN assignments a ON a.id = l.target_id
         WHERE l.user_id = ? AND l.target_type = 'assignment' AND l.status = 1
         ORDER BY l.id DESC`,
        [user_id]
      );
    }

    this.s = 1;
    this.m = "Liked items fetched successfully";
    this.r = data;
    return this.send_res(res);

  } catch (err) {
    this.s = 0;
    this.err = err.message;
    return this.send_res(res);
  }
}


}
