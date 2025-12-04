import { Base } from "../../service/base.js";
import { v2 as cloudinary } from "cloudinary";
import { v4 as uuidv4 } from "uuid";

export default class AgreementController extends Base {
  constructor() {
    super();
  }

  // ============================================================
  // ADMIN: ADD AGREEMENT
  // ============================================================
  async addAgreement(req, res) {
    try {
      const admin_id = req._id;
      const { title, type, content } = req.body;
      console.log(req.body)

      const user = await this.selectOne("SELECT role FROM users WHERE id = ?", [admin_id]);
      if (!user || user.role !== "admin") {
        this.s = 0;
        this.m = "Only admin can add agreements";
        return this.send_res(res);
      }

      if (!title || !type || !content) {
        this.s = 0;
        this.m = "title, type & content are required";
        return this.send_res(res);
      }

      // INSERT agreement
      await this.insert(
        `INSERT INTO agreements (title, type, content) 
         VALUES (?, ?, ?)`,
        [title, type, content]
      );

      this.s = 1;
      this.m = "Agreement added successfully";
      return this.send_res(res);

    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }


  //* ============================================================
  // ADMIN: UPDATE AGREEMENT
  // ============================================================
  async updateAgreement(req, res) {
    try {
      const admin_id = req._id;
      const id = req.params.id;
      const { title, type, content } = req.body;

      const user = await this.selectOne("SELECT role FROM users WHERE id = ?", [admin_id]);
      if (!user || user.role !== "admin") {
        this.s = 0;
        this.m = "Only admin can update agreements";
        return this.send_res(res);
      }

      if (!id) {
        this.s = 0;
        this.m = "Agreement ID is required";
        return this.send_res(res);
      }

      await this.update(
        `UPDATE agreements 
         SET 
           title = COALESCE(?, title),
           type = COALESCE(?, type),
           content = COALESCE(?, content)
         WHERE id = ?`,
        [title || null, type || null, content || null, id]
      );

      this.s = 1;
      this.m = "Agreement updated successfully";
      return this.send_res(res);

    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }


  // ============================================================
  // ADMIN: DELETE AGREEMENT
  // ============================================================
  async deleteAgreement(req, res) {
    try {
      const admin_id = req._id;
      const { id } = req.params;

      const user = await this.selectOne("SELECT role FROM users WHERE id = ?", [admin_id]);
      if (!user || user.role !== "admin") {
        this.s = 0;
        this.m = "Only admin can delete agreements";
        return this.send_res(res);
      }

      if (!id) {
        this.s = 0;
        this.m = "Agreement ID is required";
        return this.send_res(res);
      }

      // Delete linked signatures
      await this.delete(
        "DELETE FROM interpreter_signatures WHERE agreement_id = ?", 
        [id]
      );

      // Delete agreement
      await this.delete("DELETE FROM agreements WHERE id = ?", [id]);

      this.s = 1;
      this.m = "Agreement deleted successfully";
      return this.send_res(res);

    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }


  // ============================================================
  // INTERPRETER: SIGN AGREEMENT (OPTIONAL)
  // ============================================================
  async signAgreement(req, res) {
    try {
      const user_id = req._id;
      const { agreement_id } = req.body;

      if (!agreement_id) {
        this.s = 0;
        this.m = "agreement_id is required";
        return this.send_res(res);
      }

      let signatureUrl = null;

      // Upload signature
      if (req.files && req.files.signature) {
        const file = req.files.signature;
        const result = await cloudinary.uploader.upload(
          file.tempFilePath || `data:${file.mimetype};base64,${file.data.toString("base64")}`, 
          {
            folder: "signatures",
            public_id: uuidv4(),
            resource_type: "auto"
          }
        );
        signatureUrl = result.secure_url;
      } 
      else if (req.body.signature_base64) {
        const result = await cloudinary.uploader.upload(req.body.signature_base64, {
          folder: "signatures",
          public_id: uuidv4(),
        });
        signatureUrl = result.secure_url;
      }

      if (!signatureUrl) {
        this.s = 0;
        this.m = "Signature not provided";
        return this.send_res(res);
      }

      const exists = await this.selectOne(
        "SELECT id FROM interpreter_signatures WHERE user_id = ? AND agreement_id = ?",
        [user_id, agreement_id]
      );

      if (exists) {
        await this.update(
          "UPDATE interpreter_signatures SET signature_url = ?, signed_at = NOW() WHERE id = ?",
          [signatureUrl, exists.id]
        );
      } else {
        await this.insert(
          "INSERT INTO interpreter_signatures (user_id, agreement_id, signature_url) VALUES (?, ?, ?)",
          [user_id, agreement_id, signatureUrl]
        );
      }

      this.s = 1;
      this.m = "Agreement signed successfully";
      this.r = { agreement_id, signature_url: signatureUrl };
      return this.send_res(res);

    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }
}
