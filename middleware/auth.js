import { POOL } from "../config/database.js";

export const authMiddleware = async (req, res, next) => {
  try {
    // Accept apikey and token from either headers or query parameters
    const apikey = req.headers.apikey || req.query.apikey;
    const token = req.headers.token || req.query.token;

    if (!apikey || !token) {
      return res
        .status(401)
        .json({ s: 0, m: "apikey and token are required", r: null, err: null });
    }

    // Query to get complete user authentication and profile data
    const [rows, fields] = await POOL.query(
      `SELECT user_id FROM user_auth WHERE apikey = ? 
        AND token = ?`,
      [apikey, token]
    );

    // Check if authentication record exists
    if (!rows.length) {
      return res
        .status(401)
        .json({ s: 0, m: "Invalid apikey or token", r: null, err: null });
    }
    const userId = rows[0].user_id;
    req._id = userId;

    next();
  } catch (error) {
    return res
      .status(500)
      .json({ s: 0, m: "Internal server error", r: null, err: error.message });
  }
};
