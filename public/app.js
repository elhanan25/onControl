const state = {
  expenses: [],
  charts: {}
};

const els = {
  form: document.querySelector("#expenseForm"),
  expenseId: document.querySelector("#expenseId"),
  formTitle: document.querySelector("#formTitle"),
  date: document.querySelector("#date"),
  amount: document.querySelector("#amount"),
  category: document.querySelector("#category"),
  description: document.querySelector("#description"),
  paymentMethod: document.querySelector("#paymentMethod"),
  formMessage: document.querySelector("#formMessage"),
  submitButton: document.querySelector("#submitButton"),
  cancelEdit: document.querySelector("#cancelEdit"),
  todayLabel: document.querySelector("#todayLabel"),
  todayTotal: document.querySelector("#todayTotal"),
  monthTotal: document.querySelector("#monthTotal"),
  allTotal: document.querySelector("#allTotal"),
  expensesBody: document.querySelector("#expensesBody"),
  emptyState: document.querySelector("#emptyState"),
  expenseCount: document.querySelector("#expenseCount")
};

const moneyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2
});

const dateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "long",
  year: "numeric"
});

const paymentMethods = [
  "אשראי",
  "מזומן",
  "ביט",
  "פייבוקס",
  "העברה בנקאית",
  "צ'ק",
  "אחר"
];

function formatMoney(value) {
  return moneyFormatter.format(Number(value || 0));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "בקשה נכשלה.");
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function setMessage(message, isError = false) {
  els.formMessage.textContent = message;
  els.formMessage.classList.toggle("error", isError);
}

function getFormExpense() {
  return {
    date: els.date.value,
    amount: els.amount.value,
    category: els.category.value,
    description: els.description.value,
    paymentMethod: els.paymentMethod.value
  };
}

function resetForm() {
  els.form.reset();
  els.expenseId.value = "";
  els.date.value = todayISO();
  els.formTitle.textContent = "הוצאה חדשה";
  els.submitButton.textContent = "שמור הוצאה";
  els.cancelEdit.classList.add("hidden");
  setMessage("");
}

function startEdit(expense) {
  els.expenseId.value = expense.id;
  els.date.value = expense.date;
  els.amount.value = expense.amount;
  els.category.value = expense.category;
  els.description.value = expense.description;
  els.paymentMethod.value = expense.paymentMethod;
  els.formTitle.textContent = "עריכת הוצאה";
  els.submitButton.textContent = "עדכן הוצאה";
  els.cancelEdit.classList.remove("hidden");
  setMessage("");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderExpenses() {
  els.expensesBody.innerHTML = "";
  els.emptyState.classList.toggle("visible", state.expenses.length === 0);
  els.expenseCount.textContent = `${state.expenses.length} הוצאות`;

  state.expenses.forEach((expense) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${expense.date}</td>
      <td>${formatMoney(expense.amount)}</td>
      <td>${expense.category}</td>
      <td>${expense.description || "-"}</td>
      <td>${expense.paymentMethod || "-"}</td>
      <td class="actions">
        <button class="small-button" type="button" data-action="edit" data-id="${expense.id}">ערוך</button>
        <button class="danger-button" type="button" data-action="delete" data-id="${expense.id}">מחק</button>
      </td>
    `;
    els.expensesBody.appendChild(row);
  });
}

function chartColors(count) {
  const palette = ["#146c43", "#007481", "#b7791f", "#7a5af8", "#c2410c", "#155e75", "#be123c", "#365314"];
  return Array.from({ length: count }, (_, index) => palette[index % palette.length]);
}

function upsertChart(key, canvasId, type, labels, values, label) {
  const context = document.querySelector(canvasId);
  if (state.charts[key]) {
    state.charts[key].destroy();
  }

  state.charts[key] = new Chart(context, {
    type,
    data: {
      labels,
      datasets: [
        {
          label,
          data: values,
          borderColor: "#146c43",
          backgroundColor: type === "doughnut" ? chartColors(values.length) : "rgba(20, 108, 67, 0.18)",
          tension: 0.35,
          fill: type === "line"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: type === "doughnut", position: "bottom" }
      },
      scales: type === "doughnut" ? {} : { y: { beginAtZero: true } }
    }
  });
}

function renderSummary(summary) {
  els.todayTotal.textContent = formatMoney(summary.totals.today);
  els.monthTotal.textContent = formatMoney(summary.totals.month);
  els.allTotal.textContent = formatMoney(summary.totals.total);

  upsertChart(
    "daily",
    "#dailyChart",
    "line",
    summary.daily.map((item) => item.date),
    summary.daily.map((item) => item.amount),
    "סכום יומי"
  );

  upsertChart(
    "category",
    "#categoryChart",
    "doughnut",
    summary.category.map((item) => item.category),
    summary.category.map((item) => item.amount),
    "קטגוריות"
  );

  upsertChart(
    "monthly",
    "#monthlyChart",
    "bar",
    summary.monthly.map((item) => item.month),
    summary.monthly.map((item) => item.amount),
    "סכום חודשי"
  );
}

async function refresh() {
  const [expenses, summary] = await Promise.all([
    api("/api/expenses"),
    api("/api/summary")
  ]);

  state.expenses = expenses.expenses;
  renderExpenses();
  renderSummary(summary);
}

async function loadCategories() {
  const data = await api("/api/categories");
  els.category.innerHTML = data.categories
    .map((category) => `<option value="${category}">${category}</option>`)
    .join("");
}

function loadPaymentMethods() {
  els.paymentMethod.innerHTML = paymentMethods
    .map((method) => `<option value="${method}">${method}</option>`)
    .join("");
}

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = els.expenseId.value;
  const expense = getFormExpense();

  try {
    if (id) {
      await api(`/api/expenses/${id}`, {
        method: "PUT",
        body: JSON.stringify(expense)
      });
      setMessage("ההוצאה עודכנה.");
    } else {
      await api("/api/expenses", {
        method: "POST",
        body: JSON.stringify(expense)
      });
      setMessage("ההוצאה נשמרה.");
    }

    resetForm();
    await refresh();
  } catch (error) {
    setMessage(error.message, true);
  }
});

els.cancelEdit.addEventListener("click", resetForm);

els.expensesBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const id = Number(button.dataset.id);
  const expense = state.expenses.find((item) => item.id === id);
  if (!expense) return;

  if (button.dataset.action === "edit") {
    startEdit(expense);
    return;
  }

  if (button.dataset.action === "delete") {
    const confirmed = window.confirm("למחוק את ההוצאה הזו?");
    if (!confirmed) return;

    await api(`/api/expenses/${id}`, { method: "DELETE" });
    await refresh();
  }
});

async function init() {
  els.todayLabel.textContent = dateFormatter.format(new Date());
  els.date.value = todayISO();
  loadPaymentMethods();
  await loadCategories();
  await refresh();
}

init().catch((error) => {
  setMessage(error.message, true);
});
