// /api/admin — admins manage users: rename, change role, set a new password, delete.
import express from "express";
import { hashPassword, isRole, passwordProblem, requireAdmin, usernameProblem } from "../auth/auth.js";
import { publicUser } from "../auth/routes.js";

export function adminRouter(db) {
  const router = express.Router();
  router.use(requireAdmin);

  router.get("/users", async (req, res) => {
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
  router.patch("/users/:id", async (req, res) => {
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
  router.delete("/users/:id", async (req, res) => {
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

  return router;
}
