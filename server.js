// Starts the bookshelf website (npm start). The parts live in server/:
//   db.js     MySQL tables          pages.js  the web pages + login checks
//   auth/     accounts & logins     books/    the books API     admin/  managing users
import "dotenv/config";
import express from "express";
import { adminRouter } from "./server/admin/routes.js";
import { loadUser } from "./server/auth/auth.js";
import { authRouter } from "./server/auth/routes.js";
import { booksRouter } from "./server/books/routes.js";
import { initDatabase } from "./server/db.js";
import { pagesRouter } from "./server/pages.js";

const { PORT = "3001" } = process.env;

const db = await initDatabase();
const app = express();

// When shared through a tunnel (Cloudflare Tunnel / ngrok), every request reaches
// the server from the tunnel program on this computer. Trusting that local hop
// lets Express read the visitor's real address and https from the headers it
// adds, so the login lockout applies per visitor instead of to everyone at once.
app.set("trust proxy", "loopback");

// Basic safety headers for when the site is reachable from the internet.
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff", // don't guess file types
    "X-Frame-Options": "DENY", // don't allow the site inside other sites' frames
    "Referrer-Policy": "same-origin",
  });
  next();
});

app.use(express.json({ limit: "5mb" }));
app.use(pagesRouter(db));

app.use("/api", loadUser(db));
app.use("/api/auth", authRouter(db));
app.use("/api/books", booksRouter(db));
app.use("/api/admin", adminRouter(db));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

app.listen(Number(PORT), () => {
  console.log(`Bookshelf running at http://localhost:${PORT}`);
});
