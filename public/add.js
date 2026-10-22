// The "Add new book" page. With ?id=… in the address it edits that book instead.

const form = document.getElementById("book-form");
const fields = {
  id: document.getElementById("book-id"),
  name: document.getElementById("name"),
  startDate: document.getElementById("start-date"),
  endDate: document.getElementById("end-date"),
  totalPages: document.getElementById("total-pages"),
  currentPage: document.getElementById("current-page"),
  language: document.getElementById("language"),
  otherLanguage: document.getElementById("other-language"),
  type: document.getElementById("type"),
  otherType: document.getElementById("other-type"),
  newGenre: document.getElementById("new-genre"),
  author: document.getElementById("author"),
  series: document.getElementById("series"),
  seriesNumber: document.getElementById("series-number"),
};
const otherLanguageWrap = document.getElementById("other-language-wrap");
const otherTypeWrap = document.getElementById("other-type-wrap");
const formProgressFill = document.getElementById("form-progress-fill");
const formProgressText = document.getElementById("form-progress-text");
const errorEl = document.getElementById("error");
const submitBtn = document.getElementById("submit-btn");
const formTitle = document.getElementById("form-title");

const scoreChips = document.getElementById("score-chips");
for (let i = 1; i <= 10; i++) {
  const chip = document.createElement("label");
  chip.className = "chip";
  chip.innerHTML = `<input type="radio" name="score" value="${i}"><span>${i}</span>`;
  scoreChips.appendChild(chip);
}

// ----- Genres -----

const GENRES = [
  "Fantasy", "Science fiction", "Mystery", "Thriller", "Crime", "Romance", "Horror",
  "Historical", "Adventure", "Drama", "Humor", "Young adult", "Children's", "Classics",
  "Dystopian", "Self-help", "Science", "History", "Philosophy", "Psychology",
];
const genreChips = document.getElementById("genre-chips");

function genreChip(genre) {
  return [...genreChips.querySelectorAll("input")].find(
    (input) => input.value.toLowerCase() === genre.toLowerCase()
  );
}

// Adds a genre chip (unless it exists) and returns its checkbox.
function addGenreChip(genre) {
  const existing = genreChip(genre);
  if (existing) return existing;
  const chip = document.createElement("label");
  chip.className = "chip";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.name = "genre";
  input.value = genre;
  const text = document.createElement("span");
  text.textContent = genre;
  chip.append(input, text);
  genreChips.appendChild(chip);
  return input;
}

GENRES.forEach(addGenreChip);

function addCustomGenre() {
  const genre = fields.newGenre.value.trim();
  if (!genre) return;
  addGenreChip(genre).checked = true;
  fields.newGenre.value = "";
  fields.newGenre.focus();
}

document.getElementById("add-genre-btn").addEventListener("click", addCustomGenre);
fields.newGenre.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addCustomGenre();
  }
});

function selectedGenres() {
  return [...genreChips.querySelectorAll("input:checked")].map((input) => input.value);
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

// ----- Cover image -----

const coverInput = document.getElementById("cover");
const coverPreview = document.getElementById("cover-preview");
const coverRemove = document.getElementById("cover-remove");
const coverUrlInput = document.getElementById("cover-url");
const coverUrlBtn = document.getElementById("cover-url-btn");
let currentCover = null;

// Shrinks uploaded images so the database stays small.
function resizeImage(file, maxWidth = 300, maxHeight = 450) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

// `src` is either a resized upload (data URL) or a link to an image online.
function setCover(src) {
  currentCover = src;
  coverPreview.hidden = !src;
  coverRemove.hidden = !src;
  if (src) coverPreview.src = src;
  else coverPreview.removeAttribute("src");
  coverUrlInput.value = src && !src.startsWith("data:") ? src : "";
}

function useCoverUrl() {
  const url = coverUrlInput.value.trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) {
    showError("The image link should start with http:// or https://");
    return;
  }
  const test = new Image();
  test.onload = () => {
    setCover(url);
    errorEl.hidden = true;
  };
  test.onerror = () => showError("Couldn't load an image from that link. Make sure it points straight to an image.");
  test.src = url;
}

coverUrlBtn.addEventListener("click", useCoverUrl);
coverUrlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    useCoverUrl();
  }
});

coverInput.addEventListener("change", async () => {
  const file = coverInput.files[0];
  coverInput.value = "";
  if (!file) return;
  try {
    setCover(await resizeImage(file));
    errorEl.hidden = true;
  } catch {
    showError("That file couldn't be read as an image.");
  }
});

coverRemove.addEventListener("click", () => setCover(null));

// ----- Form -----

function selectedLanguage() {
  return fields.language.value === "__other"
    ? fields.otherLanguage.value.trim()
    : fields.language.value;
}

function updateFormProgress() {
  const value = percent(Number(fields.currentPage.value), Number(fields.totalPages.value));
  setProgress(formProgressFill, value);
  formProgressText.textContent = value + "%";
}

function selectedType() {
  return fields.type.value === "__other" ? fields.otherType.value.trim() : fields.type.value;
}

fields.language.addEventListener("change", () => {
  const isOther = fields.language.value === "__other";
  otherLanguageWrap.hidden = !isOther;
  if (isOther) fields.otherLanguage.focus();
});

fields.type.addEventListener("change", () => {
  const isOther = fields.type.value === "__other";
  otherTypeWrap.hidden = !isOther;
  if (isOther) fields.otherType.focus();
});

const pagesOptional = document.getElementById("pages-optional");

// "To read" books don't need a page count yet.
function updatePagesHint() {
  const toRead = form.elements.status.value === "to-read";
  pagesOptional.hidden = !toRead;
  document.getElementById("pages-label").classList.toggle("required", !toRead);
  if (toRead) fields.totalPages.classList.remove("missing");
}

// Marking a book completed fills in the last page and today's end date;
// marking it dropped fills in today's end date (the day you stopped).
form.querySelectorAll('input[name="status"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    updatePagesHint();
    if (!radio.checked) return;
    if (radio.value === "completed" && Number(fields.totalPages.value) > 0) {
      fields.currentPage.value = fields.totalPages.value;
    }
    // For a dropped book, the end date is the day you stopped.
    if ((radio.value === "completed" || radio.value === "dropped") && !fields.endDate.value) {
      fields.endDate.value = today();
    }
    updateFormProgress();
  });
});

fields.currentPage.addEventListener("input", updateFormProgress);
fields.totalPages.addEventListener("input", updateFormProgress);

function validate(book) {
  if (!book.name) return "Please enter the book's name.";
  if (book.status !== "to-read" && !(book.totalPages >= 1)) {
    return "Total pages must be at least 1 (only “To read” books can have 0).";
  }
  if (book.totalPages < 0) return "Total pages can't be negative.";
  if (book.currentPage < 0) return "Current page can't be negative.";
  if (book.currentPage > book.totalPages) return "Current page can't be more than the total pages.";
  if (!book.language) return "Please type which language.";
  if (book.seriesNumber !== null && !(book.seriesNumber >= 1 && Number.isInteger(book.seriesNumber))) {
    return "The number in the series must be a whole number from 1.";
  }
  if (book.seriesNumber !== null && !book.series) return "Please enter the series name for the number.";
  if (book.startDate && book.endDate && book.endDate < book.startDate) {
    return "End date can't be before the start date.";
  }
  return null;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const book = {
    id: fields.id.value || undefined,
    name: fields.name.value.trim(),
    author: fields.author.value.trim() || null,
    series: fields.series.value.trim() || null,
    seriesNumber: fields.seriesNumber.value === "" ? null : Number(fields.seriesNumber.value),
    status: form.elements.status.value,
    startDate: fields.startDate.value,
    endDate: fields.endDate.value,
    totalPages: Number(fields.totalPages.value),
    currentPage: Number(fields.currentPage.value) || 0,
    format: form.elements.format.value,
    language: selectedLanguage(),
    score: form.elements.score.value ? Number(form.elements.score.value) : null,
    type: selectedType() || null,
    genres: selectedGenres(),
    // A pasted link counts even if "Use link" wasn't clicked.
    cover: /^https?:\/\//i.test(coverUrlInput.value.trim()) ? coverUrlInput.value.trim() : currentCover,
  };

  // The fields marked with * must be filled in.
  const required = [fields.name];
  if (book.status !== "to-read") required.push(fields.totalPages);
  if (fields.language.value === "__other") required.push(fields.otherLanguage);
  if (flagMissing(required)) {
    showError("Please fill in the fields marked with *.");
    return;
  }

  const error = validate(book);
  errorEl.hidden = !error;
  errorEl.textContent = error || "";
  if (error) return;

  submitBtn.disabled = true;
  try {
    await saveBook(book);
  } catch (err) {
    showError(`Couldn't save: ${err.message}`);
    submitBtn.disabled = false;
    return;
  }
  location.href = "/";
});

function fillForm(book) {
  fields.id.value = book.id;
  fields.name.value = book.name;
  fields.author.value = book.author || "";
  fields.series.value = book.series || "";
  fields.seriesNumber.value = book.seriesNumber ?? "";
  form.elements.status.value = book.status;
  updatePagesHint();
  fields.startDate.value = book.startDate;
  fields.endDate.value = book.endDate;
  fields.totalPages.value = book.totalPages;
  fields.currentPage.value = book.currentPage;
  form.elements.format.value = book.format;
  form.elements.score.value = book.score ?? "";
  setCover(book.cover || null);

  const known = [...fields.language.options].some((o) => o.value === book.language);
  fields.language.value = known ? book.language : "__other";
  fields.otherLanguage.value = known ? "" : book.language;
  otherLanguageWrap.hidden = known;

  const knownType = !book.type || [...fields.type.options].some((o) => o.value === book.type);
  fields.type.value = knownType ? book.type || "" : "__other";
  fields.otherType.value = knownType ? "" : book.type;
  otherTypeWrap.hidden = knownType;

  for (const genre of book.genres || []) addGenreChip(genre).checked = true;

  updateFormProgress();
}

// Suggest series and authors already used, so they're spelled the same every time.
async function loadSuggestions() {
  let books;
  try {
    books = await api();
  } catch {
    return; // suggestions are optional
  }
  for (const [key, listId] of [["series", "series-list"], ["author", "author-list"]]) {
    const names = new Set(books.map((b) => b[key]).filter(Boolean));
    const datalist = document.getElementById(listId);
    for (const name of [...names].sort()) datalist.appendChild(new Option(name));
  }
}

async function init() {
  updateFormProgress();
  loadSuggestions();
  const id = new URLSearchParams(location.search).get("id");
  if (!id) return;

  formTitle.textContent = "Edit book";
  document.title = "Edit Book";
  submitBtn.textContent = "Save changes";
  try {
    fillForm(await api(`/${encodeURIComponent(id)}`));
  } catch (err) {
    showError(err.status === 404 ? "That book doesn't exist any more." : `Couldn't load the book: ${err.message}`);
    submitBtn.disabled = true;
  }
}

init();
