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
  charts: {},
  filterMonth: "",
  lastSummary: null
};

const PAGE_SIZE = 25;
let currentPage = 1;

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
  recordCount: document.querySelector("#recordCount"),
  monthFilter: document.querySelector("#monthFilter"),
  clearFilter: document.querySelector("#clearFilter")
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

function filteredRecords() {
  if (!state.filterMonth) return state.records;
  return state.records.filter((r) => r.date && r.date.startsWith(state.filterMonth));
}

function renderRows() {
  const config = currentConfig();
  const visible = filteredRecords();
  const total = visible.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRecords = visible.slice(start, start + PAGE_SIZE);

  els.recordsBody.innerHTML = "";
  els.emptyState.classList.toggle("visible", total === 0);
  els.recordCount.textContent = state.filterMonth
    ? `${total} מתוך ${state.records.length} ${config.plural}`
    : `${total} ${config.plural}`;

  pageRecords.forEach((record) => {
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

  renderPagination(total);
}

function renderPagination(total) {
  const pagination = document.querySelector("#pagination");
  if (!pagination) return;

  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) {
    pagination.innerHTML = "";
    return;
  }

  pagination.innerHTML = `
    <button class="page-btn" id="prevPage" ${currentPage <= 1 ? "disabled" : ""}>›</button>
    <span>עמוד ${currentPage} מתוך ${totalPages}</span>
    <button class="page-btn" id="nextPage" ${currentPage >= totalPages ? "disabled" : ""}>‹</button>
  `;

  pagination.querySelector("#prevPage").addEventListener("click", () => {
    currentPage--;
    renderRows();
  });
  pagination.querySelector("#nextPage").addEventListener("click", () => {
    currentPage++;
    renderRows();
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

function updateSummaryForFilter() {
  const config = currentConfig();
  if (!state.lastSummary) return;

  if (!state.filterMonth) {
    els.allTotal.textContent = formatMoney(state.lastSummary.totals.total);
    els.allMetricLabel.textContent = `סה״כ ${config.plural}`;
    return;
  }

  const filteredTotal = filteredRecords().reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const [year, month] = state.filterMonth.split("-");
  const monthLabel = new Date(Number(year), Number(month) - 1, 1)
    .toLocaleDateString("he-IL", { month: "long", year: "numeric" });

  els.allTotal.textContent = formatMoney(filteredTotal);
  els.allMetricLabel.textContent = monthLabel;
}

function renderSummary(summary) {
  state.lastSummary = summary;
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
  currentPage = 1;
  renderRows();
  renderSummary(summary);
}

async function switchPage(page) {
  if (!pageConfig[page] || state.activePage === page) return;
  state.activePage = page;
  state.filterMonth = "";
  els.monthFilter.value = "";
  els.clearFilter.classList.add("hidden");
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

function extractField(row, ...keys) {
  for (const key of keys) {
    const val = row[key];
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      return val;
    }
  }
  return "";
}

function parseIsraeliDate(val) {
  if (!val && val !== 0) return "";
  if (typeof val === "number" && val > 40000 && val < 60000) {
    const d = new Date(Math.round((val - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${year}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return s.slice(0, 10);
}

function parseAmount(val) {
  if (!val && val !== 0) return 0;
  const s = String(val).replace(/[,\s₪"']/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.abs(n);
}

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
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array" });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error("הקובץ לא מכיל דפים");
    }

    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

    // Scan first 25 rows to find the actual header row (Israeli bank files have preamble rows)
    const DATE_HINTS = ["date", "תאריך", "תאריך עסקה", "תאריך רכישה", "תאריך חיוב", "תאריך ערך"];
    const AMOUNT_HINTS = ["amount", "סכום", "סכום עסקה", "סכום חיוב", "חיוב", "סכום חיוב בשח"];
    const rawRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });

    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(rawRows.length, 25); i++) {
      const cells = rawRows[i].map((c) => String(c).trim().toLowerCase());
      const hasDate = DATE_HINTS.some((h) => cells.includes(h.toLowerCase()));
      const hasAmount = AMOUNT_HINTS.some((h) => cells.includes(h.toLowerCase()));
      if (hasDate || hasAmount) {
        headerRowIndex = i;
        break;
      }
    }

    const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "", range: headerRowIndex });

    if (rows.length === 0) {
      throw new Error("הקובץ ריק - לא נמצאו רשומות");
    }

    const allRecords = rows.map((row) => ({
      date: parseIsraeliDate(extractField(row,
        "date", "Date", "תאריך", "תאריך עסקה", "תאריך רכישה", "תאריך חיוב", "תאריך ערך", "תאריך פעולה"
      )),
      amount: parseAmount(extractField(row,
        "amount", "Amount", "סכום", "סכום עסקה", "סכום חיוב", "סכום חיוב בש''ח", "סכום חיוב בשח",
        "חיוב", "סכום בש''ח", "סכום בשח", "original_amount", "סכום מקורי", "סכום ₪", "סכום הוצאה"
      )),
      category: String(extractField(row,
        "category", "Category", "קטגוריה", "ענף", "סוג עסקה", "תחום"
      )).trim() || "אחר",
      description: String(extractField(row,
        "description", "Description", "תיאור", "שם בית עסק", "שם בית העסק", "שם עסק",
        "מוטב", "פרטים", "merchant_name", "שם המוטב", "בית עסק", "שם"
      )).trim(),
      paymentMethod: String(extractField(row,
        "paymentMethod", "payment_method", "PaymentMethod", "אמצעי תשלום",
        "כרטיס", "סוג כרטיס", "סוג אשראי", "אמצעי"
      )).trim() || "אשראי"
    }));

    const records = allRecords.filter((r) => r.date && r.amount > 0);

    if (records.length === 0) {
      const sampleKeys = Object.keys(rows[0] || {}).slice(0, 8).join(", ");
      throw new Error(`לא נמצאו שורות תקינות. כותרות שזוהו: ${sampleKeys}`);
    }

    const skipped = allRecords.length - records.length;
    importMessage.textContent = `נמצאו ${records.length} שורות תקינות${skipped ? ` (${skipped} דולגו - ללא תאריך/סכום)` : ""}. שולח לשרת...`;

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

els.monthFilter.addEventListener("change", () => {
  state.filterMonth = els.monthFilter.value;
  els.clearFilter.classList.toggle("hidden", !state.filterMonth);
  currentPage = 1;
  renderRows();
  updateSummaryForFilter();
});

els.clearFilter.addEventListener("click", () => {
  state.filterMonth = "";
  els.monthFilter.value = "";
  els.clearFilter.classList.add("hidden");
  currentPage = 1;
  renderRows();
  updateSummaryForFilter();
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
