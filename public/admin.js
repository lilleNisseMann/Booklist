// The admin page: rename users, change roles, set new passwords and delete users.

const rows = document.getElementById("user-rows");
const rowTemplate = document.getElementById("user-row");
const errorEl = document.getElementById("error");
const noticeEl = document.getElementById("notice");

function showError(message) {
  noticeEl.hidden = true;
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function showNotice(message) {
  errorEl.hidden = true;
  noticeEl.textContent = message;
  noticeEl.hidden = false;
}

const adminApi = (path = "", options = {}) => request("/api/admin/users" + path, options);

async function loadUsers() {
  const me = await currentUserPromise;
  if (!me) return goToLogin();
  try {
    render(await adminApi(), me);
  } catch (err) {
    showError(err.status === 403 ? "Only admins can see this page." : `Couldn't load users: ${err.message}`);
    document.querySelector(".admin-card").hidden = true;
  }
}

function render(users, me) {
  rows.replaceChildren(...users.map((user) => userRow(user, me)));
}

function userRow(user, me) {
  const node = rowTemplate.content.cloneNode(true);
  const isMe = user.id === me.id;
  const usernameInput = node.querySelector(".username-input");
  const roleSelect = node.querySelector(".role-select");
  const resetForm = node.querySelector(".reset-form");
  const newPassword = node.querySelector(".new-password");
  const buttons = [".save", ".reset", ".delete"].map((sel) => node.querySelector(sel));

  usernameInput.value = user.username;
  roleSelect.value = user.role;
  node.querySelector(".you-badge").hidden = !isMe;
  node.querySelector(".book-count").textContent = user.bookCount;
  node.querySelector(".joined").textContent = formatDate(user.createdAt.slice(0, 10));

  const deleteBtn = node.querySelector(".delete");
  if (isMe) {
    deleteBtn.disabled = true;
    deleteBtn.title = "You can't delete your own account";
  }

  node.querySelector(".save").addEventListener("click", async () => {
    try {
      const saved = await adminApi(`/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ username: usernameInput.value.trim(), role: roleSelect.value }),
      });
      showNotice(`Saved ${saved.username}.`);
      // Removing your own admin role means you can't use this page any more.
      if (isMe && saved.role !== "admin") location.href = "/";
      else loadUsers();
    } catch (err) {
      showError(err.message);
    }
  });

  const toggleReset = (open) => {
    resetForm.hidden = !open;
    for (const button of buttons) button.hidden = open;
    newPassword.value = "";
    if (open) newPassword.focus();
  };
  node.querySelector(".reset").addEventListener("click", () => toggleReset(true));
  node.querySelector(".cancel-reset").addEventListener("click", () => toggleReset(false));
  node.querySelector(".set-password").addEventListener("click", async () => {
    try {
      await adminApi(`/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ password: newPassword.value }),
      });
      toggleReset(false);
      showNotice(`New password set for ${user.username}.${isMe ? "" : " They've been logged out everywhere."}`);
    } catch (err) {
      showError(err.message);
    }
  });

  deleteBtn.addEventListener("click", async () => {
    const books = user.bookCount === 1 ? "1 book" : `${user.bookCount} books`;
    if (!confirm(`Delete "${user.username}" and their ${books}? This can't be undone.`)) return;
    try {
      await adminApi(`/${user.id}`, { method: "DELETE" });
      showNotice(`Deleted ${user.username}.`);
      loadUsers();
    } catch (err) {
      showError(err.message);
    }
  });

  return node;
}

loadUsers();
