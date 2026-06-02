const path = require("path");
const fs = require("fs");
const express = require("express");
const Database = require("better-sqlite3");
const { Pool } = require("pg");

const app = express();
const port = Number(process.env.PORT || 3000);
const databaseUrl = process.env.DATABASE_URL;

const categories = [
  "מזון",
  "תחבורה",
  "דיור",
  "בריאות",
  "בילויים",
  "קניות",
  "חשבונות",
  "אחר"
];

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalizeExpense(input) {
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

function mapExpense(row) {
  return {
    id: row.id,
    date: row.date,
    amount: Number(row.amount),
    category: row.category,
    description: row.description || "",
    paymentMethod: row.payment_method || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function createSqliteStore() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "work", "expenses.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      category TEXT NOT NULL,
      description TEXT DEFAULT '',
      payment_method TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  return {
    name: "SQLite",
    async listExpenses() {
      return db.prepare("SELECT * FROM expenses ORDER BY date DESC, id DESC").all().map(mapExpense);
    },
    async createExpense(expense) {
      const result = db
        .prepare(`
          INSERT INTO expenses (date, amount, category, description, payment_method)
          VALUES (@date, @amount, @category, @description, @paymentMethod)
        `)
        .run(expense);
      const row = db.prepare("SELECT * FROM expenses WHERE id = ?").get(result.lastInsertRowid);
      return mapExpense(row);
    },
    async updateExpense(id, expense) {
      const result = db
        .prepare(`
          UPDATE expenses
          SET date = @date,
              amount = @amount,
              category = @category,
              description = @description,
              payment_method = @paymentMethod,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = @id
        `)
        .run({ ...expense, id });

      if (result.changes === 0) return null;
      return mapExpense(db.prepare("SELECT * FROM expenses WHERE id = ?").get(id));
    },
    async deleteExpense(id) {
      return db.prepare("DELETE FROM expenses WHERE id = ?").run(id).changes > 0;
    },
    async getSummary() {
      const today = new Date().toISOString().slice(0, 10);
      const month = today.slice(0, 7);
      const total = db.prepare("SELECT COALESCE(SUM(amount), 0) AS value FROM expenses").get().value;
      const todayTotal = db
        .prepare("SELECT COALESCE(SUM(amount), 0) AS value FROM expenses WHERE date = ?")
        .get(today).value;
      const monthTotal = db
        .prepare("SELECT COALESCE(SUM(amount), 0) AS value FROM expenses WHERE substr(date, 1, 7) = ?")
        .get(month).value;
      const daily = db
        .prepare("SELECT date, ROUND(SUM(amount), 2) AS amount FROM expenses GROUP BY date ORDER BY date ASC")
        .all();
      const category = db
        .prepare("SELECT category, ROUND(SUM(amount), 2) AS amount FROM expenses GROUP BY category ORDER BY amount DESC")
        .all();
      const monthly = db
        .prepare(`
          SELECT substr(date, 1, 7) AS month, ROUND(SUM(amount), 2) AS amount
          FROM expenses
          GROUP BY substr(date, 1, 7)
          ORDER BY month ASC
        `)
        .all();

      return {
        totals: {
          total: roundMoney(total),
          today: roundMoney(todayTotal),
          month: roundMoney(monthTotal)
        },
        daily,
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
    CREATE TABLE IF NOT EXISTS expenses (
      id BIGSERIAL PRIMARY KEY,
      date DATE NOT NULL,
      amount NUMERIC(12, 2) NOT NULL CHECK(amount > 0),
      category TEXT NOT NULL,
      description TEXT DEFAULT '',
      payment_method TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const toRows = (result) => result.rows.map((row) => ({
    ...row,
    date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  }));

  return {
    name: "PostgreSQL",
    async listExpenses() {
      const result = await pool.query("SELECT * FROM expenses ORDER BY date DESC, id DESC");
      return toRows(result).map(mapExpense);
    },
    async createExpense(expense) {
      const result = await pool.query(
        `
          INSERT INTO expenses (date, amount, category, description, payment_method)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `,
        [expense.date, expense.amount, expense.category, expense.description, expense.paymentMethod]
      );
      return mapExpense(toRows(result)[0]);
    },
    async updateExpense(id, expense) {
      const result = await pool.query(
        `
          UPDATE expenses
          SET date = $1,
              amount = $2,
              category = $3,
              description = $4,
              payment_method = $5,
              updated_at = NOW()
          WHERE id = $6
          RETURNING *
        `,
        [expense.date, expense.amount, expense.category, expense.description, expense.paymentMethod, id]
      );
      return result.rowCount === 0 ? null : mapExpense(toRows(result)[0]);
    },
    async deleteExpense(id) {
      const result = await pool.query("DELETE FROM expenses WHERE id = $1", [id]);
      return result.rowCount > 0;
    },
    async getSummary() {
      const today = new Date().toISOString().slice(0, 10);
      const month = today.slice(0, 7);
      const [totals, daily, category, monthly] = await Promise.all([
        pool.query(
          `
            SELECT
              COALESCE(SUM(amount), 0) AS total,
              COALESCE(SUM(amount) FILTER (WHERE date = $1::date), 0) AS today,
              COALESCE(SUM(amount) FILTER (WHERE to_char(date, 'YYYY-MM') = $2), 0) AS month
            FROM expenses
          `,
          [today, month]
        ),
        pool.query(`
          SELECT to_char(date, 'YYYY-MM-DD') AS date, ROUND(SUM(amount), 2)::float AS amount
          FROM expenses
          GROUP BY date
          ORDER BY date ASC
        `),
        pool.query(`
          SELECT category, ROUND(SUM(amount), 2)::float AS amount
          FROM expenses
          GROUP BY category
          ORDER BY amount DESC
        `),
        pool.query(`
          SELECT to_char(date, 'YYYY-MM') AS month, ROUND(SUM(amount), 2)::float AS amount
          FROM expenses
          GROUP BY to_char(date, 'YYYY-MM')
          ORDER BY month ASC
        `)
      ]);

      return {
        totals: {
          total: roundMoney(totals.rows[0].total),
          today: roundMoney(totals.rows[0].today),
          month: roundMoney(totals.rows[0].month)
        },
        daily: daily.rows,
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

async function main() {
  const store = databaseUrl ? await createPostgresStore() : createSqliteStore();

  app.use(express.json());
  app.use("/vendor/chart.js", express.static(path.join(__dirname, "..", "node_modules", "chart.js", "dist")));
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, database: store.name });
  });

  app.get("/api/categories", (req, res) => {
    res.json({ categories });
  });

  app.get("/api/expenses", asyncHandler(async (req, res) => {
    res.json({ expenses: await store.listExpenses() });
  }));

  app.post("/api/expenses", asyncHandler(async (req, res) => {
    const normalized = normalizeExpense(req.body);
    if (normalized.error) {
      res.status(400).json({ error: normalized.error });
      return;
    }

    res.status(201).json({ expense: await store.createExpense(normalized.value) });
  }));

  app.put("/api/expenses/:id", asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "מזהה הוצאה לא תקין." });
      return;
    }

    const normalized = normalizeExpense(req.body);
    if (normalized.error) {
      res.status(400).json({ error: normalized.error });
      return;
    }

    const expense = await store.updateExpense(id, normalized.value);
    if (!expense) {
      res.status(404).json({ error: "ההוצאה לא נמצאה." });
      return;
    }

    res.json({ expense });
  }));

  app.delete("/api/expenses/:id", asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "מזהה הוצאה לא תקין." });
      return;
    }

    const deleted = await store.deleteExpense(id);
    if (!deleted) {
      res.status(404).json({ error: "ההוצאה לא נמצאה." });
      return;
    }

    res.status(204).send();
  }));

  app.get("/api/summary", asyncHandler(async (req, res) => {
    res.json(await store.getSummary());
  }));

  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ error: "אירעה שגיאה בשרת." });
  });

  app.listen(port, () => {
    console.log(`Expense tracker running at http://localhost:${port} using ${store.name}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
