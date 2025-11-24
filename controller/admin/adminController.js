import { Base } from "../../service/base.js";

export default class AdminVerificationController extends Base {
  constructor() {
    super();
  }

  async checkAdmin(user_id) {
    const user = await this.selectOne("SELECT role FROM users WHERE id = ?", [
      user_id,
    ]);
    console.log(user)
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
        `SELECT * FROM interpreter_languages WHERE user_id = ?`,
        [interpreter_id]
      );

      const certificates = await this.select(
        `SELECT c.* 
         FROM interpreter_certificates c 
         JOIN interpreter_languages l ON c.language_id = l.id
         WHERE l.user_id = ?`,
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
    console.log(user)

    // Super admin cannot reject approved
    if ( user.status == "active") {
      this.s = 0;
      this.m = "Cannot reject approved interpreter. You can deactivate account.";
      return this.send_res(res);
    }

    await this.update(
      "UPDATE users SET status = 'rejected' WHERE id = ?",
      [interpreter_id]
    );

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



}
