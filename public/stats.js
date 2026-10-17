// The "Statistics" page. Numbers count books completed in the chosen year.

const yearSelect = document.getElementById("year-select");
const statsEl = document.getElementById("stats");
const titleEl = document.getElementById("stats-title");
const subtitleEl = document.getElementById("stats-subtitle");
const tooltip = document.getElementById("tooltip");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

let books = [];
// Always opens on the current year.
let year = String(currentYear);

yearSelect.addEventListener("change", () => {
  year = yearSelect.value;
  render();
});

async function loadBooks() {
  try {
    books = await api();
    render();
  } catch {
    statsEl.innerHTML = `<p class="empty">Couldn't reach the server. Is it running? (npm start)</p>`;
  }
}

// ----- Helpers -----

function esc(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

const formatNumber = (n) => n.toLocaleString();
const plural = (n, word) => `${formatNumber(n)} ${word}${n === 1 ? "" : "s"}`;
const sum = (list, fn) => list.reduce((total, item) => total + fn(item), 0);
const average = (list, fn) => (list.length ? sum(list, fn) / list.length : null);

function daysToRead(book) {
  if (!book.startDate || !book.endDate) return null;
  const ms = new Date(book.endDate + "T00:00:00") - new Date(book.startDate + "T00:00:00");
  return Math.round(ms / 86400000) + 1; // started and finished the same day = 1 day
}

// Counts how often each value appears; returns [[value, count], ...] most common first.
function countBy(list, valuesOf) {
  const counts = new Map();
  for (const item of list) {
    for (const value of valuesOf(item)) {
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function maxBy(list, fn) {
  let best = null;
  for (const item of list) {
    const value = fn(item);
    if (value != null && (best === null || value > fn(best))) best = item;
  }
  return best;
}

// ----- Building blocks -----

function tile(label, value, note = "") {
  return `
    <div class="stat-tile">
      <div class="stat-label">${esc(label)}</div>
      <div class="stat-value">${esc(value)}</div>
      ${note ? `<div class="stat-note">${esc(note)}</div>` : ""}
    </div>`;
}

function card(title, body, subtitle = "") {
  return `
    <section class="card stat-card">
      <h2>${esc(title)}</h2>
      ${subtitle ? `<p class="stat-card-sub">${esc(subtitle)}</p>` : ""}
      ${body}
    </section>`;
}

// Horizontal bars, one per entry, value at the tip.
function barList(entries, unit = "book") {
  if (entries.length === 0) return `<p class="stat-empty">Nothing yet.</p>`;
  const max = entries[0][1];
  const total = sum(entries, (e) => e[1]);
  return `<div class="bar-list">${entries.map(([label, count]) => `
    <div class="bar-row" tabindex="0"
         data-tip="${esc(`${label}: ${plural(count, unit)} (${Math.round((count / total) * 100)}%)`)}">
      <span class="bar-label">${esc(label)}</span>
      <span class="bar-track">
        <span class="bar" style="width:${(count / max) * 100}%"></span>
        <span class="bar-value">${formatNumber(count)}</span>
      </span>
    </div>`).join("")}</div>`;
}

// Vertical columns over time (months or years). Only the highest one is labeled;
// hovering any column shows its value, and the table below lists them all.
function columnChart(columns, description) {
  const max = Math.max(...columns.map((c) => c.value), 1);
  const peak = Math.max(...columns.map((c) => c.value));
  return `
    <div class="columns" role="img" aria-label="${esc(description)}">
      ${columns.map((c) => `
        <div class="col" tabindex="0" data-tip="${esc(`${c.full}: ${plural(c.value, "book")}`)}">
          <div class="col-plot">
            ${c.value > 0 && c.value === peak ? `<span class="col-value">${c.value}</span>` : ""}
            <div class="col-bar" style="height:${(c.value / max) * 100}%"></div>
          </div>
          <span class="col-label">${esc(c.label)}</span>
        </div>`).join("")}
    </div>
    <details class="table-view">
      <summary>Show as table</summary>
      <table>
        <thead><tr><th scope="col">${columns.length === 12 ? "Month" : "Year"}</th><th scope="col">Books</th></tr></thead>
        <tbody>${columns.map((c) => `<tr><td>${esc(c.full)}</td><td>${c.value}</td></tr>`).join("")}</tbody>
      </table>
    </details>`;
}

function highlight(label, book, detail) {
  if (!book) return "";
  return `
    <div class="highlight">
      <div class="stat-label">${esc(label)}</div>
      <div class="highlight-book">${esc(book.name)}</div>
      <div class="stat-note">${esc([book.author, detail].filter(Boolean).join(" · "))}</div>
    </div>`;
}

// ----- Page -----

function render() {
  fillYearSelect(yearSelect, books, year);

  const allYears = year === "all";
  const finished = books.filter(
    (b) => b.status === "completed" && (allYears || yearOf(b) === Number(year))
  );
  const dropped = books.filter(
    (b) => b.status === "dropped" && (allYears || yearOf(b) === Number(year))
  );
  const reading = books.filter((b) => b.status === "reading");
  const toRead = books.filter((b) => b.status === "to-read");
  // Books in progress belong to "now", so they only count for this year / all years.
  // Dropped books count in the year you stopped them (their end date).
  const includesNow = allYears || Number(year) === currentYear;

  titleEl.textContent = allYears ? "All-time statistics" : `${year} statistics`;
  subtitleEl.textContent = allYears
    ? "Everything you've read"
    : `Books you finished in ${year}`;

  // Numbers
  const pagesInProgress = includesNow ? sum(reading, (b) => b.currentPage) : 0;
  const pagesInDropped = sum(dropped, (b) => b.currentPage);
  const pagesRead = sum(finished, (b) => b.totalPages) + pagesInProgress + pagesInDropped;
  const pagesNote = [
    pagesInProgress && `${formatNumber(pagesInProgress)} in books you're reading now`,
    pagesInDropped && `${formatNumber(pagesInDropped)} in dropped books`,
  ].filter(Boolean).join(" and ");
  const rated = finished.filter((b) => b.score);
  const avgScore = average(rated, (b) => b.score);
  const avgLength = average(finished.filter((b) => b.totalPages > 0), (b) => b.totalPages);
  const timed = finished.filter((b) => daysToRead(b) != null);
  const avgDays = average(timed, daysToRead);
  const finishedSeries = new Set(finished.map((b) => b.series).filter(Boolean));

  const tiles = [
    tile("Pages read", formatNumber(pagesRead), pagesNote ? `incl. ${pagesNote}` : ""),
    tile("Average score", avgScore != null ? `${avgScore.toFixed(1)} / 10` : "—",
      rated.length ? `from ${plural(rated.length, "rated book")}` : "no scores yet"),
    tile("Average length", avgLength != null ? `${formatNumber(Math.round(avgLength))} pages` : "—"),
    tile("Average time to finish", avgDays != null ? plural(Math.round(avgDays), "day") : "—",
      timed.length ? `from books with start and end dates` : "add start and end dates"),
    tile("Authors read", formatNumber(new Set(finished.map((b) => b.author).filter(Boolean)).size)),
    tile("Series read in", formatNumber(finishedSeries.size)),
  ];
  // Shown even when nothing was finished yet.
  const otherTiles = [];
  if (dropped.length) {
    const ended = finished.length + dropped.length;
    otherTiles.push(tile("Dropped", formatNumber(dropped.length),
      `finish rate ${Math.round((finished.length / ended) * 100)}% (finished vs. dropped)`));
  }
  if (includesNow) {
    otherTiles.push(tile("Reading now", formatNumber(reading.length)));
    otherTiles.push(tile("To read", formatNumber(toRead.length), "on your list"));
  }
  tiles.push(...otherTiles);

  // Books finished over time
  let timeline;
  if (allYears) {
    const counts = countBy(finished, (b) => [String(yearOf(b) ?? "")]);
    const years = counts.map(([y]) => Number(y)).filter(Boolean);
    const columns = [];
    if (years.length) {
      for (let y = Math.min(...years); y <= Math.max(...years); y++) {
        const value = counts.find(([k]) => k === String(y))?.[1] || 0;
        columns.push({ label: String(y), full: String(y), value });
      }
    }
    timeline = columns.length
      ? card("Books finished per year", columnChart(columns, "Books finished per year"))
      : "";
  } else {
    const columns = MONTHS.map((label, i) => ({
      label,
      full: new Date(Number(year), i, 1).toLocaleDateString(undefined, { month: "long" }),
      value: finished.filter((b) => b.endDate && Number(b.endDate.slice(5, 7)) === i + 1).length,
    }));
    const undated = finished.filter((b) => !b.endDate).length;
    timeline = card("Books finished per month",
      columnChart(columns, `Books finished per month in ${year}`),
      undated ? `${plural(undated, "book")} without an end date not shown` : "");
  }

  // Highlights
  const best = maxBy(finished, (b) => b.score);
  const longest = maxBy(finished, (b) => b.totalPages || null);
  const quickest = maxBy(timed, (b) => -daysToRead(b));
  const highlights = [
    highlight("Highest rated", best, best && `★ ${best.score}/10`),
    highlight("Longest book", longest, longest && `${formatNumber(longest.totalPages)} pages`),
    highlight("Quickest read", quickest, quickest && plural(daysToRead(quickest), "day")),
  ].join("");

  if (finished.length === 0) {
    statsEl.innerHTML = `
      <div class="hero card">
        <div class="hero-value">0</div>
        <div class="hero-label">books finished${allYears ? "" : ` in ${esc(year)}`}</div>
        <p class="stat-note">Mark a book as Completed (with an end date) and its stats show up here.</p>
      </div>
      ${otherTiles.length ? `<div class="stat-tiles">${otherTiles.join("")}</div>` : ""}`;
    return;
  }

  statsEl.innerHTML = `
    <div class="hero card">
      <div class="hero-value">${formatNumber(finished.length)}</div>
      <div class="hero-label">${finished.length === 1 ? "book" : "books"} finished${allYears ? "" : ` in ${esc(year)}`}</div>
    </div>

    <div class="stat-tiles">${tiles.join("")}</div>

    ${timeline}

    <div class="stat-grid">
      ${card("Top 5 genres", barList(countBy(finished, (b) => b.genres).slice(0, 5)))}
      ${card("Top 5 authors", barList(countBy(finished, (b) => [b.author]).slice(0, 5)))}
      ${card("Formats", barList(countBy(finished, (b) => [b.format])))}
      ${card("Languages", barList(countBy(finished, (b) => [b.language])))}
      ${card("Types", barList(countBy(finished, (b) => [b.type])))}
      ${card("Scores", barList(
        countBy(rated, (b) => [`★ ${b.score}`]).sort((a, b) => b[0].localeCompare(a[0], undefined, { numeric: true }))
      ))}
    </div>

    ${highlights ? card("Highlights", `<div class="highlights">${highlights}</div>`) : ""}`;
}

// ----- Tooltip (hover or keyboard focus) -----

function showTip(target) {
  tooltip.textContent = target.dataset.tip;
  tooltip.hidden = false;
  const box = target.getBoundingClientRect();
  const tip = tooltip.getBoundingClientRect();
  const left = Math.min(
    Math.max(8, box.left + box.width / 2 - tip.width / 2),
    window.innerWidth - tip.width - 8
  );
  const top = box.top - tip.height - 8 < 8 ? box.bottom + 8 : box.top - tip.height - 8;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

const hideTip = () => { tooltip.hidden = true; };

for (const type of ["pointerover", "focusin"]) {
  statsEl.addEventListener(type, (e) => {
    const target = e.target.closest("[data-tip]");
    if (target) showTip(target);
  });
}
statsEl.addEventListener("pointerout", (e) => {
  if (!e.relatedTarget?.closest?.("[data-tip]")) hideTip();
});
statsEl.addEventListener("focusout", hideTip);
window.addEventListener("scroll", hideTip, { passive: true });

loadBooks();
