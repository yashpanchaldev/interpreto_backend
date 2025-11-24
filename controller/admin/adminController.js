import { Base } from "../../service/base.js";

export default class AdminVerificationController extends Base {
  constructor() {
    super();
  }

  async checkAdmin(user_id) {
    const user = await this.selectOne("SELECT role FROM users WHERE id = ?", [
      user_id,
    ]);
    console.log(user);
    return user && user.role === "admin";
  }
  async getPendingInterpreters(req, res) {
    try {
      if (!(await this.checkAdmin(req._id))) {
        this.s = 0;
        this.m = "Admin only.";
        return this.send_res(res);
      }

      const rows = await this.select(
        `SELECT id, name, email, phone, avatar_url, created_at 
       FROM users 
       WHERE role = 'interpreter' AND status = 'pending'
       ORDER BY created_at DESC`
      );

      this.s = 1;
      this.m = "Pending interpreters loaded";
      this.r = rows;
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  async getApprovedRequests(req, res) {
    try {
      const admin_id = req._id;

      if (!(await this.checkAdmin(admin_id))) {
        this.s = 0;
        this.m = "Admin only.";
        return this.send_res(res);
      }

      const rows = await this.select(
        `SELECT id AS user_id, name, email, phone, avatar_url, updated_at AS approved_at
       FROM users
       WHERE role = 'interpreter' AND status = 'active'
       ORDER BY updated_at DESC`
      );

      this.s = 1;
      this.m = "Approved interpreters loaded.";
      this.r = rows;
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  async getRejectedRequests(req, res) {
    try {
      const admin_id = req._id;

      if (!(await this.checkAdmin(admin_id))) {
        this.s = 0;
        this.m = "Admin only.";
        return this.send_res(res);
      }

      const rows = await this.select(
        `SELECT u.id AS user_id, u.name, u.email, u.phone, u.avatar_url,
              p.admin_comment, u.updated_at AS rejected_at
       FROM users u
       LEFT JOIN interpreter_profiles p ON p.user_id = u.id
       WHERE u.role = 'interpreter' AND u.status = 'rejected'
       ORDER BY u.updated_at DESC`
      );

      this.s = 1;
      this.m = "Rejected interpreters loaded.";
      this.r = rows;
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  async getInterpreterDetails(req, res) {
    try {
      if (!(await this.checkAdmin(req._id))) {
        this.s = 0;
        this.m = "You are not an admin";
        return this.send_res(res);
      }
      const { interpreter_id } = req.params;

      const user = await this.selectOne(
        `SELECT id, name, email, phone, address, avatar_url 
         FROM users WHERE id = ? AND role = 'interpreter'`,
        [interpreter_id]
      );

      if (!user) {
        this.s = 0;
        this.m = "Interpreter not found";
        return this.send_res(res);
      }

      const profile = await this.selectOne(
        `SELECT * FROM interpreter_profiles WHERE user_id = ?`,
        [interpreter_id]
      );

      const languages = await this.select(
        `SELECT * FROM interpreter_languages WHERE interpreter_id = ?`,
        [interpreter_id]
      );

      const certificates = await this.select(
        `SELECT c.* 
         FROM interpreter_certificates c 
         JOIN interpreter_languages l ON c.interpreter_language_id = l.id
         WHERE l.interpreter_id = ?`,
        [interpreter_id]
      );

      const signatures = await this.select(
        `SELECT s.*, a.title AS agreement_title 
         FROM interpreter_signatures s
         JOIN agreements a ON a.id = s.agreement_id
         WHERE s.user_id = ?`,
        [interpreter_id]
      );

      this.s = 1;
      this.m = "Interpreter details loaded";
      this.r = {
        user,
        profile,
        languages,
        certificates,
        signatures,
      };
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  async approveInterpreter(req, res) {
    try {
      const admin_id = req._id;
      const { interpreter_id } = req.params;

      if (!(await this.checkAdmin(admin_id))) {
        this.s = 0;
        this.m = "Admin only.";
        return this.send_res(res);
      }

      // Check interpreter exists
      const user = await this.selectOne(
        "SELECT status FROM users WHERE id = ? AND role = 'interpreter'",
        [interpreter_id]
      );

      if (!user) {
        this.s = 0;
        this.m = "Interpreter not found.";
        return this.send_res(res);
      }

      // If already approved
      if (user.status === "active") {
        this.s = 0;
        this.m = "Interpreter already approved.";
        return this.send_res(res);
      }

      // Reviewer Admin cannot approve rejected users
      if (admin_id === 2 && user.status === "rejected") {
        this.s = 0;
        this.m = "Interpreter must refill profile after rejection.";
        return this.send_res(res);
      }

      await this.update(
        "UPDATE users SET status = 'active', is_deactivated = 0 WHERE id = ?",
        [interpreter_id]
      );

      this.s = 1;
      this.m = "Interpreter approved successfully.";
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  async rejectInterpreter(req, res) {
    try {
      const admin_id = req._id;
      const { interpreter_id } = req.params;
      const { admin_comment } = req.body;

      if (!(await this.checkAdmin(admin_id))) {
        this.s = 0;
        this.m = "Admin only.";
        return this.send_res(res);
      }

      const user = await this.selectOne(
        "SELECT status FROM users WHERE id = ? AND role = 'interpreter'",
        [interpreter_id]
      );

      if (!user) {
        this.s = 0;
        this.m = "Interpreter not found.";
        return this.send_res(res);
      }
      console.log(user);

      // Super admin cannot reject approved
      if (user.status == "active") {
        this.s = 0;
        this.m =
          "Cannot reject approved interpreter. You can deactivate account.";
        return this.send_res(res);
      }

      await this.update("UPDATE users SET status = 'rejected' WHERE id = ?", [
        interpreter_id,
      ]);

      // Save comment inside interpreter_profiles
      await this.update(
        "UPDATE interpreter_profiles SET admin_comment = ? WHERE user_id = ?",
        [admin_comment || null, interpreter_id]
      );

      this.s = 1;
      this.m = "Interpreter rejected.";
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  async deactivateInterpreter(req, res) {
    try {
      const admin_id = req._id;
      const { interpreter_id } = req.params;

      if (!(await this.checkAdmin(admin_id))) {
        this.s = 0;
        this.m = "Admin only.";
        return this.send_res(res);
      }

      if (admin_id !== 1) {
        this.s = 0;
        this.m = "Only super admin can deactivate accounts.";
        return this.send_res(res);
      }

      await this.update(
        `UPDATE users 
       SET is_deactivated = 1, status = 'blocked'
       WHERE id = ?`,
        [interpreter_id]
      );

      this.s = 1;
      this.m = "Interpreter account deactivated.";
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }
  async getDashboardStats(req, res) {
    try {
      const admin_id = req._id;
      const user = await this.selectOne("SELECT role FROM users WHERE id = ?", [
        admin_id,
      ]);
      if (user.role !== "admin") {
        this.s = 0;
        this.m = "you are not admin";
        return this.send_res(res);
      }

      const stats = await this.select(`
        SELECT 
          (SELECT COUNT(*) FROM users WHERE role = 'client') AS total_users,
          (SELECT COUNT(*) FROM users WHERE role = 'interpreter') AS total_interpreters,
          (SELECT COUNT(*) FROM users WHERE is_premium = 1) AS premium_interpreters,
          (SELECT COUNT(*) FROM assignments WHERE status = 'completed') AS total_sessions
      `);

      this.s = 1;
      this.m = "Dashboard stats fetched";
      this.r = stats;
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

   async getAllUsers(req, res) {
    try {
      const rows = await this.select(`
        SELECT 
          id,
          name,
          email,
          phone,
          avatar_url,
          role,
          status,
          created_at
        FROM users
        ORDER BY id DESC
      `);

      this.s = 1;
      this.m = "All users fetched";
      this.r = rows;
      return this.send_res(res);

    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }
async getProfile(req, res) {
  try {
    const interpreter_id = req.params.id;

    // =============================
    // 1) BASIC USER INFO
    // =============================
    const user = await this.selectOne(
      `SELECT id, role, name, email, phone, address, avatar_url, created_at
       FROM users WHERE id = ?`,
      [interpreter_id]
    );

    if (!user) {
      this.s = 0;
      this.m = "Interpreter not found";
      return this.send_res(res);
    }

    if (user.role !== "interpreter") {
      this.s = 0;
      this.m = "This user is not an interpreter";
      return this.send_res(res);
    }

    let response = { user };

    // =============================
    // 2) INTERPRETER PROFILE
    // =============================
    const profile = await this.selectOne(
      `SELECT zip_code, service_radius, fee_min, fee_max,
              qualification, experience_years, gov_id, verified
       FROM interpreter_profiles
       WHERE user_id = ?`,
      [interpreter_id]
    );

    response.interpreter_profile = profile;

    // =============================
    // 3) SERVICES
    // =============================
    response.services = await this.select(
      `SELECT s.id AS service_id, s.name AS service_name
       FROM interpreter_services isv
       JOIN services s ON s.id = isv.service_id
       WHERE isv.interpreter_id = ?`,
      [interpreter_id]
    );

    // =============================
    // 4) ASSIGNMENT TYPES
    // =============================
    response.assignment_types = await this.select(
      `SELECT at.id AS assignment_type_id, at.name AS assignment_type_name
       FROM interpreter_assignment_types iat
       JOIN assignment_types at ON at.id = iat.assignment_type_id
       WHERE iat.interpreter_id = ?`,
      [interpreter_id]
    );

    // =============================
    // 5) LANGUAGES + CERTIFICATES
    // =============================
    const languages = await this.select(
      `SELECT il.id, l.id AS language_id, l.name AS language_name,
              il.hourly_rate, il.is_sign_language, il.created_at
       FROM interpreter_languages il
       JOIN languages l ON l.id = il.language_id
       WHERE il.interpreter_id = ?`,
      [interpreter_id]
    );

    for (let lang of languages) {
      lang.certificates = await this.select(
        `SELECT id, file_url 
         FROM interpreter_certificates 
         WHERE interpreter_language_id = ?`,
        [lang.id]
      );
    }

    response.languages = languages;

    // =============================
    // 6) STATS SECTION
    // =============================

    const stats = await this.selectOne(
      `SELECT 
          COUNT(*) AS total_sessions,
          SUM(estimated_hours) AS total_hours,
          SUM(CASE WHEN status='completed' THEN (estimated_hours * 20) ELSE 0 END) AS total_earnings,
          (SELECT AVG(rating) FROM interpreter_reviews WHERE interpreter_id = ?) AS rating
       FROM assignments
       WHERE interpreter_id = ?`,
      [interpreter_id, interpreter_id]
    );

    response.stats = {
      total_sessions: stats.total_sessions || 0,
      total_hours: stats.total_hours || 0,
      total_earnings: stats.total_earnings || 0,
      rating: Number(stats.rating || 0).toFixed(1)
    };

    // =============================
    // 7) RECENT SESSION HISTORY
    // =============================
    response.sessions = await this.select(
      `SELECT 
          a.id, a.title, a.location, a.date, a.start_time, a.end_time,
          a.estimated_hours, a.language_from, a.language_to,
          a.status,
          u.name AS client_name, u.avatar_url AS client_avatar
       FROM assignments a
       JOIN users u ON u.id = a.client_id
       WHERE a.interpreter_id = ?
       ORDER BY a.date DESC, a.start_time DESC
       LIMIT 20`,
      [interpreter_id]
    );

    // =============================
    // 8) REVIEWS
    // =============================
    response.reviews = await this.select(
      `SELECT 
          r.id, r.rating, r.review_text, r.created_at,
          u.name AS client_name, u.avatar_url AS client_avatar
       FROM interpreter_reviews r
       JOIN users u ON u.id = r.client_id
       WHERE r.interpreter_id = ?
       ORDER BY r.id DESC`,
      [interpreter_id]
    );

    // =============================
    // 9) AVAILABILITY
    // =============================
    response.availability = await this.select(
      `SELECT id, from_date, to_date, from_time, to_time, is_full_day
       FROM interpreter_unavailability
       WHERE interpreter_id = ?
       ORDER BY from_date ASC`,
      [interpreter_id]
    );

    this.s = 1;
    this.m = "Interpreter profile loaded";
    this.r = response;
    return this.send_res(res);

  } catch (err) {
    this.s = 0;
    this.err = err.message;
    return this.send_res(res);
  }
}


}
