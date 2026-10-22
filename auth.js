// Accounts, passwords and login sessions.
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const SESSION_COOKIE = "bookshelf_session";
const SESSION_DAYS = 30;
const ROLES = ["user", "admin"];

// ----- Rules -----

// Returns what's wrong with the password, or null if it's fine.
export function passwordProblem(password) {
  if (typeof password !== "string" || password.length < 7) return "Password must be at least 7 characters.";
  if (password.length > 200) return "Password is too long.";
  if (!/[A-Z]/.test(password)) return "Password needs at least 1 capital letter.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password needs at least 1 special character (like ! ? # @).";
  return null;
}

export function usernameProblem(username) {
  if (typeof username !== "string" || !/^[A-Za-z0-9_.-]{3,30}$/.test(username)) {
    return "Username must be 3–30 characters: letters, numbers, _ . or -";
  }
  return null;
}

export const isRole = (role) => ROLES.includes(role);

// ----- Passwords (salted scrypt hashes; the password itself is never stored) -----

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, saltHex, keyHex] = String(stored).split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

// ----- Tables -----

export async function initAuthTables(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            CHAR(36)      PRIMARY KEY,
      username      VARCHAR(30)   NOT NULL UNIQUE,
      password_hash VARCHAR(255)  NOT NULL,
      role          ENUM('user', 'admin') NOT NULL DEFAULT 'user',
      created_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    )
  `);
  // Only a hash of each session token is stored, so a leaked table can't be used to log in.
  await db.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash CHAR(64)    PRIMARY KEY,
      user_id    CHAR(36)    NOT NULL,
      expires_at DATETIME    NOT NULL,
      INDEX (user_id)
    )
  `);
  await db.query("DELETE FROM sessions WHERE expires_at < NOW()");
}

export async function createUser(db, username, password, role = "user") {
  const id = randomUUID();
  await db.query("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)", [
    id, username, await hashPassword(password), role,
  ]);
  return { id, username, role };
}

// Makes sure there's an admin. The first time, it's created from ADMIN_USERNAME /
// ADMIN_PASSWORD in .env. Returns the admin's id (or null if none could be made).
export async function ensureAdmin(db, username, password) {
  const [[existing]] = await db.query("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1");
  if (existing) return existing.id;

  if (!username || !password) {
    console.warn("No admin account yet: set ADMIN_USERNAME and ADMIN_PASSWORD in .env and restart.");
    return null;
  }
  const problem = usernameProblem(username) || passwordProblem(password);
  if (problem) {
    console.warn(`Can't create the admin from .env: ${problem}`);
    return null;
  }
  const [[sameName]] = await db.query("SELECT id FROM users WHERE username = ?", [username]);
  if (sameName) {
    await db.query("UPDATE users SET role = 'admin' WHERE id = ?", [sameName.id]);
    console.log(`Made "${username}" an admin.`);
    return sameName.id;
  }
  const admin = await createUser(db, username, password, "admin");
  console.log(`Created admin account "${username}".`);
  return admin.id;
}

// ----- Sessions -----

const hashToken = (token) => createHash("sha256").update(token).digest("hex");

function readCookie(req, name) {
  for (const part of (req.headers.cookie || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function setSessionCookie(req, res, token, maxAgeSeconds) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly", // page scripts can't read it
    "SameSite=Lax", // not sent with requests from other sites
    `Max-Age=${maxAgeSeconds}`,
  ];
  // Secure = only sent over https. Turned on automatically when the visitor came in
  // over https (like a tunnel link), so plain http on localhost keeps working.
  if (req.secure || process.env.COOKIE_SECURE === "true") parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

export async function startSession(db, req, res, userId) {
  const token = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, NOW() + INTERVAL ? DAY)",
    [hashToken(token), userId, SESSION_DAYS]
  );
  setSessionCookie(req, res, token, SESSION_DAYS * 24 * 60 * 60);
}

export async function endSession(db, req, res) {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await db.query("DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
  setSessionCookie(req, res, "", 0);
}

// Middleware: sets req.user ({ id, username, role }) when the visitor is logged in.
export function loadUser(db) {
  return async (req, res, next) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) {
      const [[user]] = await db.query(
        `SELECT u.id, u.username, u.role FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > NOW()`,
        [hashToken(token)]
      );
      req.user = user || null;
    }
    next();
  };
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please log in." });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please log in." });
  if (req.user.role !== "admin") return res.status(403).json({ error: "Only admins can do that." });
  next();
}
