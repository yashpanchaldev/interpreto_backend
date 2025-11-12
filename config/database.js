import mysql from "mysql2";
import { CONFIG } from "./flavour.js";

const DB = mysql.createPool(CONFIG.DB);
const POOL = DB.promise();

export { POOL };
