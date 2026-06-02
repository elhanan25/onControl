const path = require("path");
const express = require("express");
const Database = require("better-sqlite3");

const app = express();
const port = Number(process.env.PORT || 3000);
const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "work", "expenses.db");
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

app.use(express.json());
app.use("/vendor/chart.js", express.static(path.join(__dirname, "..", "node_modules", "chart.js", "dist")));
app.use(express.static(path.join(__dirname, "..", "public")));

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
      amount: Math.round(amount * 100) / 100,
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
    amount: row.amount,
    category: row.category,
    description: row.description || "",
    paymentMethod: row.payment_method || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

app.get("/api/categories", (req, res) => {
  res.json({ categories });
});

app.get("/api/expenses", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM expenses ORDER BY date DESC, id DESC")
    .all();
  res.json({ expenses: rows.map(mapExpense) });
});

app.post("/api/expenses", (req, res) => {
  const normalized = normalizeExpense(req.body);
  if (normalized.error) {
    res.status(400).json({ error: normalized.error });
    return;
  }

  const expense = normalized.value;
  const result = db
    .prepare(`
      INSERT INTO expenses (date, amount, category, description, payment_method)
      VALUES (@date, @amount, @category, @description, @paymentMethod)
    `)
    .run(expense);

  const row = db.prepare("SELECT * FROM expenses WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json({ expense: mapExpense(row) });
});

app.put("/api/expenses/:id", (req, res) => {
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

  const expense = normalized.value;
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

  if (result.changes === 0) {
    res.status(404).json({ error: "ההוצאה לא נמצאה." });
    return;
  }

  const row = db.prepare("SELECT * FROM expenses WHERE id = ?").get(id);
  res.json({ expense: mapExpense(row) });
});

app.delete("/api/expenses/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "מזהה הוצאה לא תקין." });
    return;
  }

  const result = db.prepare("DELETE FROM expenses WHERE id = ?").run(id);
  if (result.changes === 0) {
    res.status(404).json({ error: "ההוצאה לא נמצאה." });
    return;
  }

  res.status(204).send();
});

app.get("/api/summary", (req, res) => {
  const total = db.prepare("SELECT COALESCE(SUM(amount), 0) AS value FROM expenses").get().value;
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const todayTotal = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS value FROM expenses WHERE date = ?")
    .get(today).value;
  const monthTotal = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS value FROM expenses WHERE substr(date, 1, 7) = ?")
    .get(month).value;
  const daily = db
    .prepare(`
      SELECT date, ROUND(SUM(amount), 2) AS amount
      FROM expenses
      GROUP BY date
      ORDER BY date ASC
    `)
    .all();
  const category = db
    .prepare(`
      SELECT category, ROUND(SUM(amount), 2) AS amount
      FROM expenses
      GROUP BY category
      ORDER BY amount DESC
    `)
    .all();
  const monthly = db
    .prepare(`
      SELECT substr(date, 1, 7) AS month, ROUND(SUM(amount), 2) AS amount
      FROM expenses
      GROUP BY substr(date, 1, 7)
      ORDER BY month ASC
    `)
    .all();

  res.json({
    totals: {
      total: Math.round(total * 100) / 100,
      today: Math.round(todayTotal * 100) / 100,
      month: Math.round(monthTotal * 100) / 100
    },
    daily,
    category,
    monthly
  });
});

app.listen(port, () => {
  console.log(`Expense tracker running at http://localhost:${port}`);
});
