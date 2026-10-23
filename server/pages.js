// The web pages in /public: which ones need a login, and the files themselves.
import path from "node:path";
import express from "express";
import { loadUser } from "./auth/auth.js";

const PUBLIC = path.join(import.meta.dirname, "..", "public");

// Each page lives in its own folder (public/add/, public/stats/, …); "My books" is the home page.
const PROTECTED_PAGES = ["/", "/add/", "/stats/", "/admin/"];

// Addresses from before the pages had their own folders keep working.
const OLD_ADDRESSES = {
  "/index.html": "/",
  "/books/": "/",
  "/add.html": "/add/",
  "/stats.html": "/stats/",
  "/admin.html": "/admin/",
  "/login.html": "/login/",
  "/fun.html": "/fun/",
};

export function pagesRouter(db) {
  const router = express.Router();

  // Old address, or /<page>/index.html -> the page's short address (keeping ?id=… etc.).
  router.get([...Object.keys(OLD_ADDRESSES), "/:page/index.html"], (req, res) => {
    const target = OLD_ADDRESSES[req.path] ?? (req.params.page === "books" ? "/" : `/${req.params.page}/`);
    res.redirect(301, target + req.originalUrl.slice(req.path.length));
  });

  // Pages that need a login are checked before they're sent, so a logged-out
  // visitor goes straight to the login page without seeing them.
  router.get(PROTECTED_PAGES, loadUser(db), (req, res, next) => {
    if (!req.user) return res.redirect(`/login/?next=${encodeURIComponent(req.originalUrl)}`);
    if (req.path === "/admin/" && req.user.role !== "admin") return res.redirect("/");
    res.set("Cache-Control", "no-store"); // don't show a cached copy after logging out
    next();
  });

  // Already logged in? Skip the login page.
  router.get("/login/", loadUser(db), (req, res, next) => {
    if (!req.user) return next();
    const target = String(req.query.next || "/");
    res.redirect(target.startsWith("/") && !target.startsWith("//") ? target : "/");
  });

  router.get("/", (req, res) => res.sendFile(path.join(PUBLIC, "books", "index.html")));
  router.use(express.static(PUBLIC));
  return router;
}
