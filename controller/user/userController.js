import { v2 as cloudinary } from "cloudinary";
import { Base } from "../../service/base.js";

export default class UserController extends Base {
  constructor() {
    super();
  }
  async updateProfile(req, res) {
    try {
      console.log(req.body)
      const user_id = req._id;
      const body = req.body;

      // Upload avatar if passed
      let avatarUrl = null;
      if (req.files && req.files.avatar) {
        const file = req.files.avatar;
        const uploaded = await cloudinary.uploader.upload(
          file.tempFilePath || `data:${file.mimetype};base64,${file.data.toString("base64")}`,
          { folder: "avatars" }
        );
        avatarUrl = uploaded.secure_url;
      }

      // Fetch user to know the role
      const user = await this.selectOne("SELECT role FROM users WHERE id = ?", [user_id]);

      if (!user) {
        this.s = 0;
        this.m = "User not found";
        return this.send_res(res);
      }

      // =====================================================
      // UPDATE USERS TABLE
      // =====================================================
      await this.update(
        `UPDATE users SET
          name = COALESCE(?, name),
          email = COALESCE(?, email),
          phone = COALESCE(?, phone),
          address = COALESCE(?, address),
          avatar_url = COALESCE(?, avatar_url),
          updated_at = NOW()
        WHERE id = ?`,
        [
          body.name || null,
          body.email || null,
          body.phone || null,
          body.address || null,
          avatarUrl || null,
          user_id,
        ]
      );

      // =====================================================
      // IF INTERPRETER → UPDATE interpreter_profiles
      // =====================================================
      if (user.role === "interpreter") {
        await this.update(
          `UPDATE interpreter_profiles SET
            zip_code = COALESCE(?, zip_code),
            service_radius = COALESCE(?, service_radius),
            fee_min = COALESCE(?, fee_min),
            fee_max = COALESCE(?, fee_max),
            qualification = COALESCE(?, qualification),
            experience_years = COALESCE(?, experience_years),
            gov_id = COALESCE(?, gov_id)
          WHERE user_id = ?`,
          [
            body.zip_code || null,
            body.service_radius || null,
            body.fee_min || null,
            body.fee_max || null,
            body.qualification || null,
            body.experience_years || null,
            body.gov_id || null,
            user_id,
          ]
        );

        // ===============================================
        // UPDATE SERVICES (mapping table)
        // ===============================================

        const service_type = JSON.parse(body.service_type)
        if (Array.isArray(service_type)) {
          await this.delete("DELETE FROM interpreter_services WHERE interpreter_id = ?", [user_id]);

          for (const sid of service_type) {
            await this.insert(
              `INSERT INTO interpreter_services (interpreter_id, service_id) VALUES (?, ?)`,
              [user_id, sid]
            );
          }
        }

        // ===============================================
        // UPDATE ASSIGNMENT TYPES (mapping table)
        // ===============================================
        const assignment_types = JSON.parse(body.assignment_types)

        if (Array.isArray(assignment_types)) {
          await this.delete(
            "DELETE FROM interpreter_assignment_types WHERE interpreter_id = ?",
            [user_id]
          );

          for (const aid of assignment_types) {
            await this.insert(
              `INSERT INTO interpreter_assignment_types (interpreter_id, assignment_type_id) VALUES (?, ?)`,
              [user_id, aid]
            );
          }
        }
      }

      this.s = 1;
      this.m = "Profile updated successfully";
      return this.send_res(res);

    } catch (err) {
      console.log(err)
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  async getProfile(req, res) {
  try {
    const user_id = req._id;

    // =======================
    // 1) GET USER BASIC DATA
    // =======================
    const user = await this.selectOne(
      `SELECT id, role, name, email, phone, address, avatar_url, created_at 
       FROM users 
       WHERE id = ?`,
      [user_id]
    );

    if (!user) {
      this.s = 0;
      this.m = "User not found";
      return this.send_res(res);
    }

    let response = {
      user,
      interpreter_profile: null,
      services: [],
      assignment_types: [],
      languages: []
    };

    if (user.role !== "interpreter") {
      this.s = 1;
      this.m = "Profile fetched";
      this.r = response;
      return this.send_res(res);
    }

    const profile = await this.selectOne(
      `SELECT 
          zip_code,
          service_radius,
          fee_min,
          fee_max,
          qualification,
          experience_years,
          gov_id,
          verified
       FROM interpreter_profiles
       WHERE user_id = ?`,
      [user_id]
    );

    response.interpreter_profile = profile;

    const services = await this.select(
      `SELECT 
          s.id AS service_id,
          s.name AS service_name
       FROM interpreter_services isv
         JOIN services s ON s.id = isv.service_id
       WHERE isv.interpreter_id = ?`,
      [user_id]
    );
    response.services = services;

    const assignmentTypes = await this.select(
      `SELECT 
          at.id AS assignment_type_id,
          at.name AS assignment_type_name
       FROM interpreter_assignment_types iat
         JOIN assignment_types at ON at.id = iat.assignment_type_id
       WHERE iat.interpreter_id = ?`,
      [user_id]
    );
    response.assignment_types = assignmentTypes;
    const languages = await this.select(
      `SELECT 
          il.id,
          l.id AS language_id,
          l.name AS language_name,
          il.hourly_rate,
          il.is_sign_language,
          il.created_at
       FROM interpreter_languages il
         JOIN languages l ON l.id = il.language_id
       WHERE il.interpreter_id = ?`,
      [user_id]
    );

    for (let lang of languages) {
      const certs = await this.select(
        `SELECT id, file_url 
         FROM interpreter_certificates 
         WHERE interpreter_language_id = ?`,
        [lang.id]
      );

      lang.certificates = certs;
    }

    response.languages = languages;
    this.s = 1;
    this.m = "Profile fetched successfully";
    this.r = response;
    return this.send_res(res);

  } catch (err) {
    this.s = 0;
    this.err = err.message;
    return this.send_res(res);
  }
}

async allowLocation(req, res) {
  try {
    const user_id = req._id;
    const { lat, lng } = req.body;

    if(this.varify_req(req,["lat","lng"])){
      this.s = 0;
      return this.send_res(res);
    }
  

    // Update in DB
    await this.update(
      `UPDATE users SET latitude = ?, longitude = ?, updated_at = NOW() WHERE id = ?`,
      [lat, lng, user_id]
    );

    this.s = 1;
    this.m = "Location updated successfully";
    this.r = { lat, lng };
    return this.send_res(res);

  } catch (err) {
    console.log(err);
    this.s = 0;
    this.err = err.message;
    return this.send_res(res);
  }
}
async referralHistory(req, res) {
  try {
    const user_id = req._id;

    const rows = await this.select(
      `SELECT 
          r.id,
          u.name,
          r.status,
          DATE_FORMAT(r.created_at, '%d/%m/%Y') AS date
       FROM referrals r
       LEFT JOIN users u ON u.id = r.referred_id
       WHERE r.referrer_id = ?
       ORDER BY r.id DESC`,
      [user_id]
    );

    this.s = 1;
    this.m = "Referral history";
    this.r = rows;
    return this.send_res(res);

  } catch (err) {
    this.s = 0;
    this.err = err.message;
    return this.send_res(res);
  }
}



}
