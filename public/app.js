const pageConfig = {
  expenses: {
    api: "/api/expenses",
    title: "מעקב הוצאות",
    eyebrow: "מה יצא ומתי",
    singular: "הוצאה",
    plural: "הוצאות",
    newTitle: "הוצאה חדשה",
    editTitle: "עריכת הוצאה",
    saveText: "שמור הוצאה",
    updateText: "עדכן הוצאה",
    savedMessage: "ההוצאה נשמרה.",
    updatedMessage: "ההוצאה עודכנה.",
    confirmDelete: "למחוק את ההוצאה הזו?",
    categoryChart: "הוצאות לפי קטגוריה",
    monthlyChart: "הוצאות חודשיות",
    methods: ["אשראי", "מזומן", "ביט", "פייבוקס", "העברה בנקאית", "צ׳ק", "אחר"],
    colors: {
      main: "#b42318",
      fill: "rgba(180, 35, 24, 0.16)"
    }
  },
  incomes: {
    api: "/api/incomes",
    title: "מעקב הכנסות",
    eyebrow: "מה נכנס ומאיפה",
    singular: "הכנסה",
    plural: "הכנסות",
    newTitle: "הכנסה חדשה",
    editTitle: "עריכת הכנסה",
    saveText: "שמור הכנסה",
    updateText: "עדכן הכנסה",
    savedMessage: "ההכנסה נשמרה.",
    updatedMessage: "ההכנסה עודכנה.",
    confirmDelete: "למחוק את ההכנסה הזו?",
    categoryChart: "הכנסות לפי קטגוריה",
    monthlyChart: "הכנסות חודשיות",
    methods: ["בנק", "מזומן", "ביט", "פייבוקס", "אשראי", "אחר"],
    colors: {
      main: "#146c43",
      fill: "rgba(20, 108, 67, 0.16)"
    }
  }
};

const state = {
  activePage: "expenses",
  records: [],
  charts: {}
};

const els = {
  navItems: document.querySelectorAll(".nav-item"),
  pageEyebrow: document.querySelector("#pageEyebrow"),
  pageTitle: document.querySelector("#pageTitle"),
  form: document.querySelector("#recordForm"),
  recordId: document.querySelector("#recordId"),
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
  todayMetricLabel: document.querySelector("#todayMetricLabel"),
  monthMetricLabel: document.querySelector("#monthMetricLabel"),
  allMetricLabel: document.querySelector("#allMetricLabel"),
  todayTotal: document.querySelector("#todayTotal"),
  monthTotal: document.querySelector("#monthTotal"),
  allTotal: document.querySelector("#allTotal"),
  categoryChartTitle: document.querySelector("#categoryChartTitle"),
  monthlyChartTitle: document.querySelector("#monthlyChartTitle"),
  tableTitle: document.querySelector("#tableTitle"),
  recordsBody: document.querySelector("#recordsBody"),
  emptyState: document.querySelector("#emptyState"),
  recordCount: document.querySelector("#recordCount")
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

function currentConfig() {
  return pageConfig[state.activePage];
}

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
    throw new Error(body.error || "הבקשה נכשלה.");
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

function getFormRecord() {
  return {
    date: els.date.value,
    amount: els.amount.value,
    category: els.category.value,
    description: els.description.value,
    paymentMethod: els.paymentMethod.value
  };
}

function fillSelect(select, items) {
  select.innerHTML = items.map((item) => `<option value="${item}">${item}</option>`).join("");
}

function resetForm() {
  const config = currentConfig();
  els.form.reset();
  els.recordId.value = "";
  els.date.value = todayISO();
  els.formTitle.textContent = config.newTitle;
  els.submitButton.textContent = config.saveText;
  els.cancelEdit.classList.add("hidden");
  setMessage("");
}

function startEdit(record) {
  const config = currentConfig();
  els.recordId.value = record.id;
  els.date.value = record.date;
  els.amount.value = record.amount;
  els.category.value = record.category;
  els.description.value = record.description;
  els.paymentMethod.value = record.paymentMethod;
  els.formTitle.textContent = config.editTitle;
  els.submitButton.textContent = config.updateText;
  els.cancelEdit.classList.remove("hidden");
  setMessage("");
  els.form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderRows() {
  const config = currentConfig();
  els.recordsBody.innerHTML = "";
  els.emptyState.classList.toggle("visible", state.records.length === 0);
  els.recordCount.textContent = `${state.records.length} ${config.plural}`;

  state.records.forEach((record) => {
    const row = document.createElement("tr");
    const actionsCell = document.createElement("td");
    const actionsWrap = document.createElement("div");
    const editButton = document.createElement("button");
    const deleteButton = document.createElement("button");

    row.innerHTML = `
      <td>${record.date}</td>
      <td>${formatMoney(record.amount)}</td>
      <td>${record.category}</td>
      <td>${record.description || "-"}</td>
      <td>${record.paymentMethod || "-"}</td>
    `;

    actionsCell.className = "actions-cell";
    actionsWrap.className = "actions";
    editButton.className = "small-button";
    editButton.type = "button";
    editButton.textContent = "ערוך";
    editButton.addEventListener("click", () => startEdit(record));

    deleteButton.className = "danger-button";
    deleteButton.type = "button";
    deleteButton.textContent = "מחק";
    deleteButton.addEventListener("click", () => deleteRecord(record));

    actionsWrap.append(editButton, deleteButton);
    actionsCell.appendChild(actionsWrap);
    row.appendChild(actionsCell);
    els.recordsBody.appendChild(row);
  });
}

function chartColors(count) {
  const palette = ["#146c43", "#007481", "#b7791f", "#7a5af8", "#c2410c", "#155e75", "#be123c", "#365314"];
  return Array.from({ length: count }, (_, index) => palette[index % palette.length]);
}

function upsertChart(key, canvasId, type, labels, values, label) {
  const config = currentConfig();
  const context = document.querySelector(canvasId);
  if (!context) return;

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
          borderColor: config.colors.main,
          backgroundColor: type === "doughnut" ? chartColors(values.length) : config.colors.fill,
          borderWidth: 2,
          borderRadius: type === "bar" ? 8 : 0,
          tension: 0.35,
          fill: false
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
  const config = currentConfig();
  els.todayTotal.textContent = formatMoney(summary.totals.today);
  els.monthTotal.textContent = formatMoney(summary.totals.month);
  els.allTotal.textContent = formatMoney(summary.totals.total);

  upsertChart(
    "category",
    "#categoryChart",
    "doughnut",
    summary.category.map((item) => item.category),
    summary.category.map((item) => item.amount),
    config.categoryChart
  );

  upsertChart(
    "monthly",
    "#monthlyChart",
    "bar",
    summary.monthly.map((item) => item.month),
    summary.monthly.map((item) => item.amount),
    config.monthlyChart
  );
}

function applyPageText() {
  const config = currentConfig();
  els.pageEyebrow.textContent = config.eyebrow;
  els.pageTitle.textContent = config.title;
  els.todayMetricLabel.textContent = `${config.singular} היום`;
  els.monthMetricLabel.textContent = `${config.singular} החודש`;
  els.allMetricLabel.textContent = `סה״כ ${config.plural}`;
  els.categoryChartTitle.textContent = config.categoryChart;
  els.monthlyChartTitle.textContent = config.monthlyChart;
  els.tableTitle.textContent = `${config.plural} אחרונות`;

  els.navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.page === state.activePage);
  });
}

async function loadCategories() {
  const config = currentConfig();
  const data = await api(`${config.api}/categories`);
  fillSelect(els.category, data.categories);
  fillSelect(els.paymentMethod, config.methods);
}

async function refresh() {
  const config = currentConfig();
  const [records, summary] = await Promise.all([
    api(config.api),
    api(`${config.api}/summary`)
  ]);

  state.records = records.records;
  renderRows();
  renderSummary(summary);
}

async function switchPage(page) {
  if (!pageConfig[page] || state.activePage === page) return;
  state.activePage = page;
  applyPageText();
  await loadCategories();
  resetForm();
  await refresh();
}

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const config = currentConfig();
  const id = els.recordId.value;
  const record = getFormRecord();

  try {
    if (id) {
      await api(`${config.api}/${id}`, {
        method: "PUT",
        body: JSON.stringify(record)
      });
      setMessage(config.updatedMessage);
    } else {
      await api(config.api, {
        method: "POST",
        body: JSON.stringify(record)
      });
      setMessage(config.savedMessage);
    }

    resetForm();
    await refresh();
  } catch (error) {
    setMessage(error.message, true);
  }
});

els.cancelEdit.addEventListener("click", resetForm);

async function deleteRecord(record) {
  const config = currentConfig();
  if (!record) return;

  const confirmed = window.confirm(config.confirmDelete);
  if (!confirmed) return;

  try {
    await api(`${config.api}/${record.id}`, { method: "DELETE" });
    await refresh();
    resetForm();
  } catch (error) {
    setMessage(error.message, true);
  }
}

els.navItems.forEach((item) => {
  item.addEventListener("click", () => {
    switchPage(item.dataset.page).catch((error) => setMessage(error.message, true));
  });
});

async function init() {
  els.todayLabel.textContent = dateFormatter.format(new Date());
  applyPageText();
  await loadCategories();
  resetForm();
  await refresh();
}

init().catch((error) => {
  setMessage(error.message, true);
});
