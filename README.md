# 📚 My Bookshelf

A small website for keeping track of the books you read: what you're reading now, what's
next, what you finished or dropped, with scores, genres, series, covers and a summary to give you stats on how much etc you read for a certain period.
This site is just so each individual user can se and update their own book it is not possible to see what other users read, but the admin can change name, password or delete users.

- **Joining a bookshelf someone shared with you?** Jump to [For friends: how to join](#for-friends-how-to-join).
- **Hosting it yourself?** Start with [For the host: set it up](#for-the-host-set-it-up).

---

## For friends: how to join

You don't need to install anything — just a web browser.

1. **Open the link** the host sent you. It looks something like
   `https://some-random-words.trycloudflare.com`.
2. Click **Log in** in the top left corner, then the **Create account** tab.
3. Pick a **username** (3–30 characters: letters, numbers, `_` `.` `-`) and a **password** (follow the password iunstructions on the site)
4. Click **Create account** — you're in, with your own empty bookshelf.
5. Add books with **Add new book** at the top. Only you can see your books.

Good to know:
- The link only works **while the host has the site running**. If it stops working, ask them.
- The host usually gets a **new link each time** they share, so they'll send you the new one, but the account with its updates are still saved even though the link might be different the next time
  
- Forgot your password? Ask the host (the admin) to set a new one for you.

---

## For the host: set it up

You only need to do this once.

### 1. Install what it needs

- [Node.js](https://nodejs.org) (version 20 or newer)
- [MySQL](https://dev.mysql.com/downloads/mysql/) (running on your computer)
- Cloudflare's tunnel tool, used to share the site (on a Mac with [Homebrew](https://brew.sh)):
  ```
  brew install cloudflared
  ```


### 2. Fill in your settings

Copy the example settings file and open the copy:

```
cp .env.example .env
```

In `.env`, fill in:

| Setting | What to put there |
|---|---|
| `DB_USER` / `DB_PASSWORD` | Your MySQL username and password |
| `DB_NAME` | Any name for the database, e.g. `bookshelf_db` (it's created for you) |
| `PORT` | The port the site runs on — `3001` is fine, you can change it if you want |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Your own admin account. The password follows the same rules as above |

> ⚠️ `.env` holds your passwords. It's left out of git on purpose — never commit or share it.

### 3. Start the site

```
npm start
```

Open <http://localhost:3001> and log in with your admin account. The first time, the
server creates the database, the tables and your admin account by itself.

---

## For the host: make it joinable

This shares the site from your own computer through a free Cloudflare quick tunnel —
no account or web hosting needed.

1. **Start the site** in one terminal window (leave it running):
   ```
   npm start
   ```
2. **Start sharing** in a second terminal window (leave this running too):
   ```
   npm run share
   ```
3. After a few seconds you'll see a box with a link like:
   ```
   https://some-random-words.trycloudflare.com
   ```
4. **Send that link to your friends** and point them to
   [For friends: how to join](#for-friends-how-to-join).

**While sharing:**
- Your computer must stay **on and awake**, with both terminal windows running.
- To stop sharing, press `Ctrl + C` in the sharing window. To stop the site, press `Ctrl + C`
  in the other one. The link stops working right away.
- Each time you run `npm run share` you get a **new link** — send the new one to your friends.
  Their accounts and books are kept in your database.

**Before you share for the first time:**
- **Anyone with the link can create an account.** Only send it to people you trust.
- Use a **strong admin password** (change it any time: 👤 your name → 🛡️ Admin →
  *New password* on your own row).
- The tunnel only exposes the website — your MySQL database itself is not reachable from
  the internet.

### Managing people (admin)

Click **👤 your name → 🛡️ Admin** in the top left corner. There you can:
- **Rename** a user or make them an **admin**
- Set a **new password** for someone who forgot theirs (this logs them out everywhere)
- **Delete** a user — this also deletes all their books, and can't be undone

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm run share` says `cloudflared: command not found` | Install it: `brew install cloudflared` |
| The site says it can't reach the server | Make sure `npm start` is running |
| `npm start` fails with a database error | Check that MySQL is running and the details in `.env` are right |
| `EADDRINUSE` when starting | Something already uses that port — stop it, or change `PORT` in `.env` (and the port in the `share` script in `package.json`) |
| Friends get "Too many failed logins" | Wait 15 minutes — it's protection against password guessing |
| No admin account was created | `ADMIN_USERNAME` / `ADMIN_PASSWORD` are missing or the password breaks the rules — check the message when starting |

---

See [CHANGELOG.md](CHANGELOG.md) for what's changed.
