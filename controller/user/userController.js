import { Base } from "../../service/base.js";

export default class UserController extends Base {
  constructor() {
    super();
  }

  async addMoreInfo(req, res, next) {
    try {
      const {user_id,
        languages,
        experience_years,
        qualification,
        bio,
        hourly_rate,
        service_type,
        assignment_types,
        location,
        availability,
        name,
        phone,
      } = req.body;


      if (!user_id) {
        return res.status(400).json({ message: "user_id is required" });
      }

      const user = await this.selectOne(`SELECT * FROM users WHERE id = ?`, [user_id]);

      console.log(user)
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      if (user.role !== "interpreter") {
        return res.status(400).json({ message: "User is not an interpreter" });
      }

      // ✅ Proper MySQL query
      const profiles = await this.select(
        `SELECT * FROM interpreter_profiles WHERE user_id = ?`,
        [user_id]
      );
      console.log(profiles)

      const langJSON = JSON.stringify(languages || []);
      const assignJSON = JSON.stringify(assignment_types || []);

      if (profiles.length > 0) {
        // 🔄 Update existing interpreter profile
        await this.update(
          `UPDATE interpreter_profiles 
           SET languages = ?, experience_years = ?, qualification = ?, bio = ?, 
               hourly_rate = ?, service_type = ?, assignment_types = ?, 
               location = ?, availability = ?, updated_at = NOW()
           WHERE user_id = ?`,
          [
            langJSON,
            experience_years,
            qualification,
            bio,
            hourly_rate,
            service_type,
            assignJSON,
            location,
            availability,
            user_id,
          ]
        );
      } else {
        // 🆕 Insert new interpreter profile
        await this.insert(
          `INSERT INTO interpreter_profiles 
           (user_id, languages, experience_years, qualification, bio, hourly_rate, 
            service_type, assignment_types, verified, 
            location, availability)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?,  false, ?, ?)`,
          [
            user_id,
            langJSON,
            experience_years,
            qualification,
            bio,
            hourly_rate,
            service_type,
            assignJSON,
            location,
            availability,
          ]
        );
      }

      // ✅ Also update user's main table info if provided
      if (name || phone) {
        await this.update(
          `UPDATE users SET 
             name = COALESCE(?, name),
             phone = COALESCE(?, phone)
           WHERE id = ?`,
          [name, phone, user_id]
        );
      }

      return res.status(200).json({
        message: "Interpreter profile saved successfully",
        success: true,
      });
    } catch (error) {
      console.error("❌ Error adding interpreter info:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  }
}
