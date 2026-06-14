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

function dateForInput(value) {
  return String(value || "").slice(0, 10);
}

function ensureSelectValue(select, value) {
  if (!value) return;
  const exists = Array.from(select.options).some((option) => option.value === value);
  if (!exists) {
    select.add(new Option(value, value));
  }
  select.value = value;
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
  els.form.classList.remove("editing");
  setMessage("");
}

function startEdit(record) {
  const config = currentConfig();
  els.recordId.value = record.id;
  els.date.value = dateForInput(record.date);
  els.amount.value = record.amount;
  ensureSelectValue(els.category, record.category);
  els.description.value = record.description;
  ensureSelectValue(els.paymentMethod, record.paymentMethod);
  els.formTitle.textContent = config.editTitle;
  els.submitButton.textContent = config.updateText;
  els.cancelEdit.classList.remove("hidden");
  setMessage(`${config.singular} נפתחה לעריכה.`);
  els.form.classList.add("editing");
  els.form.scrollIntoView({ behavior: "smooth", block: "start" });
  els.amount.focus();
}

function findRecord(id) {
  return state.records.find((item) => String(item.id) === String(id));
}

function handleRecordAction(action, id) {
  const record = findRecord(id);
  if (!record) return;

  if (action === "edit") {
    startEdit(record);
  }

  if (action === "delete") {
    deleteRecord(record);
  }
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
    editButton.dataset.action = "edit";
    editButton.dataset.id = record.id;
    editButton.textContent = "ערוך";

    deleteButton.className = "danger-button";
    deleteButton.type = "button";
    deleteButton.dataset.action = "delete";
    deleteButton.dataset.id = record.id;
    deleteButton.textContent = "מחק";

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

document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || !els.recordsBody.contains(button)) return;

  event.preventDefault();
  event.stopPropagation();
  handleRecordAction(button.dataset.action, button.dataset.id);
}, true);

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

// Excel Import Handler
async function handleExcelUpload(file) {
  const config = currentConfig();
  const progressContainer = document.querySelector("#importProgress");
  const progressFill = document.querySelector("#importProgressFill");
  const progressText = document.querySelector("#importProgressText");
  const importMessage = document.querySelector("#importMessage");
  const uploadButton = document.querySelector("#uploadExcelButton");

  progressContainer.style.display = "block";
  uploadButton.disabled = true;
  importMessage.textContent = "קורא קובץ...";

  try {
    // Parse Excel file
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error("הקובץ לא מכיל דפים");
    }

    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet);

    if (rows.length === 0) {
      throw new Error("הקובץ ריק - לא נמצאו רשומות");
    }

    // Prepare records with normalized field names
    const records = rows.map((row) => ({
      date: String(row.date || row.Date || row.תאריך || "").trim(),
      amount: Number(row.amount || row.Amount || row.סכום || 0),
      category: String(row.category || row.Category || row.קטגוריה || "").trim(),
      description: String(row.description || row.Description || row.תיאור || "").trim(),
      paymentMethod: String(row.paymentMethod || row.payment_method || row.PaymentMethod || row.Payment_Method || row["אמצעי תשלום"] || "").trim()
    }));

    importMessage.textContent = `שולח ${records.length} רשומות לשרת...`;

    // Send to server
    const response = await api(`${config.api}/import`, {
      method: "POST",
      body: JSON.stringify(records)
    });

    // Update progress
    const imported = response.imported || 0;
    const total = response.total || records.length;
    const percentage = Math.round((imported / total) * 100);
    
    progressFill.style.width = percentage + "%";
    progressText.textContent = percentage + "%";

    let resultMessage = `✓ ייובאו בהצלחה: ${imported}/${total} רשומות`;
    
    if (response.errors && response.errors.length > 0) {
      resultMessage += `\n\nשגיאות (${response.errors.length}):\n`;
      response.errors.slice(0, 5).forEach((err) => {
        resultMessage += `• שורה ${err.row}: ${err.error}\n`;
      });
      if (response.errors.length > 5) {
        resultMessage += `... ועוד ${response.errors.length - 5} שגיאות`;
      }
    }

    importMessage.textContent = resultMessage;
    setMessage(`${imported} רשומות נייובאו בהצלחה!`);

    // Reset file input and refresh
    document.querySelector("#excelFileInput").value = "";
    setTimeout(() => {
      progressContainer.style.display = "none";
      refresh().catch((error) => setMessage(error.message, true));
    }, 2000);
  } catch (error) {
    importMessage.textContent = `❌ שגיאה: ${error.message}`;
    progressFill.style.width = "0%";
    progressText.textContent = "0%";
    setMessage(error.message, true);
  } finally {
    uploadButton.disabled = false;
  }
}

document.querySelector("#uploadExcelButton").addEventListener("click", async () => {
  const fileInput = document.querySelector("#excelFileInput");
  const file = fileInput.files[0];

  if (!file) {
    setMessage("בחר קובץ Excel תחילה", true);
    return;
  }

  await handleExcelUpload(file);
});

document.querySelector("#excelFileInput").addEventListener("change", (event) => {
  if (event.target.files[0]) {
    // Auto-upload on file selection (optional - can remove if prefer manual click)
    // handleExcelUpload(event.target.files[0]);
  }
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
