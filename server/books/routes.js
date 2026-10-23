// /api/books — each user only sees and changes their own books.
import { randomUUID } from "node:crypto";
import express from "express";
import { requireUser } from "../auth/auth.js";
import { parseBook, toBook } from "./book.js";

export function booksRouter(db) {
  const router = express.Router();
  router.use(requireUser);

  router.get("/", async (req, res) => {
    const [rows] = await db.query("SELECT * FROM books WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]);
    res.json(rows.map(toBook));
  });

  router.get("/:id", async (req, res) => {
    const [[row]] = await db.query("SELECT * FROM books WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
    if (!row) return res.status(404).json({ error: "Book not found." });
    res.json(toBook(row));
  });

  router.post("/", async (req, res) => {
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

  router.put("/:id", async (req, res) => {
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

  router.delete("/:id", async (req, res) => {
    const [result] = await db.query("DELETE FROM books WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Book not found." });
    res.status(204).end();
  });

  return router;
}
