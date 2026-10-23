// The login / create account page.

const form = document.getElementById("auth-form");
const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const title = document.getElementById("auth-title");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const confirmInput = document.getElementById("confirm");
const confirmWrap = document.getElementById("confirm-wrap");
const rulesList = document.getElementById("password-rules");
const errorEl = document.getElementById("error");
const submitBtn = document.getElementById("submit-btn");

// Same rules as the server.
const RULES = {
  length: (pw) => pw.length >= 7,
  capital: (pw) => /[A-Z]/.test(pw),
  special: (pw) => /[^A-Za-z0-9]/.test(pw),
};

let mode = "login";

function setMode(next) {
  mode = next;
  const register = mode === "register";
  tabLogin.setAttribute("aria-selected", String(!register));
  tabRegister.setAttribute("aria-selected", String(register));
  title.textContent = register ? "Create your account" : "Welcome back";
  submitBtn.textContent = register ? "Create account" : "Log in";
  rulesList.hidden = !register;
  confirmWrap.hidden = !register;
  passwordInput.autocomplete = register ? "new-password" : "current-password";
  errorEl.hidden = true;
  updateRules();
}

function updateRules() {
  for (const item of rulesList.querySelectorAll("[data-rule]")) {
    item.classList.toggle("ok", RULES[item.dataset.rule](passwordInput.value));
  }
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

// Where to go after logging in (only paths on this site).
function nextPage() {
  const next = new URLSearchParams(location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

tabLogin.addEventListener("click", () => setMode("login"));
tabRegister.addEventListener("click", () => setMode("register"));
passwordInput.addEventListener("input", updateRules);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  const required = [usernameInput, passwordInput];
  if (mode === "register") required.push(confirmInput);
  if (flagMissing(required)) return showError("Please fill in the fields marked with *.");
  if (mode === "register") {
    if (!/^[A-Za-z0-9_.-]{3,30}$/.test(username)) {
      return showError("Username must be 3–30 characters: letters, numbers, _ . or -");
    }
    if (!Object.values(RULES).every((rule) => rule(password))) {
      return showError("Your password doesn't meet all the rules yet.");
    }
    if (password !== confirmInput.value) return showError("The passwords don't match.");
  }

  submitBtn.disabled = true;
  try {
    const user = await request(`/api/auth/${mode === "register" ? "register" : "login"}`, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    rememberUser(user);
    location.href = nextPage();
  } catch (err) {
    showError(err.message);
    submitBtn.disabled = false;
  }
});

// Already logged in? Go straight on.
currentUserPromise.then((user) => { if (user) location.href = nextPage(); });

setMode(new URLSearchParams(location.search).get("mode") === "register" ? "register" : "login");
