import axios from "axios";
import "../../routes/auth.js";
import { Base } from "../../service/base.js";
import MailService from "../../service/mail.js";

export default class AuthController extends Base {
  constructor() {
    super();
  }

  //  SIGNUP API
  // SIGNUP API
  // SIGNUP API
  async signup(req, res) {
    try {
      const {
        name,
        email,
        phone,
        password,
        role, // client | interpreter
        address,
        referral_code: usedReferralCode,
        is_business,
        business_name,
        zip_code,
        service_radius,
        fee_min,
        fee_max,
        qualification,
        experience_years,
        gov_id,
        latitude,
        longitude,
      } = req.body;

      // ----------- JSON FIELDS (service_type, assignment_type) -------------
      let service_type = [];
      let assignment_type = [];

      try {
        service_type =
          typeof req.body.service_type === "string"
            ? JSON.parse(req.body.service_type)
            : req.body.service_type || [];

        assignment_type =
          typeof req.body.assignment_type === "string"
            ? JSON.parse(req.body.assignment_type)
            : req.body.assignment_type || [];
      } catch (e) {
        this.s = 0;
        this.m = "Invalid JSON format in service_type or assignment_type.";
        return this.send_res(res);
      }

      // Validate required fields
      if (this.varify_req(req, ["name", "email", "password", "role"])) {
        this.s = 0;
        this.m = "Missing required fields.";
        return this.send_res(res);
      }

      // Check duplicate
      const existingUser = await this.selectOne(
        "SELECT id FROM users WHERE email = ? OR phone = ?",
        [email, phone]
      );

      if (existingUser) {
        this.s = 0;
        this.m = "Email or phone already registered.";
        return this.send_res(res);
      }

      const passwordHash = await this.generate_password(password);
      const status = role === "interpreter" ? "pending" : "active";

      await this.begin_transaction();

      // Create user
      const userId = await this.insert(
        `INSERT INTO users 
        (role, name, email, phone, password_hash, address, 
         business_name, is_business, status, 
         is_email_verified, is_phone_verified,
         latitude, longitude, wallet_balance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 0)`,
        [
          role,
          name,
          email,
          phone,
          passwordHash,
          address || null,
          business_name || null,
          is_business ? 1 : 0,
          status,
          latitude || null,
          longitude || null,
        ]
      );

      if (!userId) {
        this.s = 0;
        this.m = "Failed to create user.";
        return this.send_res(res);
      }

      // Generate unique referral code
      const newReferralCode = (
        "REF" +
        userId +
        Math.random().toString(36).substring(2, 8)
      ).toUpperCase();

      await this.update("UPDATE users SET referral_code = ? WHERE id = ?", [
        newReferralCode,
        userId,
      ]);

      

      // Interpreter Extra Tables
      if (role === "interpreter") {
        // Insert profile
        await this.insert(
          `INSERT INTO interpreter_profiles 
          (user_id, zip_code, service_radius, fee_min, fee_max, 
           qualification, experience_years, verified, gov_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
          [
            userId,
            zip_code || null,
            service_radius || null,
            fee_min || null,
            fee_max || null,
            qualification || null,
            experience_years || null,
            gov_id || null,
          ]
        );

        // Service mapping
        if (Array.isArray(service_type)) {
          for (const sid of service_type) {
            await this.insert(
              `INSERT INTO interpreter_services(interpreter_id, service_id) VALUES (?, ?)`,
              [userId, sid]
            );
          }
        }

        // Assignment type mapping
        if (Array.isArray(assignment_type)) {
          for (const aid of assignment_type) {
            await this.insert(
              `INSERT INTO interpreter_assignment_types(interpreter_id, assignment_type_id) VALUES (?, ?)`,
              [userId, aid]
            );
          }
        }
      }

      // APPLY REFER & EARN
      if (usedReferralCode) {
        const referrer = await this.selectOne(
          "SELECT id FROM users WHERE referral_code = ?",
          [usedReferralCode]
        );

        if (referrer && referrer.id !== userId) {
          // Record referral history
          await this.insert(
            `INSERT INTO referrals (referrer_id, referred_id, referral_code, status, created_at)
           VALUES (?, ?, ?, 'joined', NOW())`,
            [referrer.id, userId, usedReferralCode]
          );

          // Add rewards: Referrer +200, New User +100
          await this.update(
            "UPDATE users SET wallet_balance = wallet_balance + 200 WHERE id = ?",
            [referrer.id]
          );

          await this.update(
            "UPDATE users SET wallet_balance = wallet_balance + 100 WHERE id = ?",
            [userId]
          );
        }
      }

      // AUTH CREATION (Token + OTP)
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const hashedOtp = await this.generateHash(otp);
      const expires = new Date(Date.now() + 10 * 60 * 1000);

      const apikey = await this.generate_apikey(userId);
      const token = await this.generate_token(userId);

      await this.insert(
        `INSERT INTO user_auth(user_id, apikey, token, otp_token, otp_expires)
       VALUES (?, ?, ?, ?, ?)`,
        [userId, apikey, token, hashedOtp, expires]
      );

      // Send OTP
      const mailService = new MailService();
      await mailService.sendMail({
        to: email,
        subject: "Verify your email",
        templateName: "verify_email_otp",
        data: { name, otp },
      });

      await this.commit();

      this.s = 1;
      this.m = "Signup successful. Verify your email.";
      this.r = { user_id: userId, referral_code: newReferralCode };
      return this.send_res(res);
    } catch (err) {
      await this.rollback();
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  //  VERIFY EMAIL API
  async verifyEmail(req, res) {
    try {
      if (this.varify_req(req, ["email", "otp"])) {
        this.s = 0;
        this.m = "Missing email or otp.";
        return this.send_res(res);
      }

      const { email, otp } = req.body;

      const user = await this.selectOne(
        "SELECT id, is_email_verified FROM users WHERE email = ?",
        [email]
      );
      if (!user) {
        this.s = 0;
        this.m = "Email not registered.";
        return this.send_res(res);
      }

      if (user.is_email_verified) {
        this.s = 0;
        this.m = "Email already verified.";
        return this.send_res(res);
      }

      const auth = await this.selectOne(
        "SELECT otp_expires, otp_token FROM user_auth WHERE user_id = ?",
        [user.id]
      );

      if (!auth || !auth.otp_token) {
        this.s = 0;
        this.m = "No OTP record found. Please request a new OTP.";
        return this.send_res(res);
      }

      if (new Date(auth.otp_expires) < new Date()) {
        this.s = 0;
        this.m = "OTP expired. Please resend.";
        return this.send_res(res);
      }

      const isValidOtp = await this.compareHash(otp, auth.otp_token);
      if (!isValidOtp) {
        this.s = 0;
        this.m = "Invalid OTP.";
        return this.send_res(res);
      }

      //  Update verification
      await this.update("UPDATE users SET is_email_verified = 1 WHERE id = ?", [
        user.id,
      ]);
      await this.update(
        "UPDATE user_auth SET otp_token = NULL, otp_expires = NULL WHERE user_id = ?",
        [user.id]
      );

      this.s = 1;
      this.m = "Email verified successfully. You can now login.";
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  //  RESEND EMAIL OTP
  async resendEmailOtp(req, res) {
    try {
      if (this.varify_req(req, ["email"])) {
        this.s = 0;
        this.m = "Missing email.";
        return this.send_res(res);
      }

      const { email } = req.body;
      const user = await this.selectOne(
        "SELECT id, name, is_email_verified FROM users WHERE email = ?",
        [email]
      );
      if (!user) {
        this.s = 0;
        this.m = "Email not registered.";
        return this.send_res(res);
      }

      if (user.is_email_verified) {
        this.s = 0;
        this.m = "Email already verified.";
        return this.send_res(res);
      }

      const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
      const hashedNewOtp = await this.generateHash(newOtp);
      const newExpires = new Date(Date.now() + 10 * 60 * 1000);

      await this.update(
        "UPDATE user_auth SET otp_token = ?, otp_expires = ? WHERE user_id = ?",
        [hashedNewOtp, newExpires, user.id]
      );

      const mailService = new MailService();
      await mailService.sendMail({
        to: email,
        subject: "Resend OTP - Verify your email",
        templateName: "verify_email_otp",
        data: { name: user.name, otp: newOtp },
      });

      this.s = 1;
      this.m = "OTP resent successfully.";
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  //  LOGIN API
  async login(req, res) {
    try {
      if (this.varify_req(req, ["email", "password"])) {
        this.s = 0;
        this.m = "Missing email or password.";
        return this.send_res(res);
      }

      const { email, password } = req.body;

      const user = await this.selectOne("SELECT * FROM users WHERE email = ?", [
        email,
      ]);

      if (!user) {
        this.s = 0;
        this.m = "Email not registered.";
        return this.send_res(res);
      }

      const isPasswordCorrect = await this.check_password(
        user.password_hash,
        password
      );

      if (!isPasswordCorrect) {
        this.s = 0;
        this.m = "Incorrect password.";
        return this.send_res(res);
      }

      if (!user.is_email_verified) {
        this.s = 0;
        this.m = "Please verify your email before login.";
        return this.send_res(res);
      }

      const auth = await this.selectOne(
        "SELECT apikey, token FROM user_auth WHERE user_id = ?",
        [user.id]
      );

      this.s = 1;
      this.m = "Login successful.";
      this.r = {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          status: user.status,
        },
        auth,
        nextStep:
          user.role === "interpreter"
            ? "open_interpreter_dashboard"
            : "open_client_dashboard",
      };
      return this.send_res(res);
    } catch (error) {
      this.s = 0;
      this.err = error.message;
      return this.send_res(res);
    }
  }

  async forgotPassword(req, res) {
    try {
      if (this.varify_req(req, ["email"])) {
        this.s = 0;
        this.m = "Missing email.";
        return this.send_res(res);
      }

      const { email } = req.body;

      const user = await this.selectOne(
        "SELECT id, name FROM users WHERE email = ?",
        [email]
      );

      if (!user) {
        this.s = 0;
        this.m = "Email not registered.";
        return this.send_res(res);
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const hashedOtp = await this.generateHash(otp);
      const expires = new Date(Date.now() + 10 * 60 * 1000);

      const existingAuth = await this.selectOne(
        "SELECT id FROM user_auth WHERE user_id = ?",
        [user.id]
      );

      if (existingAuth) {
        await this.update(
          "UPDATE user_auth SET otp_token = ?, otp_expires = ? WHERE user_id = ?",
          [hashedOtp, expires, user.id]
        );
      } else {
        await this.insert(
          "INSERT INTO user_auth (user_id, otp_token, otp_expires) VALUES (?, ?, ?)",
          [user.id, hashedOtp, expires]
        );
      }

      const mailService = new MailService();
      await mailService.sendMail({
        to: email,
        subject: "Reset your password - OTP Verification",
        templateName: "forgot_password_otp",
        data: { name: user.name, otp },
      });

      this.s = 1;
      this.m = "OTP sent to your email for password reset.";
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }

  async resetPassword(req, res) {
    try {
      if (this.varify_req(req, ["email", "otp", "newPassword"])) {
        this.s = 0;
        this.m = "Missing required fields.";
        return this.send_res(res);
      }

      const { email, otp, newPassword } = req.body;

      const user = await this.selectOne(
        "SELECT id FROM users WHERE email = ?",
        [email]
      );
      if (!user) {
        this.s = 0;
        this.m = "Email not registered.";
        return this.send_res(res);
      }

      const auth = await this.selectOne(
        "SELECT otp_token, otp_expires FROM user_auth WHERE user_id = ?",
        [user.id]
      );

      if (!auth || !auth.otp_token) {
        this.s = 0;
        this.m = "No OTP found. Please request a new OTP.";
        return this.send_res(res);
      }

      if (new Date(auth.otp_expires) < new Date()) {
        this.s = 0;
        this.m = "OTP expired. Please resend.";
        return this.send_res(res);
      }

      const isValidOtp = await this.compareHash(otp, auth.otp_token);
      if (!isValidOtp) {
        this.s = 0;
        this.m = "Invalid OTP.";
        return this.send_res(res);
      }

      const hashedPassword = await this.generate_password(newPassword);
      await this.update("UPDATE users SET password_hash = ? WHERE id = ?", [
        hashedPassword,
        user.id,
      ]);

      await this.update(
        "UPDATE user_auth SET otp_token = NULL, otp_expires = NULL WHERE user_id = ?",
        [user.id]
      );

      this.s = 1;
      this.m = "Password reset successfully. You can now login.";
      return this.send_res(res);
    } catch (err) {
      this.s = 0;
      this.err = err.message;
      return this.send_res(res);
    }
  }
}
