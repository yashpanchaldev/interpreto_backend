import express from "express";
import cors from "cors";
import path from "path";
import fileUpload from "express-fileupload";
import { CONFIG } from "./config/flavour.js";
import { POOL } from "./config/database.js";
import { Server } from "socket.io";
import http from "http";
import { registerSocketHandlers } from "./sockets/chat.socket.js";
import expressRaw from "express";
// Create Server
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.set("io", io);

// ✔ DB CONNECTION
POOL.getConnection((err) => {
  if (err) console.log("DB Error" + err);
  else console.log("DB Connected Successfully");
});



app.use(
  "/api/payment/webhook",
  expressRaw.raw({ type: "application/json" })   // ← IMPORTANT
);

// ✔ NORMAL JSON PARSER (after webhook raw)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✔ FILE UPLOAD
app.use(fileUpload({ createParentPath: true }));

// ✔ CORS
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "DELETE", "UPDATE", "PUT", "PATCH"],
  })
);

// ✔ STATIC FILES
app.use(express.static(path.join(path.resolve(), "public")));

// ✔ ROUTING
import router from "./routes/index.js";
app.use("/api", router);

// ✔ FALLBACK (404 handler for frontend routes)
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

// ✔ ERROR HANDLER
import { errorHandler } from "./middleware/error.js";
app.use(errorHandler);
// ✔ SOCKET INIT
registerSocketHandlers(io);
// ✔ START SERVER
server.listen(CONFIG.PORT, () => {
  console.log("Server is start on port", CONFIG.PORT);
});
