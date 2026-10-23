// What a book looks like: the allowed values, checking what the page sends,
// and turning a database row into what the page uses.

export const FORMATS = ["Electronic", "Physical (library)", "Physical (own)"];
export const STATUSES = ["to-read", "reading", "completed", "dropped"];
export const STATUS_COLUMN = `ENUM(${STATUSES.map((s) => `'${s}'`).join(", ")}) NOT NULL DEFAULT 'reading'`;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Database row -> the shape the page uses.
export function toBook(row) {
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
export function parseBook(body) {
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
