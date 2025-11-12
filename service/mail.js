import nodemailer from "nodemailer";
import path from "path";
import ejs from "ejs";
import fs from "fs";
import { CONFIG } from "../config/flavour.js";

const __dirname = path.resolve();

export default class MailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: CONFIG.SMTP_HOST,
      port: Number(CONFIG.SMTP_PORT),
      secure: CONFIG.SMTP_SECURE === true || CONFIG.SMTP_SECURE === 'true', // boolean
      auth: {
        user: CONFIG.SMTP_USER,
        pass: CONFIG.SMTP_PASS,
      },
    });
  }

  async sendMail({ to, subject, templateName, data }) {
    try {
      const templatePath = path.join(
        __dirname,
        "views",
        "emails",
        `${templateName}.ejs`
      );
      const template = fs.readFileSync(templatePath, "utf-8");
      const html = ejs.render(template, data);
      console.log(data)

      const mailOptions = {
        from: `"${CONFIG.SMTP_NAME}" <${CONFIG.SMTP_FROM}>`,
        to,
        subject,
        html,
      };

      await this.transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      console.error("Error sending email:", error);
      return false;
    }
  }
}
