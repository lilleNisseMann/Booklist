// Shared by every page.

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let message = `Server error (${res.status})`;
    try {
      message = (await res.json()).error || message;
    } catch {}
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

// Outlines the empty fields in red and jumps to the first one. Returns true if any
// were empty. The outline goes away as soon as you type in the field.
function flagMissing(inputs) {
  const empty = inputs.filter((input) => !input.value.trim());
  for (const input of inputs) {
    const missing = empty.includes(input);
    input.classList.toggle("missing", missing);
    input.setAttribute("aria-invalid", String(missing));
    if (missing) {
      input.addEventListener("input", () => {
        input.classList.remove("missing");
        input.setAttribute("aria-invalid", "false");
      }, { once: true });
    }
  }
  empty[0]?.focus();
  return empty.length > 0;
}

function goToLogin() {
  location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
}

// Book requests; being logged out sends you to the login page.
async function api(path = "", options = {}) {
  try {
    return await request("/api/books" + path, options);
  } catch (err) {
    if (err.status === 401) goToLogin();
    throw err;
  }
}

// ----- Account (top left corner of every page) -----

const currentUserPromise = request("/api/auth/me").catch(() => null);

// The last known user is remembered in the browser so the top-left corner can be
// drawn straight away instead of popping in after the server answers.
const USER_CACHE_KEY = "bookshelf.user";

function cachedUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_CACHE_KEY));
  } catch {
    return null;
  }
}

function rememberUser(user) {
  try {
    if (user) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_CACHE_KEY);
  } catch {}
}

function drawAccount(slot, user) {
  if (!user) {
    const login = document.createElement("a");
    login.className = "button primary small";
    login.href = "/login.html";
    login.textContent = "Log in";
    slot.replaceChildren(login);
    return;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "account-button";
  button.setAttribute("aria-haspopup", "true");
  button.setAttribute("aria-expanded", "false");
  button.textContent = `👤 ${user.username}`;

  const menu = document.createElement("div");
  menu.className = "account-menu";
  menu.hidden = true;
  if (user.role === "admin") {
    const admin = document.createElement("a");
    admin.href = "/admin.html";
    admin.className = "menu-item";
    admin.textContent = "🛡️ Admin";
    menu.appendChild(admin);
  }
  const logout = document.createElement("button");
  logout.type = "button";
  logout.className = "menu-item";
  logout.textContent = "Log out";
  logout.addEventListener("click", async () => {
    await request("/api/auth/logout", { method: "POST" }).catch(() => {});
    rememberUser(null);
    location.href = "/login.html";
  });
  menu.appendChild(logout);

  button.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    button.setAttribute("aria-expanded", String(!menu.hidden));
  });
  slot.replaceChildren(button, menu);
}

function closeAccountMenu() {
  const menu = document.querySelector(".account-menu");
  if (menu) menu.hidden = true;
  document.querySelector(".account-button")?.setAttribute("aria-expanded", "false");
}
document.addEventListener("click", closeAccountMenu);

function renderAccount() {
  const slot = document.getElementById("account");
  if (!slot) return;
  // The server only shows the login page to logged-out visitors.
  const cached = location.pathname === "/login.html" ? null : cachedUser();
  drawAccount(slot, cached); // instantly, from memory

  currentUserPromise.then((user) => {
    rememberUser(user);
    // Only redraw if the server says something different.
    const same = (a, b) => (a && b ? a.username === b.username && a.role === b.role : a === b);
    if (!same(cached, user)) drawAccount(slot, user);
  });
}

renderAccount();

// Creates the book if it has no id yet, otherwise updates it.
function saveBook(book) {
  const body = JSON.stringify(book);
  return book.id
    ? api(`/${book.id}`, { method: "PUT", body })
    : api("", { method: "POST", body });
}

const STATUS_LABELS = {
  "to-read": "To read", reading: "Reading", completed: "Completed", dropped: "Dropped",
};

const currentYear = new Date().getFullYear();

// Completed books belong to the year they ended, dropped books to the year
// they were stopped (end date). Books still being read (or waiting to be
// read) always count as the current year.
function yearOf(book) {
  if (book.status === "reading" || book.status === "to-read") return currentYear;
  const date = book.endDate || book.startDate;
  if (date) return Number(date.slice(0, 4));
  return book.status === "dropped" ? currentYear : null;
}

// Fills a year dropdown: "All years", then every year with books, newest first.
function fillYearSelect(select, books, value) {
  const years = new Set([currentYear]);
  for (const book of books) {
    const year = yearOf(book);
    if (year) years.add(year);
  }
  select.innerHTML = "";
  select.add(new Option("All years", "all"));
  for (const year of [...years].sort((a, b) => b - a)) {
    select.add(new Option(String(year), String(year)));
  }
  select.value = value;
}

// Today as YYYY-MM-DD in local time (what date inputs use).
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function percent(current, total) {
  if (!total || total <= 0) return 0;
  return Math.round(Math.min(100, Math.max(0, (current / total) * 100)));
}

function setProgress(fillEl, value) {
  fillEl.style.width = value + "%";
  fillEl.classList.toggle("complete", value === 100);
}

function formatDate(value) {
  if (!value) return null;
  return new Date(value + "T00:00:00").toLocaleDateString(undefined, {
    year: "numeric", month: "short", day: "numeric",
  });
}
