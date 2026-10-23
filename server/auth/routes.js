// /api/auth — sign up, log in, log out, and "who am I?".
import express from "express";
import {
  createUser, endSession, passwordProblem, startSession, usernameProblem, verifyPassword,
} from "./auth.js";

// Slows down password guessing: max 10 failed logins per 15 minutes per address.
const failedLogins = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
function tooManyFailures(ip) {
  const entry = failedLogins.get(ip);
  if (!entry || Date.now() - entry.first > LOGIN_WINDOW_MS) return false;
  return entry.count >= 10;
}
function recordFailure(ip) {
  const entry = failedLogins.get(ip);
  if (!entry || Date.now() - entry.first > LOGIN_WINDOW_MS) failedLogins.set(ip, { first: Date.now(), count: 1 });
  else entry.count++;
}

export const publicUser = (user) => ({ id: user.id, username: user.username, role: user.role });

export function authRouter(db) {
  const router = express.Router();


  router.get("/me", (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Not logged in." });
    res.json(publicUser(req.user));
  });

  router.post("/register", async (req, res) => {
    const username = String(req.body.username ?? "").trim();
    const password = req.body.password;
    const problem = usernameProblem(username) || passwordProblem(password);
    if (problem) return res.status(400).json({ error: problem });

    let user;
    try {
      user = await createUser(db, username, password);
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "That username is taken." });
      throw err;
    }
    await startSession(db, req, res, user.id);
    res.status(201).json(publicUser(user));
  });

  router.post("/login", async (req, res) => {
    if (tooManyFailures(req.ip)) {
      return res.status(429).json({ error: "Too many failed logins. Try again in 15 minutes." });
    }
    const username = String(req.body.username ?? "").trim();
    const password = String(req.body.password ?? "");
    const [[user]] = await db.query("SELECT * FROM users WHERE username = ?", [username]);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      recordFailure(req.ip);
      return res.status(401).json({ error: "Wrong username or password." });
    }
    failedLogins.delete(req.ip);
    await startSession(db, req, res, user.id);
    res.json(publicUser(user));
  });

  router.post("/logout", async (req, res) => {
    await endSession(db, req, res);
    res.status(204).end();
  });

  return router;
}
