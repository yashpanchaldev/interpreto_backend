import express from "express";
import cors from "cors";
import path from "path";
import fileUpload from "express-fileupload";
import { CONFIG } from "./config/flavour.js";
import { POOL } from "./config/database.js";
import {Server} from "socket.io"
import http from "http"
import { registerSocketHandlers } from "./sockets/chat.socket.js"; // 👈 import socket file


// Create Server
const app = express();
const server = http.createServer(app)

const io = new Server(server,{
  cors:{
    origin:"*",
    methods:["Get","Post"]
  }
})

app.set('io',io)

// Check DB Connection
POOL.getConnection((errr) => {
  if (errr) {
    console.log("DB Error" + errr);
  } else {
    console.log("DB Connected Successfully");
  }
});

// Parse JSON request bodies
app.use(express.json());

// Parse URL-encoded request bodies
app.use(express.urlencoded({ extended: true }));

// Configure express-fileupload middleware for handling file uploads
app.use(fileUpload({ createParentPath: true }));

// Configure CORS middleware
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "DELETE", "UPDATE", "PUT", "PATCH"],
  })
);

app.use(cors());

// Serve static files from the "public" directory
app.use(express.static(path.join(path.resolve(), "public")));

// Routes
import router from "./routes/index.js";
app.use("/api", router);

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

app.use((req, res) => {
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
app.use(errorHandler);

registerSocketHandlers(io)
// SERVER START
server.listen(CONFIG.PORT, () => {
  console.log("Server is start on port", CONFIG.PORT);
});
