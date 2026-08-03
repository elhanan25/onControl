---
name: check-budget
description: Compare a user's monthly expenses by category against illustrative average household spending, via the budget-benchmark MCP server.
---

# check-budget

Compares a user's reported expenses for a given month against reference "average household spending" figures, category by category.

## Usage

`/check-budget <email> [YYYY-MM]`

- `email` — the app user's email (matches the `users.email` column).
- `YYYY-MM` — optional month; defaults to the current month if omitted.

## Steps

1. Run `node scripts/monthly-category-report.js --email <email> --month <month>` (omit `--month` to default to the current month) from the repository root. Parse the JSON on stdout: `{ month, categories: [{ category, amount }] }`.
2. If the script errors (e.g. no such user), report that to the user and stop.
3. For each category returned, call the `get_average_spending` tool on the `budget-benchmark` MCP server with `{ category }` to get `{ monthlyAverage, basis, sourceCategory, source, note }` (or an error if that category has no reference data). `basis` is either `"cbs"` (figure quoted directly from an official CBS survey publication) or `"estimated"` (no matching line item in the official breakdown, split/approximated by this project).
4. For every category with both an actual amount and a reference average, compute the percent difference: `(actual - monthlyAverage) / monthlyAverage * 100`.
5. Present a Hebrew table with columns: קטגוריה | ההוצאה שלי | ממוצע השוק | מקור (רשמי/הערכה) | הפרש ב-% | חיווי. The "מקור" column shows "רשמי (הלמ\"ס)" when `basis` is `"cbs"` or "הערכה" when `"estimated"`. Use חיווי of "מעל הממוצע" (diff > +15%), "מתחת לממוצע" (diff < -15%), or "תואם" (בין -15% ל-15%).
6. List any categories that had no reference data separately, without a comparison.
7. End the report with the `source` and `note` fields from the reference data — cite where the official figures came from and flag that the "estimated" rows are approximations, and that the CBS data itself is from 2021 (not adjusted for inflation since).
