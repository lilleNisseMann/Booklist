// The "My books" page.

const list = document.getElementById("book-list");
const emptyEl = document.getElementById("empty");
const emptyText = document.getElementById("empty-text");
const emptyAdd = document.getElementById("empty-add");
const countEl = document.getElementById("count");
const subtitleEl = document.getElementById("subtitle");
const yearSelect = document.getElementById("year-select");
const sortSelect = document.getElementById("sort-select");
const statusTabs = document.getElementById("status-tabs");
const template = document.getElementById("book-template");

let books = [];
// The page always opens on the current year.
const view = { year: String(currentYear), status: "all", sort: "added" };

async function loadBooks() {
  try {
    books = await api();
    render();
  } catch {
    emptyText.textContent = "Couldn't reach the server. Is it running? (npm start)";
    emptyAdd.hidden = true;
    emptyEl.hidden = false;
  }
}

// ----- Controls -----

function renderYearOptions() {
  fillYearSelect(yearSelect, books, view.year);
}

function renderStatusTabs(booksInYear) {
  statusTabs.innerHTML = "";
  const tabs = [["all", "All"], ...Object.entries(STATUS_LABELS)];
  for (const [status, label] of tabs) {
    const count = status === "all"
      ? booksInYear.length
      : booksInYear.filter((b) => b.status === status).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "status-tab";
    button.textContent = `${label} (${count})`;
    button.setAttribute("aria-pressed", String(view.status === status));
    button.addEventListener("click", () => {
      view.status = status;
      render();
    });
    statusTabs.appendChild(button);
  }
}

yearSelect.addEventListener("change", () => {
  view.year = yearSelect.value;
  render();
});

sortSelect.addEventListener("change", () => {
  view.sort = sortSelect.value;
  render();
});

// ----- Sorting -----

const byText = (a, b) => (a || "").localeCompare(b || "", undefined, { sensitivity: "base" });
const lastIfMissing = (a, b) => (a == null) - (b == null);

// Each sort can also group the list under headings.
const SORTS = {
  added: { compare: () => 0 }, // the server already sends newest first
  score: {
    compare: (a, b) => lastIfMissing(a.score, b.score) || (b.score ?? 0) - (a.score ?? 0),
  },
  genre: {
    compare: (a, b) => lastIfMissing(a.genres[0], b.genres[0]) || byText(a.genres[0], b.genres[0]),
    group: (book) => book.genres[0] || "No genre",
  },
  author: {
    // Each author's books together (series in order); unknown authors last.
    compare: (a, b) =>
      lastIfMissing(a.author, b.author) ||
      byText(a.author, b.author) ||
      byText(a.series, b.series) ||
      (a.seriesNumber ?? 0) - (b.seriesNumber ?? 0) ||
      byText(a.name, b.name),
    group: (book) => book.author || "Unknown author",
  },
  series: {
    // Each series together, in reading order; books not in a series last.
    compare: (a, b) =>
      lastIfMissing(a.series, b.series) ||
      byText(a.series, b.series) ||
      lastIfMissing(a.seriesNumber, b.seriesNumber) ||
      (a.seriesNumber ?? 0) - (b.seriesNumber ?? 0) ||
      byText(a.name, b.name),
    group: (book) => book.series || "Not in a series",
  },
  language: {
    compare: (a, b) => byText(a.language, b.language),
    group: (book) => book.language,
  },
  year: {
    compare: (a, b) => lastIfMissing(yearOf(a), yearOf(b)) || byText(b.endDate, a.endDate),
    group: (book) => (yearOf(book) ? String(yearOf(book)) : "No end date"),
  },
  name: { compare: (a, b) => byText(a.name, b.name) },
};

// ----- List -----

function render() {
  renderYearOptions();

  const booksInYear = view.year === "all"
    ? books
    : books.filter((b) => yearOf(b) === Number(view.year));
  renderStatusTabs(booksInYear);

  const visible = booksInYear
    .filter((b) => view.status === "all" || b.status === view.status)
    .sort(SORTS[view.sort].compare);

  const yearText = view.year === "all" ? "all years" : view.year;
  subtitleEl.textContent = view.year === String(currentYear)
    ? `This year (${currentYear}) — finished this year, reading now and up next`
    : view.year === "all" ? "Every book on your shelf" : `Books you finished or dropped in ${view.year}`;
  countEl.textContent = visible.length ? `(${visible.length})` : "";

  list.innerHTML = "";
  emptyEl.hidden = visible.length > 0;
  emptyAdd.hidden = books.length > 0;
  emptyText.textContent = books.length === 0
    ? "No books yet."
    : view.status === "all"
      ? `No books for ${yearText}.`
      : `No “${STATUS_LABELS[view.status]}” books for ${yearText}.`;

  const group = SORTS[view.sort].group;
  let lastGroup = null;
  for (const book of visible) {
    if (group && group(book) !== lastGroup) {
      lastGroup = group(book);
      const heading = document.createElement("h2");
      heading.className = "group-heading";
      heading.textContent = lastGroup;
      list.appendChild(heading);
    }
    list.appendChild(bookCard(book));
  }
}

function addTag(container, text, className = "tag") {
  const tag = document.createElement("span");
  tag.className = className;
  tag.textContent = text;
  container.appendChild(tag);
}

function bookCard(book) {
  const node = template.content.cloneNode(true);
  const tile = node.querySelector(".book-tile");
  const value = percent(book.currentPage, book.totalPages);

  // Title, with the number in the series like "Hidden Witch (#2)".
  const title = book.seriesNumber ? `${book.name} (#${book.seriesNumber})` : book.name;
  node.querySelector(".book-name").textContent = title;
  const byline = [book.author && `by ${book.author}`, book.series].filter(Boolean).join(" · ");
  if (byline) {
    const author = node.querySelector(".book-author");
    author.textContent = byline;
    author.hidden = false;
  }

  // Cover, or a plain placeholder with the title when there's none (or the link is dead).
  const placeholder = node.querySelector(".cover-placeholder");
  node.querySelector(".placeholder-title").textContent = book.name;
  if (book.cover) {
    const cover = node.querySelector(".cover-img");
    cover.src = book.cover;
    cover.alt = `Cover of ${book.name}`;
    cover.hidden = false;
    placeholder.hidden = true;
    cover.addEventListener("error", () => {
      cover.hidden = true;
      placeholder.hidden = false;
    });
  }

  // Up to two tags, like the type and the main genre.
  const tags = node.querySelector(".tags");
  if (book.type) addTag(tags, book.type, "tag type");
  if (book.genres?.[0]) addTag(tags, book.genres[0], "tag genre");
  if (book.genres?.length > 1) {
    const more = document.createElement("span");
    more.className = "tag more";
    more.textContent = `+${book.genres.length - 1}`;
    more.title = book.genres.slice(1).join(", ");
    tags.appendChild(more);
  }

  // Status pill with a colored dot.
  node.querySelector(".status-pill").classList.add(book.status);
  node.querySelector(".status-text").textContent = STATUS_LABELS[book.status];
  if (book.score) {
    const score = node.querySelector(".tile-score");
    score.textContent = `★ ${book.score}`;
    score.title = `Score ${book.score}/10`;
    score.hidden = false;
  }

  // A slim progress bar for books being read (or stopped partway).
  if ((book.status === "reading" || book.status === "dropped") && book.totalPages > 0) {
    const progress = node.querySelector(".tile-progress");
    progress.hidden = false;
    const fill = node.querySelector(".progress-fill");
    setProgress(fill, value);
    fill.classList.toggle("dropped", book.status === "dropped");
    node.querySelector(".tile-percent").textContent = `${value}%`;
    progress.title = `Page ${book.currentPage} of ${book.totalPages}`;
  }

  // ----- Edit button and the ••• menu -----

  node.querySelector(".edit").href = `/add/?id=${encodeURIComponent(book.id)}`;

  const moreBtn = node.querySelector(".more");
  const menu = node.querySelector(".tile-menu");
  moreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = menu.hidden;
    closeMenus();
    if (open) {
      menu.hidden = false;
      moreBtn.setAttribute("aria-expanded", "true");
      tile.classList.add("menu-open");
    }
  });
  menu.addEventListener("click", (e) => e.stopPropagation());

  const pageInput = node.querySelector(".page-input");
  pageInput.value = book.currentPage;
  pageInput.max = book.totalPages;
  node.querySelector(".menu-total").textContent = `of ${book.totalPages}`;
  // "To read" books may not have a page count yet.
  if (book.totalPages === 0) node.querySelector(".menu-page").hidden = true;

  const savePage = async () => {
    const page = Math.min(book.totalPages, Math.max(0, Number(pageInput.value) || 0));
    const update = { ...book, currentPage: page };
    // Reaching the last page completes the book; starting one moves it to "Reading".
    if (page >= book.totalPages && book.status !== "completed") {
      update.status = "completed";
      update.endDate ||= today();
    } else if (page > 0 && book.status === "to-read") {
      update.status = "reading";
      update.startDate ||= today();
    }
    try {
      Object.assign(book, await saveBook(update));
      render();
    } catch (err) {
      alert(`Couldn't save: ${err.message}`);
    }
  };
  node.querySelector(".save-page").addEventListener("click", savePage);
  pageInput.addEventListener("keydown", (e) => { if (e.key === "Enter") savePage(); });

  node.querySelector(".delete").addEventListener("click", async () => {
    if (!confirm(`Delete "${book.name}"?`)) return;
    try {
      await api(`/${book.id}`, { method: "DELETE" });
    } catch (err) {
      if (err.status !== 404) return alert(`Couldn't delete: ${err.message}`);
    }
    books = books.filter((b) => b.id !== book.id);
    render();
  });

  return node;
}

function closeMenus() {
  for (const menu of list.querySelectorAll(".tile-menu")) menu.hidden = true;
  for (const btn of list.querySelectorAll(".more")) btn.setAttribute("aria-expanded", "false");
  for (const tile of list.querySelectorAll(".menu-open")) tile.classList.remove("menu-open");
}

document.addEventListener("click", closeMenus);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenus(); });

loadBooks();
