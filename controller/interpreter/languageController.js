import { cloudinary } from "../../config/cloudinary.js";
import { Base } from "../../service/base.js";

export default class InterpreterLanguageController extends Base {
  constructor() {
    super();
  }

  // =====================================================
  // ADD LANGUAGE + CERTIFICATES
  // =====================================================
  async addLanguage(req, res) {
    try {
      const user_id = req._id;
      const { language_id, hourly_rate, is_sign_language } = req.body;

      // only interpreter can add language
      const user = await this.selectOne("SELECT role FROM users WHERE id = ?", [user_id]);
      if (!user || user.role !== "interpreter") {
        this.s = 0;
        this.m = "You are not an interpreter";
        return this.send_res(res);
      }

      // required
      if (!language_id) {
        this.s = 0;
        this.m = "language_id is required";
        return this.send_res(res);
      }

      // validate language master
      const langMaster = await this.selectOne("SELECT id, name FROM languages WHERE id = ?", [language_id]);
      if (!langMaster) {
        this.s = 0;
        this.m = "Invalid language_id";
        return this.send_res(res);
      }

      // no duplicate language
      const exists = await this.selectOne(
        "SELECT id FROM interpreter_languages WHERE interpreter_id = ? AND language_id = ?",
        [user_id, language_id]
      );

      if (exists) {
        this.s = 0;
        this.m = "Language already added";
        return this.send_res(res);
      }

      const hr = hourly_rate && !isNaN(hourly_rate) ? Number(hourly_rate) : 0;

      // INSERT
      const insertId = await this.insert(
        `INSERT INTO interpreter_languages 
         (interpreter_id, language_id, hourly_rate, is_sign_language)
         VALUES (?, ?, ?, ?)`,
        [user_id, language_id, hr, is_sign_language ? 1 : 0]
      );

      // upload certificates
      const uploadedCerts = [];

      if (req.files && req.files.certificates) {
        const files = Array.isArray(req.files.certificates)
          ? req.files.certificates
          : [req.files.certificates];

        for (const f of files) {
          const url = await this.uploadSingleFileToCloudinary(f, "interpreter_certificates");
          if (url) {
            uploadedCerts.push(url);
            await this.insert(
              "INSERT INTO interpreter_certificates (interpreter_language_id, file_url) VALUES (?, ?)",
              [insertId, url]
            );
          }
        }
      }

      this.s = 1;
      this.m = "Language added successfully";
      this.r = {
        id: insertId,
        language_id,
        language_name: langMaster.name,
        hourly_rate: hr,
        is_sign_language: is_sign_language ? 1 : 0,
        uploaded_certificates: uploadedCerts,
      };
      return this.send_res(res);
    } catch (error) {
      console.error("Error addLanguage:", error);
      this.s = 0;
      this.err = error.message;
      return this.send_res(res);
    }
  }

  // =====================================================
  // UPDATE LANGUAGE
  // =====================================================
  async updateLanguage(req, res) {
    try {
      const user_id = req._id;
      const langRowId = req.params.id;
      const { hourly_rate, is_sign_language } = req.body;

      const row = await this.selectOne("SELECT * FROM interpreter_languages WHERE id = ?", [langRowId]);
      if (!row) {
        this.s = 0;
        this.m = "Language entry not found";
        return this.send_res(res);
      }

      // only owner/interpreter and admin
      if (row.interpreter_id !== user_id) {
        const currentUser = await this.selectOne("SELECT role FROM users WHERE id = ?", [user_id]);
        if (!currentUser || currentUser.role !== "admin") {
          this.s = 0;  
          this.m = "Not authorized";
          return this.send_res(res);
        }
      }

      await this.update(
        `UPDATE interpreter_languages 
         SET hourly_rate = COALESCE(?, hourly_rate),
             is_sign_language = COALESCE(?, is_sign_language),
             updated_at = NOW()
         WHERE id = ?`,
        [
          hourly_rate !== undefined ? Number(hourly_rate) : null,
          is_sign_language !== undefined ? (is_sign_language ? 1 : 0) : null,
          langRowId
        ]
      );

      // upload new certificates
      const newCerts = [];

      if (req.files && req.files.certificates) {
        const files = Array.isArray(req.files.certificates)
          ? req.files.certificates
          : [req.files.certificates];

        for (const f of files) {
          const url = await this.uploadSingleFileToCloudinary(f, "interpreter_certificates");
          if (url) {
            newCerts.push(url);
            await this.insert(
              "INSERT INTO interpreter_certificates (interpreter_language_id, file_url) VALUES (?, ?)",
              [langRowId, url]
            );
          }
        }
      }

      this.s = 1;
      this.m = "Language updated";
      this.r = { updated_id: langRowId, new_certificates: newCerts };
      return this.send_res(res);
    } catch (err) {
      console.error("updateLanguage error:", err);
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  // =====================================================
  // DELETE LANGUAGE + CERTIFICATES
  // =====================================================
  async deleteLanguage(req, res) {
    try {
      const user_id = req._id;
      const langRowId = req.params.id;

      const row = await this.selectOne("SELECT * FROM interpreter_languages WHERE id = ?", [langRowId]);
      if (!row) {
        this.s = 0;
        this.m = "Language not found";
        return this.send_res(res);
      }

      // owner or admin only
      if (row.interpreter_id !== user_id) {
        const user = await this.selectOne("SELECT role FROM users WHERE id = ?", [user_id]);
        if (!user || user.role !== "admin") {
          this.s = 0;
          this.m = "Not authorized";
          return this.send_res(res);
        }
      }

      const certs = await this.select(
        "SELECT id, file_url FROM interpreter_certificates WHERE interpreter_language_id = ?",
        [langRowId]
      );

      for (const cert of certs) {
        const publicId = this.getPublicIdFromUrl(cert.file_url);
        if (publicId) {
          await cloudinary.uploader.destroy(`interpreter_certificates/${publicId}`).catch(() => {});
        }
        await this.delete("DELETE FROM interpreter_certificates WHERE id = ?", [cert.id]);
      }

      await this.delete("DELETE FROM interpreter_languages WHERE id = ?", [langRowId]);

      this.s = 1;
      this.m = "Language deleted successfully";
      return this.send_res(res);

    } catch (err) {
      console.error("deleteLanguage error:", err);
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  // =====================================================
  // DELETE SINGLE CERTIFICATE
  // =====================================================
  async deleteCertificate(req, res) {
    try {
      const certificate_id = req.params.id;

      if (!certificate_id) {
        this.s = 0;
        this.m = "certificate_id required";
        return this.send_res(res);
      }

      const cert = await this.selectOne(
        "SELECT file_url FROM interpreter_certificates WHERE id = ?",
        [certificate_id]
      );

      if (!cert) {
        this.s = 0;
        this.m = "Certificate not found";
        return this.send_res(res);
      }

      const publicId = this.getPublicIdFromUrl(cert.file_url);
      if (publicId) {
        await cloudinary.uploader.destroy(`interpreter_certificates/${publicId}`).catch(() => {});
      }

      await this.delete("DELETE FROM interpreter_certificates WHERE id = ?", [certificate_id]);

      this.s = 1;
      this.m = "Certificate deleted";
      return this.send_res(res);

    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  // =====================================================
  // Interpreter → My Languages
  // =====================================================
  async getMyLanguages(req, res) {
    try {
      const user_id = req._id;

      const rows = await this.fetch(
        `SELECT 
            il.id,
            il.interpreter_id,
            il.hourly_rate,
            il.is_sign_language,
            il.created_at,
            l.id AS language_id,
            l.name AS language_name
         FROM interpreter_languages il
         JOIN languages l ON l.id = il.language_id
         WHERE il.interpreter_id = ?
         ORDER BY il.created_at DESC`,
        [user_id]
      );

      this.s = 1;
      this.m = "Languages fetched";
      this.r = rows;
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  // =====================================================
  // Master Language List
  // =====================================================
  async listLanguages(req, res) {
    try {
      const rows = await this.fetch(
        "SELECT id, name, slug FROM languages ORDER BY name ASC"
      );

      this.s = 1;
      this.m = "Languages list";
      this.r = rows;
      return this.send_res(res);

    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }
}
