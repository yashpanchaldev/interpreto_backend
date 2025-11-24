import { Base } from "../../service/base.js";
import { v2 as cloudinary } from "cloudinary";
import { v4 as uuidv4 } from "uuid";

export default class SignatureController extends Base {
  constructor() {
    super();
  }

  // Add or update interpreter signature
  async addSignature(req, res) {
    try {
      const user_id = req._id; // From auth middleware
      const { agreement_id } = req.body;

  if(this.varify_req(req,["agreement_id"])){
    this.s =0;
    return this.send_res(res)
  }

      // Check if agreement exists
      const agreement = await this.selectOne(
        "SELECT id FROM agreements WHERE id = ?",
        [agreement_id]
      );
      if (!agreement) {
        this.s = 0;
        this.m = "Agreement not found";
        return this.send_res(res);
      }

      // Upload signature
      let signatureUrl = null;

      if (req.files && req.files.signature) {
        const file = req.files.signature;
        const uploaded = await cloudinary.uploader.upload(
          file.tempFilePath ||
            `data:${file.mimetype};base64,${file.data.toString("base64")}`,
          {
            folder: "signatures",
            public_id: uuidv4(),
            resource_type: "auto",
          }
        );
        signatureUrl = uploaded.secure_url;
      } else if (req.body.signature_base64) {
        const base64 = req.body.signature_base64;
        const uploaded = await cloudinary.uploader.upload(base64, {
          folder: "signatures",
          public_id: uuidv4(),
        });
        signatureUrl = uploaded.secure_url;
      }

      if (!signatureUrl) {
        this.s = 0;
        this.m = "No signature file or base64 provided";
        return this.send_res(res);
      }

      // Check if already signed
      const existing = await this.selectOne(
        "SELECT id FROM interpreter_signatures WHERE user_id = ? AND agreement_id = ?",
        [user_id, agreement_id]
      );

      if (existing) {
        await this.update(
          "UPDATE interpreter_signatures SET signature_url = ?, signed_at = NOW() WHERE id = ?",
          [signatureUrl, existing.id]
        );
      } else {
        await this.insert(
          "INSERT INTO interpreter_signatures (user_id, agreement_id, signature_url) VALUES (?, ?, ?)",
          [user_id, agreement_id, signatureUrl]
        );
      }

      this.s = 1;
      this.m = "Signature uploaded successfully";
      this.r = {
        agreement_id,
        signature_url: signatureUrl,
      };
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

   async getSignatureById(req, res) {
    try {
      const { signature_id } = req.params;

      if (!signature_id) {
        this.s = 0;
        this.m = "signature_id is required";
        return this.send_res(res);
      }

      const row = await this.selectOne(
        `SELECT s.id, s.user_id, s.agreement_id, s.signature_url, s.signed_at,
                a.title AS agreement_title, a.type AS agreement_type
         FROM interpreter_signatures s
         LEFT JOIN agreements a ON s.agreement_id = a.id
         WHERE s.id = ?`,
        [signature_id]
      );

      if (!row) {
        this.s = 0;
        this.m = "Signature not found";
        return this.send_res(res);
      }

      this.s = 1;
      this.m = "Signature fetched successfully";
      this.r = row;
      return this.send_res(res);

    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  // ==========================================
  // 2. GET ALL SIGNATURES OF LOGGED-IN USER
  // ==========================================
  async getMySignatures(req, res) {
    try {
      const user_id = req._id;

      const rows = await this.select(
        `SELECT s.id AS signature_id, s.agreement_id, s.signature_url, s.signed_at,
                a.title AS agreement_title, a.type AS agreement_type
         FROM interpreter_signatures s
         LEFT JOIN agreements a ON s.agreement_id = a.id
         WHERE s.user_id = ?
         ORDER BY s.signed_at DESC`,
        [user_id]
      );

      this.s = 1;
      this.m = "My signatures fetched successfully";
      this.r = rows;
      return this.send_res(res);

    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  async deleteSignature(req, res) {
  try {
    const { signature_id } = req.params;
    const user_id = req._id;

    if (!signature_id) {
      this.s = 0;
      this.m = "signature_id is required";
      return this.send_res(res);
    }

    // Check ownership
    const exists = await this.selectOne(
      "SELECT id FROM interpreter_signatures WHERE id = ? AND user_id = ?",
      [signature_id, user_id]
    );

    if (!exists) {
      this.s = 0;
      this.m = "Signature not found or not authorized to delete";
      return this.send_res(res);
    }

    await this.delete("DELETE FROM interpreter_signatures WHERE id = ?", [
      signature_id,
    ]);

    this.s = 1;
    this.m = "Signature deleted successfully";
    return this.send_res(res);
  } catch (err) {
    this.s = 0;
    this.err = err.message;
    return this.send_res(res);
  }
}
}
