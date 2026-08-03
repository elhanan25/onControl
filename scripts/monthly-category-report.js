require("dotenv").config();
const path = require("path");

function parseArgs(argv) {
  const args = { month: new Date().toISOString().slice(0, 7) };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--email") args.email = argv[i + 1];
    if (argv[i] === "--month") args.month = argv[i + 1];
  }
  return args;
}

async function findUserIdSqlite(email) {
  const Database = require("better-sqlite3");
  const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "work", "expenses.db");
  const db = new Database(dbPath, { readonly: true });
  const user = db.prepare(`SELECT id FROM users WHERE lower(email) = lower(?)`).get(email);
  return { db, userId: user ? user.id : null };
}

async function categoryTotalsSqlite(db, userId, month) {
  return db
    .prepare(`SELECT category, ROUND(SUM(amount), 2) AS amount FROM expenses WHERE user_id = ? AND substr(date, 1, 7) = ? GROUP BY category ORDER BY amount DESC`)
    .all(userId, month);
}

async function findUserIdPostgres(pool, email) {
  const result = await pool.query(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email]);
  return result.rows[0] ? result.rows[0].id : null;
}

async function categoryTotalsPostgres(pool, userId, month) {
  const result = await pool.query(
    `SELECT category, ROUND(SUM(amount), 2)::float AS amount FROM expenses WHERE user_id = $1 AND to_char(date, 'YYYY-MM') = $2 GROUP BY category ORDER BY amount DESC`,
    [userId, month]
  );
  return result.rows;
}

async function main() {
  const { email, month } = parseArgs(process.argv.slice(2));
  if (!email) {
    process.stderr.write("Usage: node monthly-category-report.js --email <email> [--month YYYY-MM]\n");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  let userId;
  let categories;

  if (databaseUrl) {
    const { Pool } = require("pg");
    const pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
    });
    userId = await findUserIdPostgres(pool, email);
    if (userId != null) categories = await categoryTotalsPostgres(pool, userId, month);
    await pool.end();
  } else {
    const { db, userId: sqliteUserId } = await findUserIdSqlite(email);
    userId = sqliteUserId;
    if (userId != null) categories = await categoryTotalsSqlite(db, userId, month);
    db.close();
  }

  if (userId == null) {
    process.stderr.write(`No user found for email "${email}"\n`);
    process.exit(1);
  }

  process.stdout.write(JSON.stringify({ month, categories: categories || [] }) + "\n");
}

main().catch((err) => {
  process.stderr.write(String(err && err.stack || err) + "\n");
  process.exit(1);
});
