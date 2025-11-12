import { CONFIG } from "../config/flavour.js";
import { POOL } from "../config/database.js";
import path from "path";
import crypto from "crypto";
import axios from "axios";
import qs from "qs";
import { v4 as uuidv4 } from "uuid";
import { cloudinary } from "../config/cloudinary.js";

class Base {
  constructor() {
    this.s = 0;
    this.m = "Something went wrong please try again...";
    this.r = null;
    this.c = null;
    this.err = null;
    this.db = POOL;
  }

  // varify required perms
  varify_req(req, perm, media = []) {
    const is_required = [];
    const p = { ...req.body, ...req.params, ...req.query };

    for (const k of perm) {
      if (!p.hasOwnProperty(k) || (p[k] != null && p[k].length <= 0)) {
        is_required.push(k);
      }
    }

    for (const m of media) {
      if (!req.files || !req.files[m]) {
        is_required.push(m);
      }
    }

    if (is_required.length > 0) {
      this.m = `Required : ${is_required.join(" ")}`;
      this.s = 0;
      return true;
    }

    return false;
  }

  // send response
  send_res(res) {
    return res.json({
      s: this.s,
      m: this.m,
      r: this.r,
      c: this.c,
      err: this.err,
    });
  }

  // generate password
  generate_password(data) {
    return crypto
      .createHmac("sha256", `${CONFIG.APP_SECRET}`)
      .update(data)
      .digest("hex");
  }

  // check password
  check_password(hex, data) {
    return (
      crypto
        .createHmac("sha256", `${CONFIG.APP_SECRET}`)
        .update(data)
        .digest("hex") === hex
    );
  }

  encrypt_password(password) {
    const algorithm = "aes-256-cbc";
    const key = crypto.createHash("sha256").update(CONFIG.APP_SECRET).digest();
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(password, "utf8", "hex");
    encrypted += cipher.final("hex");

    return iv.toString("hex") + ":" + encrypted;
  }

  decrypt_password(encryptedPassword) {
    const algorithm = "aes-256-cbc";
    const key = crypto.createHash("sha256").update(CONFIG.APP_SECRET).digest();

    const parts = encryptedPassword.split(":");
    const iv = Buffer.from(parts[0], "hex");
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  validate_password(encrypted, plainPassword) {
    const decrypted = this.decrypt_password(encrypted);

    return decrypted === plainPassword;
  }

  // generate apikey
  generate_apikey(user_id) {
    return crypto
      .createHmac("sha256", `${CONFIG.APP_SECRET}`)
      .update(user_id.toString())
      .digest("hex");
  }

  // generate token
  generate_token(user_id) {
    return crypto
      .createHmac("md5", `${CONFIG.APP_SECRET}`)
      .update(user_id.toString())
      .digest("hex");
  }

  // random token
  generate_random_string() {
    return crypto.randomBytes(16).toString("hex");
  }

  // Ensure random password matches regex:
  // At least 1 uppercase, 1 lowercase, 1 digit, 1 special character, and 8+ characters
  generate_strong_password(length = 8) {
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const digits = "0123456789";
    // Special characters: anything not a word character or whitespace
    const special = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
    const all = upper + lower + digits + special;

    const regex = /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[^\w\s]).{8,}$/;

    let password = "";
    do {
      let chars = [
        upper[Math.floor(Math.random() * upper.length)],
        lower[Math.floor(Math.random() * lower.length)],
        digits[Math.floor(Math.random() * digits.length)],
        special[Math.floor(Math.random() * special.length)],
      ];
      for (let i = chars.length; i < length; i++) {
        chars.push(all[Math.floor(Math.random() * all.length)]);
      }
      // Shuffle
      for (let i = chars.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [chars[i], chars[j]] = [chars[j], chars[i]];
      }
      password = chars.join("");
    } while (!regex.test(password));
    return password;
  }

  // insert query
  async insert(query, prms) {
    try {
      var rows = await this.db.query(query, prms);
      return rows[0].insertId;
    } catch (err) {
      console.log(err.message);
      this.err = err.message;
      return false;
    }
  }

  // selectone query
  async selectOne(query, prms) {
    try {
      var rows = await this.db.query(query, prms);
      return rows[0][0] ? rows[0][0] : null;
    } catch (err) {
      console.log(err.message);
      this.err = err.message;
      return false;
    }
  }

  // select query
  async select(query, prms) {
    try {
      var rows = await this.db.query(query, prms);
      return rows[0] ? rows[0] : [];
    } catch (err) {
      console.log(err.message);
      this.err = err.message;
      return false;
    }
  }

  // update query
  async update(query, prms) {
    try {
      await this.db.query(query, prms);
      return true;
    } catch (err) {
      console.log(err.message);
      this.err = err.message;
      return false;
    }
  }

  // delete query
  async delete(query, prms) {
    try {
      await this.db.query(query, prms);
      return true;
    } catch (err) {
      console.log(err.message);
      this.err = err.message;
      return false;
    }
  }

  async begin_transaction() {
    try {
      await this.db.query("START TRANSACTION");
    } catch (err) {
      console.log(err.message);
      this.err = err.message;
      return false;
    }
  }

  async commit() {
    try {
      await this.db.query("COMMIT");
    } catch (err) {
      console.log(err.message);
      this.err = err.message;
      return false;
    }
  }

  async rollback() {
    try {
      await this.db.query("ROLLBACK");
    } catch (err) {
      console.log(err.message);
      this.err = err.message;
      return false;
    }
  }

  // destroy
  async destroy() {
    try {
      this.db.destroy();
      return true;
    } catch (err) {
      console.log(err.message);
      this.err = err.message;
      return false;
    }
  }

  async upload_file(file, pathDirectory) {
    try {
      if (!file) {
        return null;
      }
      const extension = path.extname(file.name);
      const fileName = crypto.randomBytes(16).toString("hex") + extension;
      const uploadPath = `./public/uploads/${pathDirectory}/${fileName}`;
      await file.mv(uploadPath);
      return `/uploads/${pathDirectory}/${fileName}`;
    } catch (err) {
      this.error = err.message;
      console.error(err.message);
      return null;
    }
  }
    async uploadToCloudinary(file, folder = "general") {
  try {
    if (!file) return null;

    let uploadOptions = {
      folder,
      public_id: uuidv4(),
      resource_type: "auto",
    };
    let result;
    if (file.tempFilePath && file.tempFilePath !== "") {
      // Case: Agar tempFilePath available hai
      result = await cloudinary.uploader.upload(file.tempFilePath, uploadOptions);
    } else {
      // Case: Agar sirf buffer available hai (express-fileupload without useTempFiles)
      const base64 = `data:${file.mimetype};base64,${file.data.toString("base64")}`;
      result = await cloudinary.uploader.upload(base64, uploadOptions);
    }
    return result.secure_url;
  } catch (err) {
    console.error("Cloudinary Upload Error (single):", err.message);
    return null;
  }
}

 async uploadSingleFileToCloudinary(file, folder = "general") {
    try {
      if (!file) return null;

      const options = {
        folder,
        public_id: uuidv4(),
        resource_type: "auto"
      };

      let result;
      if (file.tempFilePath && file.tempFilePath !== "") {
        // Case 1: express-fileupload with useTempFiles
        result = await cloudinary.uploader.upload(file.tempFilePath, options);
      } else if (file.data) {
        // Case 2: express-fileupload without temp files (uses buffer)
        const base64 = `data:${file.mimetype};base64,${file.data.toString("base64")}`;
        result = await cloudinary.uploader.upload(base64, options);
      } else {
        console.warn("Invalid file input:", file);
        return null;
      }

      return result.secure_url;
    } catch (err) {
      console.error("Cloudinary upload error:", err.message);
      return null;
    }
  }
  getPublicIdFromUrl(url) {
    try {
      if (!url) return null;
      const parts = url.split("/");
      const filename = parts[parts.length - 1];
      const [publicId] = filename.split(".");
      return publicId;
    } catch {
      return null;
    }
  }

   async uploadMultipleToCloudinary(files, pathDirectory) {
  try {
    if (!files) return [];

    const folderPath = pathDirectory || "general";
    const urls = [];

    if (Array.isArray(files)) {
      for (let file of files) {
        const uniqueName = uuidv4();
        const result = await cloudinary.uploader.upload(
          file.tempFilePath || file.path || file,
          {
            folder: "HealthCare",
            public_id: uniqueName,
            resource_type: "auto",
          }
        );
        urls.push(result.secure_url);
      }
    } else {
      // Agar sirf ek file ho
      const uniqueName = uuidv4();
      const result = await cloudinary.uploader.upload(
        files.tempFilePath || files.path || files,
        {
          folder: folderPath,
          public_id: uniqueName,
          resource_type: "auto",
        }
      );
      urls.push(result.secure_url);
    }
    return urls;
  } catch (err) {
    console.error("Cloudinary Upload Error:", err.message);
    return [];
  }
}
  // Hash OTP or any secret data
  async generateHash(data) {
    return new Promise((resolve, reject) => {
      const salt = crypto.randomBytes(16).toString("hex");
      crypto.scrypt(data, salt, 64, (err, derivedKey) => {
        if (err) return reject(err);
        resolve(salt + ":" + derivedKey.toString("hex")); // salt + hash
      });
    });
  }

  // Compare plain OTP with hashed version
  async compareHash(data, storedHash) {
    return new Promise((resolve, reject) => {
      const [salt, key] = storedHash.split(":");
      crypto.scrypt(data, salt, 64, (err, derivedKey) => {
        if (err) return reject(err);
        resolve(key === derivedKey.toString("hex"));
      });
    });
  }
}

export { Base };
