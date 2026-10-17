import "dotenv/config";
import { randomUUID } from "node:crypto";
import path from "node:path";
import express from "express";
import mysql from "mysql2/promise";
import {
  createUser, endSession, ensureAdmin, initAuthTables, isRole, loadUser, passwordProblem,
  requireAdmin, requireUser, startSession, usernameProblem, hashPassword, verifyPassword,
} from "./auth.js";

const {
  DB_HOST = "localhost",
  DB_PORT = "3306",
  DB_USER = "root",
  DB_PASSWORD = "",
  DB_NAME = "bookshelf",
  PORT = "3001",
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
} = process.env;

const FORMATS = ["Electronic", "Physical (library)", "Physical (own)"];
const STATUSES = ["to-read", "reading", "completed", "dropped"];
const STATUS_COLUMN = `ENUM(${STATUSES.map((s) => `'${s}'`).join(", ")}) NOT NULL DEFAULT 'reading'`;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// ----- Database -----

async function initDatabase() {
  if (!/^\w+$/.test(DB_NAME)) throw new Error("DB_NAME may only contain letters, numbers and _");

  const connection = { host: DB_HOST, port: Number(DB_PORT), user: DB_USER, password: DB_PASSWORD };

  const setup = await mysql.createConnection(connection);
  await setup.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await setup.end();

  const pool = mysql.createPool({ ...connection, database: DB_NAME, dateStrings: true });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS books (
      id           CHAR(36)          PRIMARY KEY,
      user_id      CHAR(36)          NULL,
      name         VARCHAR(255)      NOT NULL,
      author       VARCHAR(255)      NULL,
      status       ${STATUS_COLUMN},
      start_date   DATE              NULL,
      end_date     DATE              NULL,
      total_pages  INT UNSIGNED      NOT NULL,
      current_page INT UNSIGNED      NOT NULL DEFAULT 0,
      format       ENUM('Electronic', 'Physical (library)', 'Physical (own)') NOT NULL,
      language     VARCHAR(100)      NOT NULL,
      score        TINYINT UNSIGNED  NULL,
      cover        MEDIUMTEXT        NULL,
      book_type    VARCHAR(100)      NULL,
      genres       JSON              NULL,
      series       VARCHAR(255)      NULL,
      series_number INT UNSIGNED     NULL,
      created_at   DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at   DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX (user_id)
    )
  `);

  // Columns added after the table was first created.
  await addColumnIfMissing(pool, "book_type", "VARCHAR(100) NULL AFTER cover");
  await addColumnIfMissing(pool, "genres", "JSON NULL AFTER book_type");
  await addColumnIfMissing(pool, "series", "VARCHAR(255) NULL AFTER genres");
  await addColumnIfMissing(pool, "author", "VARCHAR(255) NULL AFTER name");
  await addColumnIfMissing(pool, "series_number", "INT UNSIGNED NULL AFTER series");
  if (await addColumnIfMissing(pool, "user_id", "CHAR(36) NULL AFTER id")) {
    await pool.query("ALTER TABLE books ADD INDEX (user_id)");
  }
  const addedStatus = await addColumnIfMissing(
    pool, "status", `${STATUS_COLUMN} AFTER name`
  );
  if (addedStatus) {
    // Books saved before statuses existed: fully read ones count as completed.
    await pool.query("UPDATE books SET status = 'completed' WHERE current_page >= total_pages");
  }

  // Tables made before "dropped" existed need it added to the status list.
  const [[{ COLUMN_TYPE: statusType }]] = await pool.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'books' AND COLUMN_NAME = 'status'`,
    [DB_NAME]
  );
  if (!statusType.includes("'dropped'")) {
    await pool.query(`ALTER TABLE books MODIFY COLUMN status ${STATUS_COLUMN}`);
  }

  await initAuthTables(pool);
  const adminId = await ensureAdmin(pool, ADMIN_USERNAME, ADMIN_PASSWORD);
  // Books from before accounts existed belong to the admin.
  if (adminId) await pool.query("UPDATE books SET user_id = ? WHERE user_id IS NULL", [adminId]);
  return pool;
}

// Returns true if the column was added.
async function addColumnIfMissing(pool, column, definition) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'books' AND COLUMN_NAME = ?`,
    [DB_NAME, column]
  );
  if (rows.length > 0) return false;
  await pool.query(`ALTER TABLE books ADD COLUMN ${column} ${definition}`);
  return true;
}

// Database row -> the shape the page uses.
function toBook(row) {
  return {
    id: row.id,
    name: row.name,
    author: row.author,
    status: row.status,
    startDate: row.start_date || "",
    endDate: row.end_date || "",
    totalPages: row.total_pages,
    currentPage: row.current_page,
    format: row.format,
    language: row.language,
    score: row.score,
    cover: row.cover,
    type: row.book_type,
    genres: row.genres || [],
    series: row.series,
    seriesNumber: row.series_number,
  };
}

// Checks what the page sent. Returns { error } or { book }.
function parseBook(body) {
  const name = String(body.name ?? "").trim();
  const author = String(body.author ?? "").trim() || null;
  const language = String(body.language ?? "").trim();
  const totalPages = Number(body.totalPages);
  const currentPage = Number(body.currentPage ?? 0);
  const startDate = body.startDate || null;
  const endDate = body.endDate || null;
  const score = body.score == null || body.score === "" ? null : Number(body.score);
  const cover = body.cover || null;
  const status = body.status ?? "reading";
  const type = String(body.type ?? "").trim() || null;
  const series = String(body.series ?? "").trim() || null;
  const seriesNumber = body.seriesNumber == null || body.seriesNumber === "" ? null : Number(body.seriesNumber);
  const genresIn = Array.isArray(body.genres) ? body.genres : [];
  const genres = [...new Set(genresIn.map((g) => String(g).trim()).filter(Boolean))];

  if (!name) return { error: "Please enter the book's name." };
  if (name.length > 255) return { error: "The name is too long." };
  if (author && author.length > 255) return { error: "The author name is too long." };
  // Only "To read" books may have 0 pages (the count may not be known yet).
  if (!Number.isInteger(totalPages) || totalPages < (status === "to-read" ? 0 : 1)) {
    return { error: "Total pages must be at least 1 (only “To read” books can have 0)." };
  }
  if (!Number.isInteger(currentPage) || currentPage < 0) return { error: "Current page can't be negative." };
  if (currentPage > totalPages) return { error: "Current page can't be more than the total pages." };
  if (!STATUSES.includes(status)) return { error: "Unknown status." };
  if (!FORMATS.includes(body.format)) return { error: "Unknown format." };
  if (!language || language.length > 100) return { error: "Please choose a language." };
  if ((startDate && !DATE.test(startDate)) || (endDate && !DATE.test(endDate))) return { error: "Invalid date." };
  if (startDate && endDate && endDate < startDate) return { error: "End date can't be before the start date." };
  if (score !== null && (!Number.isInteger(score) || score < 1 || score > 10)) return { error: "Score must be 1–10." };
  if (cover && !/^(https?:\/\/|data:image\/)/i.test(cover)) return { error: "Invalid cover image." };
  if (type && type.length > 100) return { error: "The type is too long." };
  if (genres.length > 20) return { error: "A book can have at most 20 genres." };
  if (genres.some((g) => g.length > 50)) return { error: "A genre name is too long." };
  if (series && series.length > 255) return { error: "The series name is too long." };
  if (seriesNumber !== null && (!Number.isInteger(seriesNumber) || seriesNumber < 1 || seriesNumber > 9999)) {
    return { error: "The number in the series must be a whole number from 1." };
  }
  if (seriesNumber !== null && !series) return { error: "Please enter the series name for the number." };

  return {
    book: {
      name, author, startDate, endDate, totalPages, currentPage, format: body.format, language, score, cover,
      type, genres: JSON.stringify(genres), status, series, seriesNumber,
    },
  };
}

// ----- Server -----

const db = await initDatabase();
const app = express();

app.use(express.json({ limit: "5mb" }));

// Pages that need a login are checked here, before they're sent, so a
// logged-out visitor goes straight to the login page without seeing them.
const PROTECTED_PAGES = ["/", "/index.html", "/add.html", "/stats.html", "/admin.html"];
app.get(PROTECTED_PAGES, loadUser(db), (req, res, next) => {
  if (!req.user) return res.redirect(`/login.html?next=${encodeURIComponent(req.originalUrl)}`);
  if (req.path === "/admin.html" && req.user.role !== "admin") return res.redirect("/");
  res.set("Cache-Control", "no-store"); // don't show a cached copy after logging out
  next();
});
// Already logged in? Skip the login page.
app.get("/login.html", loadUser(db), (req, res, next) => {
  if (!req.user) return next();
  const target = String(req.query.next || "/");
  res.redirect(target.startsWith("/") && !target.startsWith("//") ? target : "/");
});

app.use(express.static(path.join(import.meta.dirname, "public")));
app.use(loadUser(db));

// ----- Accounts -----

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

const publicUser = (user) => ({ id: user.id, username: user.username, role: user.role });

app.get("/api/auth/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Not logged in." });
  res.json(publicUser(req.user));
});

app.post("/api/auth/register", async (req, res) => {
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
  await startSession(db, res, user.id);
  res.status(201).json(publicUser(user));
});

app.post("/api/auth/login", async (req, res) => {
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
  await startSession(db, res, user.id);
  res.json(publicUser(user));
});

app.post("/api/auth/logout", async (req, res) => {
  await endSession(db, req, res);
  res.status(204).end();
});

// ----- Books (each user only sees and changes their own) -----

app.use("/api/books", requireUser);

app.get("/api/books", async (req, res) => {
  const [rows] = await db.query("SELECT * FROM books WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]);
  res.json(rows.map(toBook));
});

app.get("/api/books/:id", async (req, res) => {
  const [[row]] = await db.query("SELECT * FROM books WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
  if (!row) return res.status(404).json({ error: "Book not found." });
  res.json(toBook(row));
});

app.post("/api/books", async (req, res) => {
  const { book, error } = parseBook(req.body);
  if (error) return res.status(400).json({ error });

  const id = randomUUID();
  await db.query(
    `INSERT INTO books (id, user_id, name, author, start_date, end_date, total_pages, current_page, format, language,
       score, cover, book_type, genres, status, series, series_number)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.user.id, book.name, book.author, book.startDate, book.endDate, book.totalPages, book.currentPage,
      book.format, book.language, book.score, book.cover, book.type, book.genres, book.status,
      book.series, book.seriesNumber]
  );
  const [[row]] = await db.query("SELECT * FROM books WHERE id = ?", [id]);
  res.status(201).json(toBook(row));
});

app.put("/api/books/:id", async (req, res) => {
  const { book, error } = parseBook(req.body);
  if (error) return res.status(400).json({ error });

  const [result] = await db.query(
    `UPDATE books SET name = ?, author = ?, start_date = ?, end_date = ?, total_pages = ?, current_page = ?,
       format = ?, language = ?, score = ?, cover = ?, book_type = ?, genres = ?, status = ?,
       series = ?, series_number = ?
     WHERE id = ? AND user_id = ?`,
    [book.name, book.author, book.startDate, book.endDate, book.totalPages, book.currentPage,
      book.format, book.language, book.score, book.cover, book.type, book.genres, book.status,
      book.series, book.seriesNumber, req.params.id, req.user.id]
  );
  if (result.affectedRows === 0) return res.status(404).json({ error: "Book not found." });

  const [[row]] = await db.query("SELECT * FROM books WHERE id = ?", [req.params.id]);
  res.json(toBook(row));
});

app.delete("/api/books/:id", async (req, res) => {
  const [result] = await db.query("DELETE FROM books WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
  if (result.affectedRows === 0) return res.status(404).json({ error: "Book not found." });
  res.status(204).end();
});

// ----- Admin: manage users -----

app.use("/api/admin", requireAdmin);

app.get("/api/admin/users", async (req, res) => {
  const [rows] = await db.query(`
    SELECT u.id, u.username, u.role, u.created_at, COUNT(b.id) AS book_count
    FROM users u LEFT JOIN books b ON b.user_id = u.id
    GROUP BY u.id ORDER BY u.created_at
  `);
  res.json(rows.map((r) => ({
    id: r.id, username: r.username, role: r.role, createdAt: r.created_at, bookCount: Number(r.book_count),
  })));
});

async function adminCount() {
  const [[{ count }]] = await db.query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
  return Number(count);
}

// Change a user's username, role and/or password.
app.patch("/api/admin/users/:id", async (req, res) => {
  const [[user]] = await db.query("SELECT * FROM users WHERE id = ?", [req.params.id]);
  if (!user) return res.status(404).json({ error: "User not found." });

  const { username, role, password } = req.body;
  if (username !== undefined) {
    const problem = usernameProblem(String(username).trim());
    if (problem) return res.status(400).json({ error: problem });
  }
  if (role !== undefined) {
    if (!isRole(role)) return res.status(400).json({ error: "Unknown role." });
    if (user.role === "admin" && role !== "admin" && (await adminCount()) <= 1) {
      return res.status(400).json({ error: "There must always be at least one admin." });
    }
  }
  if (password !== undefined) {
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ error: problem });
  }

  try {
    await db.query("UPDATE users SET username = ?, role = ?, password_hash = ? WHERE id = ?", [
      username !== undefined ? String(username).trim() : user.username,
      role ?? user.role,
      password !== undefined ? await hashPassword(password) : user.password_hash,
      user.id,
    ]);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "That username is taken." });
    throw err;
  }
  // A new password logs the user out everywhere (except the admin's own current login).
  if (password !== undefined && user.id !== req.user.id) {
    await db.query("DELETE FROM sessions WHERE user_id = ?", [user.id]);
  }
  const [[updated]] = await db.query("SELECT id, username, role FROM users WHERE id = ?", [user.id]);
  res.json(publicUser(updated));
});

// Delete a user together with their books.
app.delete("/api/admin/users/:id", async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: "You can't delete your own account." });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query("DELETE FROM users WHERE id = ?", [req.params.id]);
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: "User not found." });
    }
    await conn.query("DELETE FROM books WHERE user_id = ?", [req.params.id]);
    await conn.query("DELETE FROM sessions WHERE user_id = ?", [req.params.id]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  res.status(204).end();
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

app.listen(Number(PORT), () => {
  console.log(`Bookshelf running at http://localhost:${PORT}`);
});
