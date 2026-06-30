const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const { Pool } = require("pg");

const app = express();
const port = Number(process.env.PORT || 3000);
const databaseUrl = process.env.DATABASE_URL;

const ledgerTypes = {
  expenses: {
    table: "expenses",
    singular: "expense",
    categories: [
      "אינטרנט", "ארנונה",
      "ביגוד", "ביטוח", "בילויים", "בריאות",
      "גז",
      "דיור", "דלק",
      "חינוך", "חניה", "חשמל",
      "טלפון",
      "מזון", "מים", "מסעדות וקפה",
      "ספורט",
      "קניות",
      "שונות", "תחבורה",
      "עירייה",
      "אחר"
    ]
  },
  incomes: {
    table: "incomes",
    singular: "income",
    categories: ["משכורת", "עצמאי", "השקעות", "מתנה", "החזר", "בונוס", "אחר"]
  }
};

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function getLedgerConfig(type) {
  return ledgerTypes[type] || null;
}

function normalizeRecord(input) {
  const date = String(input.date || "").trim();
  const amount = Number(input.amount);
  const category = String(input.category || "").trim();
  const description = String(input.description || "").trim();
  const paymentMethod = String(input.paymentMethod || input.payment_method || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "יש להזין תאריך תקין." };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "יש להזין סכום חיובי." };
  }

  if (!category) {
    return { error: "יש לבחור קטגוריה." };
  }

  return {
    value: {
      date,
      amount: roundMoney(amount),
      category,
      description,
      paymentMethod
    }
  };
}

function mapRecord(row) {
  return {
    id: Number(row.id),
    date: row.date,
    amount: Number(row.amount),
    category: row.category,
    description: row.description || "",
    paymentMethod: row.payment_method || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function sqliteCreateTableSql(table) {
  return `
    CREATE TABLE IF NOT EXISTS ${table} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      category TEXT NOT NULL,
      description TEXT DEFAULT '',
      payment_method TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;
}

function postgresCreateTableSql(table) {
  return `
    CREATE TABLE IF NOT EXISTS ${table} (
      id BIGSERIAL PRIMARY KEY,
      date DATE NOT NULL,
      amount NUMERIC(12, 2) NOT NULL CHECK(amount > 0),
      category TEXT NOT NULL,
      description TEXT DEFAULT '',
      payment_method TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
}

function createSqliteStore() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "work", "expenses.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  Object.values(ledgerTypes).forEach((config) => {
    db.exec(sqliteCreateTableSql(config.table));
    try { db.exec(`ALTER TABLE ${config.table} ADD COLUMN user_id INTEGER`) } catch {}
  });

  return {
    name: "SQLite",

    createUser(username, passwordHash) {
      const result = db
        .prepare(`INSERT INTO users (username, password_hash) VALUES (?, ?)`)
        .run(username, passwordHash);
      return db.prepare(`SELECT id, username FROM users WHERE id = ?`).get(result.lastInsertRowid);
    },

    findUserByUsername(username) {
      return db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
    },

    findUserById(id) {
      return db.prepare(`SELECT id, username FROM users WHERE id = ?`).get(id);
    },

    async list(type, userId) {
      const { table } = getLedgerConfig(type);
      return db
        .prepare(`SELECT * FROM ${table} WHERE user_id = ? ORDER BY date DESC, id DESC`)
        .all(userId)
        .map(mapRecord);
    },
    async create(type, record, userId) {
      const { table } = getLedgerConfig(type);
      const result = db
        .prepare(`
          INSERT INTO ${table} (date, amount, category, description, payment_method, user_id)
          VALUES (@date, @amount, @category, @description, @paymentMethod, @userId)
        `)
        .run({ ...record, userId });
      return mapRecord(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(result.lastInsertRowid));
    },
    async update(type, id, record, userId) {
      const { table } = getLedgerConfig(type);
      const result = db
        .prepare(`
          UPDATE ${table}
          SET date = @date,
              amount = @amount,
              category = @category,
              description = @description,
              payment_method = @paymentMethod,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = @id AND user_id = @userId
        `)
        .run({ ...record, id, userId });

      if (result.changes === 0) return null;
      return mapRecord(db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id));
    },
    async delete(type, id, userId) {
      const { table } = getLedgerConfig(type);
      return db.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).run(id, userId).changes > 0;
    },
    async listCategories(type, userId) {
      const { table } = getLedgerConfig(type);
      return db
        .prepare(`SELECT DISTINCT category FROM ${table} WHERE user_id = ? AND category IS NOT NULL AND category != '' ORDER BY category`)
        .all(userId)
        .map((r) => r.category);
    },
    async summary(type, userId) {
      const { table } = getLedgerConfig(type);
      const today = new Date().toISOString().slice(0, 10);
      const month = today.slice(0, 7);
      const total = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS value FROM ${table} WHERE user_id = ?`).get(userId).value;
      const todayTotal = db
        .prepare(`SELECT COALESCE(SUM(amount), 0) AS value FROM ${table} WHERE user_id = ? AND date = ?`)
        .get(userId, today).value;
      const monthTotal = db
        .prepare(`SELECT COALESCE(SUM(amount), 0) AS value FROM ${table} WHERE user_id = ? AND substr(date, 1, 7) = ?`)
        .get(userId, month).value;
      const category = db
        .prepare(`SELECT category, ROUND(SUM(amount), 2) AS amount FROM ${table} WHERE user_id = ? GROUP BY category ORDER BY amount DESC`)
        .all(userId);
      const monthly = db
        .prepare(`
          SELECT substr(date, 1, 7) AS month, ROUND(SUM(amount), 2) AS amount
          FROM ${table}
          WHERE user_id = ?
          GROUP BY substr(date, 1, 7)
          ORDER BY month ASC
        `)
        .all(userId);

      return {
        totals: {
          total: roundMoney(total),
          today: roundMoney(todayTotal),
          month: roundMoney(monthTotal)
        },
        category,
        monthly
      };
    }
  };
}

async function createPostgresStore() {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await Promise.all(Object.values(ledgerTypes).map(async (config) => {
    await pool.query(postgresCreateTableSql(config.table));
    await pool.query(`ALTER TABLE ${config.table} ADD COLUMN IF NOT EXISTS user_id BIGINT`);
  }));

  const toRows = (result) => result.rows.map((row) => ({
    ...row,
    date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  }));

  return {
    name: "PostgreSQL",

    async createUser(username, passwordHash) {
      const result = await pool.query(
        `INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username`,
        [username, passwordHash]
      );
      return result.rows[0];
    },

    async findUserByUsername(username) {
      const result = await pool.query(`SELECT * FROM users WHERE username = $1`, [username]);
      return result.rows[0] || null;
    },

    async findUserById(id) {
      const result = await pool.query(`SELECT id, username FROM users WHERE id = $1`, [id]);
      return result.rows[0] || null;
    },

    async list(type, userId) {
      const { table } = getLedgerConfig(type);
      const result = await pool.query(`SELECT * FROM ${table} WHERE user_id = $1 ORDER BY date DESC, id DESC`, [userId]);
      return toRows(result).map(mapRecord);
    },
    async create(type, record, userId) {
      const { table } = getLedgerConfig(type);
      const result = await pool.query(
        `
          INSERT INTO ${table} (date, amount, category, description, payment_method, user_id)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `,
        [record.date, record.amount, record.category, record.description, record.paymentMethod, userId]
      );
      return mapRecord(toRows(result)[0]);
    },
    async update(type, id, record, userId) {
      const { table } = getLedgerConfig(type);
      const result = await pool.query(
        `
          UPDATE ${table}
          SET date = $1,
              amount = $2,
              category = $3,
              description = $4,
              payment_method = $5,
              updated_at = NOW()
          WHERE id = $6 AND user_id = $7
          RETURNING *
        `,
        [record.date, record.amount, record.category, record.description, record.paymentMethod, id, userId]
      );
      return result.rowCount === 0 ? null : mapRecord(toRows(result)[0]);
    },
    async delete(type, id, userId) {
      const { table } = getLedgerConfig(type);
      const result = await pool.query(`DELETE FROM ${table} WHERE id = $1 AND user_id = $2`, [id, userId]);
      return result.rowCount > 0;
    },
    async listCategories(type, userId) {
      const { table } = getLedgerConfig(type);
      const result = await pool.query(
        `SELECT DISTINCT category FROM ${table} WHERE user_id = $1 AND category IS NOT NULL AND category != '' ORDER BY category`,
        [userId]
      );
      return result.rows.map((r) => r.category);
    },
    async summary(type, userId) {
      const { table } = getLedgerConfig(type);
      const today = new Date().toISOString().slice(0, 10);
      const month = today.slice(0, 7);
      const [totals, category, monthly] = await Promise.all([
        pool.query(
          `
            SELECT
              COALESCE(SUM(amount), 0) AS total,
              COALESCE(SUM(amount) FILTER (WHERE date = $1::date), 0) AS today,
              COALESCE(SUM(amount) FILTER (WHERE to_char(date, 'YYYY-MM') = $2), 0) AS month
            FROM ${table}
            WHERE user_id = $3
          `,
          [today, month, userId]
        ),
        pool.query(
          `SELECT category, ROUND(SUM(amount), 2)::float AS amount FROM ${table} WHERE user_id = $1 GROUP BY category ORDER BY amount DESC`,
          [userId]
        ),
        pool.query(
          `
            SELECT to_char(date, 'YYYY-MM') AS month, ROUND(SUM(amount), 2)::float AS amount
            FROM ${table}
            WHERE user_id = $1
            GROUP BY to_char(date, 'YYYY-MM')
            ORDER BY month ASC
          `,
          [userId]
        )
      ]);

      return {
        totals: {
          total: roundMoney(totals.rows[0].total),
          today: roundMoney(totals.rows[0].today),
          month: roundMoney(totals.rows[0].month)
        },
        category: category.rows,
        monthly: monthly.rows
      };
    }
  };
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function requireLedger(req, res, next) {
  const config = getLedgerConfig(req.params.type);
  if (!config) {
    res.status(404).json({ error: "העמוד המבוקש לא נמצא." });
    return;
  }

  req.ledger = config;
  next();
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    res.status(401).json({ error: "יש להתחבר תחילה." });
    return;
  }
  next();
}

async function main() {
  const store = databaseUrl ? await createPostgresStore() : createSqliteStore();

  app.use(express.json());
  app.use(session({
    secret: process.env.SESSION_SECRET || "change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000
    }
  }));
  app.use("/vendor/chart.js", express.static(path.join(__dirname, "..", "node_modules", "chart.js", "dist")));
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, database: store.name });
  });

  app.post("/api/auth/register", asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};

    if (!username || typeof username !== "string" || username.trim().length < 2 || username.trim().length > 50) {
      res.status(400).json({ error: "שם המשתמש חייב להכיל בין 2 ל-50 תווים." });
      return;
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      res.status(400).json({ error: "הסיסמה חייבת להכיל לפחות 6 תווים." });
      return;
    }

    const trimmedUsername = username.trim();
    const existing = await store.findUserByUsername(trimmedUsername);
    if (existing) {
      res.status(409).json({ error: "שם המשתמש כבר קיים במערכת." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await store.createUser(trimmedUsername, passwordHash);
    req.session.userId = user.id;
    req.session.username = user.username;
    res.status(201).json({ user: { id: user.id, username: user.username } });
  }));

  app.post("/api/auth/login", asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};

    if (!username || !password) {
      res.status(400).json({ error: "יש להזין שם משתמש וסיסמה." });
      return;
    }

    const user = await store.findUserByUsername(String(username).trim());
    if (!user) {
      res.status(401).json({ error: "שם המשתמש או הסיסמה שגויים." });
      return;
    }

    const valid = await bcrypt.compare(String(password), user.password_hash);
    if (!valid) {
      res.status(401).json({ error: "שם המשתמש או הסיסמה שגויים." });
      return;
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    res.json({ user: { id: user.id, username: user.username } });
  }));

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", asyncHandler(async (req, res) => {
    if (!req.session.userId) {
      res.status(401).json({ error: "לא מחובר." });
      return;
    }
    const user = await store.findUserById(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      res.status(401).json({ error: "המשתמש לא נמצא." });
      return;
    }
    res.json({ user: { id: user.id, username: user.username } });
  }));

  app.get("/api/:type/categories", requireLedger, requireAuth, (req, res) => {
    res.json({ categories: req.ledger.categories });
  });

  app.get("/api/:type", requireLedger, requireAuth, asyncHandler(async (req, res) => {
    const records = await store.list(req.params.type, req.session.userId);
    res.json({ [req.ledger.singular + "s"]: records, records });
  }));

  app.post("/api/:type", requireLedger, requireAuth, asyncHandler(async (req, res) => {
    const normalized = normalizeRecord(req.body);
    if (normalized.error) {
      res.status(400).json({ error: normalized.error });
      return;
    }

    const record = await store.create(req.params.type, normalized.value, req.session.userId);
    res.status(201).json({ [req.ledger.singular]: record, record });
  }));

  app.post("/api/:type/import", requireLedger, requireAuth, asyncHandler(async (req, res) => {
    const records = req.body;

    if (!Array.isArray(records)) {
      res.status(400).json({ error: "צפוי array של records" });
      return;
    }

    if (records.length === 0) {
      res.status(400).json({ error: "הקובץ ריק - לא נמצאו רשומות" });
      return;
    }

    if (records.length > 10000) {
      res.status(400).json({ error: "יותר מדי רשומות - מקסימום 10000" });
      return;
    }

    const imported = [];
    const errors = [];

    for (let i = 0; i < records.length; i++) {
      const normalized = normalizeRecord(records[i]);

      if (normalized.error) {
        errors.push({ row: i + 1, error: normalized.error });
        continue;
      }

      try {
        const created = await store.create(req.params.type, normalized.value, req.session.userId);
        imported.push(created);
      } catch (err) {
        errors.push({ row: i + 1, error: err.message });
      }
    }

    res.json({
      imported: imported.length,
      total: records.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `ייובאו ${imported.length} מתוך ${records.length} רשומות בהצלחה.`
    });
  }));

  app.get("/api/:type/summary", requireLedger, requireAuth, asyncHandler(async (req, res) => {
    res.json(await store.summary(req.params.type, req.session.userId));
  }));

  app.put("/api/:type/:id", requireLedger, requireAuth, asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "מזהה הרשומה לא תקין." });
      return;
    }

    const normalized = normalizeRecord(req.body);
    if (normalized.error) {
      res.status(400).json({ error: normalized.error });
      return;
    }

    const record = await store.update(req.params.type, id, normalized.value, req.session.userId);
    if (!record) {
      res.status(404).json({ error: "הרשומה לא נמצאה." });
      return;
    }

    res.json({ [req.ledger.singular]: record, record });
  }));

  app.delete("/api/:type/:id", requireLedger, requireAuth, asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "מזהה הרשומה לא תקין." });
      return;
    }

    const deleted = await store.delete(req.params.type, id, req.session.userId);
    if (!deleted) {
      res.status(404).json({ error: "הרשומה לא נמצאה." });
      return;
    }

    res.status(204).send();
  }));

  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ error: "אירעה שגיאה בשרת." });
  });

  app.listen(port, () => {
    console.log(`Finance tracker running at http://localhost:${port} using ${store.name}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
