# onControl

Give me control of my expenses.

אפליקציית MVP למעקב הוצאות יומי עם Vanilla JS, שרת Node/Express, SQLite מקומי ו-PostgreSQL בענן.

## הרצה

```bash
npm install
npm start
```

אחרי ההרצה פותחים:

```text
http://localhost:3000
```

ברירת המחדל המקומית משתמשת ב-SQLite תחת `work/expenses.db`.

## פריסה חינמית לענן

1. יוצרים Project חינמי ב-Supabase.
2. מעתיקים Connection string של Postgres מתוך Project Settings -> Database.
3. יוצרים Web Service חינמי ב-Render מתוך המאגר הזה.
4. מגדירים ב-Render:

```text
Build command: npm install
Start command: npm start
Environment variable: DATABASE_URL=<Supabase Postgres connection string>
```

כאשר `DATABASE_URL` מוגדר, האפליקציה יוצרת אוטומטית את טבלת `expenses` ב-PostgreSQL ומשתמשת בה במקום SQLite.

## יכולות

- הזנה ידנית של הוצאה לפי תאריך, סכום, קטגוריה, תיאור ואמצעי תשלום.
- עריכה ומחיקה של הוצאות.
- שמירה מקומית ב-SQLite או בענן ב-PostgreSQL.
- גרפים לפי יום, קטגוריה וחודש.
- סיכומי היום, החודש וסך כל ההוצאות.
