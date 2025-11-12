import express from "express";
import cors from "cors";
import path from "path";
import fileUpload from "express-fileupload";
import { CONFIG } from "./config/flavour.js";
import { POOL } from "./config/database.js";

// Create Server
const server = express();

// Check DB Connection
POOL.getConnection((errr) => {
  if (errr) {
    console.log("DB Error" + errr);
  } else {
    console.log("DB Connected Successfully");
  }
});

// Parse JSON request bodies
server.use(express.json());

// Parse URL-encoded request bodies
server.use(express.urlencoded({ extended: true }));

// Configure express-fileupload middleware for handling file uploads
server.use(fileUpload({ createParentPath: true }));

// Configure CORS middleware
server.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "DELETE", "UPDATE", "PUT", "PATCH"],
  })
);

server.use(cors());

// Serve static files from the "public" directory
server.use(express.static(path.join(path.resolve(), "public")));

// Routes
import router from "./routes/index.js";
server.use("/api", router);

// Catch-all route handler for non-existent routes
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
// server.use((req, res) => {
//   if ((req.baseUrl + req.path).includes(`${CONFIG.STATIC_ROUTE}`)) {
//     res.sendFile("index.html", {
//       root: path.join(__dirname, `public/${CONFIG.STATIC_ROUTE}/`),
//     });
//   } else {
//     return res.status(404).json({ s: 0, m: "Page not found" });
//   }
// });

server.use((req, res) => {
  const fullPath = req.originalUrl;
  if (fullPath.startsWith(`/${CONFIG.STATIC_ROUTE}`)) {
    res.sendFile("index.html", {
      root: path.join(process.cwd(), `public/${CONFIG.STATIC_ROUTE}/`),
    });
  } else {
    return res.status(404).json({ s: 0, m: "Page not found" });
  }
});

// Error Handler Middleware
import { errorHandler } from "./middleware/error.js";
server.use(errorHandler);

// SERVER START
server.listen(CONFIG.PORT, () => {
  console.log("Server is start on port", CONFIG.PORT);
});
