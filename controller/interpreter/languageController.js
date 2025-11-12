import { cloudinary } from "../../config/cloudinary.js";
import { Base } from "../../service/base.js";

export default class InterpreterLanguageController extends Base {
  constructor() {
    super();
  }

  async addLanguage(req, res) {
    try {
      const user_id = req._id; // from token middleware
      const { language_name, hourly_rate, is_sign_language } = req.body;

      const user = await this.selectOne("SELECT role FROM users WHERE id = ?", [
        user_id,
      ]);
      if (!user || user.role !== "interpreter") {
        this.s = 0;
        this.m = "You are not an interpreter";
        return this.send_res(res);
      }

      if (this.varify_req(req, ["language_name", "hourly_rate"])) {
        this.s = 0;
        this.m = "Missing required fields";
        return this.send_res(res);
      }

      // Check if language already exists
      const exists = await this.selectOne(
        "SELECT id FROM interpreter_languages WHERE user_id = ? AND language_name = ?",
        [user_id, language_name]
      );
      if (exists) {
        this.s = 0;
        this.m = "Language already exists. Use update API instead.";
        return this.send_res(res);
      }

      const languageId = await this.insert(
        `INSERT INTO interpreter_languages (user_id, language_name, hourly_rate, is_sign_language)
         VALUES (?, ?, ?, ?)`,
        [user_id, language_name, hourly_rate, is_sign_language || false]
      );

      // Upload multiple certificates (if provided)
      const uploadedCerts = [];
      if (req.files && req.files.certificates) {
        const files = Array.isArray(req.files.certificates)
          ? req.files.certificates
          : [req.files.certificates];

        for (const file of files) {
          const uploadedUrl = await this.uploadSingleFileToCloudinary(
            file,
            "interpreter_certificates"
          );
          if (uploadedUrl) {
            uploadedCerts.push(uploadedUrl);
            await this.insert(
              "INSERT INTO interpreter_certificates (language_id, file_url) VALUES (?, ?)",
              [languageId, uploadedUrl]
            );
          }
        }
      }

      this.s = 1;
      this.m = "Language added successfully";
      this.r = {
        language_id: languageId,
        uploaded_certificates: uploadedCerts,
      };
      return this.send_res(res);
    } catch (error) {
      console.error("Error in addLanguage:", error);
      this.s = 0;
      this.err = error.message;
      return this.send_res(res);
    }
  }

  async updateLanguage(req, res) {
    try {
      const user_id = req._id;
      const lang_id = req.params.id;
      const { language_name, hourly_rate } = req.body;

      const lang = await this.selectOne(
        "SELECT * FROM interpreter_languages WHERE id = ?",
        [lang_id]
      );

      if (!lang) {
        this.s = 0;
        this.m = "Language not found";
        return this.send_res(res);
      }

      // Only admin can change sign language field

      await this.update(
        `UPDATE interpreter_languages 
         SET language_name = COALESCE(?, language_name),
             hourly_rate = COALESCE(?, hourly_rate),
             updated_at = NOW()
         WHERE id = ?`,
        [language_name, hourly_rate, lang.id]
      );

      // Upload new certificates (old ones remain)
      const newCerts = [];
      if (req.files && req.files.certificates) {
        const files = Array.isArray(req.files.certificates)
          ? req.files.certificates
          : [req.files.certificates];

        for (const file of files) {
          const uploadedUrl = await this.uploadSingleFileToCloudinary(
            file,
            "interpreter_certificates"
          );
          if (uploadedUrl) {
            newCerts.push(uploadedUrl);
            await this.insert(
              "INSERT INTO interpreter_certificates (language_id, file_url) VALUES (?, ?)",
              [lang.id, uploadedUrl]
            );
          }
        }
      }

      this.s = 1;
      this.m = "Language updated successfully";
      this.r = {
        updated_language: language_name || old_language_name,
        new_certificates: newCerts,
      };
      return this.send_res(res);
    } catch (error) {
      console.error("Error updating language:", error);
      this.s = 0;
      this.err = error.message;
      return this.send_res(res);
    }
  }
  async deleteLanguage(req, res) {
    try {
      const user_id = req._id;
      const lan_id = req.params.id;

      const lang = await this.selectOne(
        "SELECT * FROM interpreter_languages WHERE id = ?",
        [lan_id]
      );

      if (!lang) {
        this.s = 0;
        this.m = "Language not found";
        return this.send_res(res);
      }

      // Delete certificates from Cloudinary and DB
      const certs = await this.select(
        "SELECT file_url FROM interpreter_certificates WHERE language_id = ?",
        [lan_id]
      );

      for (const cert of certs) {
        const publicId = this.getPublicIdFromUrl(cert.file_url);
        if (publicId) {
          await cloudinary.uploader
            .destroy(`interpreter_certificates/${publicId}`)
            .catch(() => {});
        }
      }

      await this.delete(
        "DELETE FROM interpreter_certificates WHERE language_id = ?",
        [lang.id]
      );
      await this.delete("DELETE FROM interpreter_languages WHERE id = ?", [
        lang.id,
      ]);

      this.s = 1;
      this.m = "Language and all certificates deleted successfully";
      return this.send_res(res);
    } catch (error) {
      console.error("Error deleting language:", error);
      this.s = 0;
      this.err = error.message;
      return this.send_res(res);
    }
  }
  async deleteCertificate(req, res) {
    try {
      const certificate_id = req.params.id;

      if (!certificate_id) {
        this.s = 0;
        this.m = "certificate_id is required";
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
        await cloudinary.uploader
          .destroy(`interpreter_certificates/${publicId}`)
          .catch(() => {});
      }

      await this.delete("DELETE FROM interpreter_certificates WHERE id = ?", [
        certificate_id,
      ]);

      this.s = 1;
      this.m = "Certificate deleted successfully";
      return this.send_res(res);
    } catch (error) {
      console.error("Error deleting certificate:", error);
      this.s = 0;
      this.err = error.message;
      return this.send_res(res);
    }
  }
}
