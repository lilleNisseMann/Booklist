// MySQL: connects, and creates or updates the tables when the server starts.
import mysql from "mysql2/promise";
import { ensureAdmin, initAuthTables } from "./auth/auth.js";
import { STATUS_COLUMN } from "./books/book.js";

const {
  DB_HOST = "localhost",
  DB_PORT = "3306",
  DB_USER = "root",
  DB_PASSWORD = "",
  DB_NAME = "bookshelf",
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
} = process.env;

export async function initDatabase() {
  if (!/^\w+$/.test(DB_NAME)) throw new Error("DB_NAME may only contain letters, numbers and _");

  const connection = { host: DB_HOST, port: Number(DB_PORT), user: DB_USER, password: DB_PASSWORD };

  const setup = await mysql.createConnection(connection);
  await setup.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await setup.end();

  const pool = mysql.createPool({ ...connection, database: DB_NAME, dateStrings: true });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS books (
      id           CHAR(36)          PRIMARY KEY,
      user_id      CHAR(36)          NULL,
      name         VARCHAR(255)      NOT NULL,
      author       VARCHAR(255)      NULL,
      status       ${STATUS_COLUMN},
      start_date   DATE              NULL,
      end_date     DATE              NULL,
      total_pages  INT UNSIGNED      NOT NULL,
      current_page INT UNSIGNED      NOT NULL DEFAULT 0,
      format       ENUM('Electronic', 'Physical (library)', 'Physical (own)') NOT NULL,
      language     VARCHAR(100)      NOT NULL,
      score        TINYINT UNSIGNED  NULL,
      cover        MEDIUMTEXT        NULL,
      book_type    VARCHAR(100)      NULL,
      genres       JSON              NULL,
      series       VARCHAR(255)      NULL,
      series_number INT UNSIGNED     NULL,
      created_at   DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at   DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX (user_id)
    )
  `);

  // Columns added after the table was first created.
  await addColumnIfMissing(pool, "book_type", "VARCHAR(100) NULL AFTER cover");
  await addColumnIfMissing(pool, "genres", "JSON NULL AFTER book_type");
  await addColumnIfMissing(pool, "series", "VARCHAR(255) NULL AFTER genres");
  await addColumnIfMissing(pool, "author", "VARCHAR(255) NULL AFTER name");
  await addColumnIfMissing(pool, "series_number", "INT UNSIGNED NULL AFTER series");
  if (await addColumnIfMissing(pool, "user_id", "CHAR(36) NULL AFTER id")) {
    await pool.query("ALTER TABLE books ADD INDEX (user_id)");
  }
  const addedStatus = await addColumnIfMissing(
    pool, "status", `${STATUS_COLUMN} AFTER name`
  );
  if (addedStatus) {
    // Books saved before statuses existed: fully read ones count as completed.
    await pool.query("UPDATE books SET status = 'completed' WHERE current_page >= total_pages");
  }

  // Tables made before "dropped" existed need it added to the status list.
  const [[{ COLUMN_TYPE: statusType }]] = await pool.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'books' AND COLUMN_NAME = 'status'`,
    [DB_NAME]
  );
  if (!statusType.includes("'dropped'")) {
    await pool.query(`ALTER TABLE books MODIFY COLUMN status ${STATUS_COLUMN}`);
  }

  await initAuthTables(pool);
  const adminId = await ensureAdmin(pool, ADMIN_USERNAME, ADMIN_PASSWORD);
  // Books from before accounts existed belong to the admin.
  if (adminId) await pool.query("UPDATE books SET user_id = ? WHERE user_id IS NULL", [adminId]);
  return pool;
}

// Returns true if the column was added.
async function addColumnIfMissing(pool, column, definition) {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'books' AND COLUMN_NAME = ?`,
    [DB_NAME, column]
  );
  if (rows.length > 0) return false;
  await pool.query(`ALTER TABLE books ADD COLUMN ${column} ${definition}`);
  return true;
}
