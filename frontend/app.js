const API = "http://127.0.0.1:8000/compute";
const MAX_DIM = 10;

const state = {
  A: {
    rows: 3,
    cols: 3,
    data: [
      ["1", "0", "2"],
      ["2", "3", "5"],
      ["4", "0", "1"],
    ],
  },
  B: {
    rows: 3,
    cols: 3,
    data: [
      ["2", "0", "0"],
      ["0", "1", "0"],
      ["0", "0", "0"],
    ],
  },
  lastResult: null,
};

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function ensureRect(matrix) {
  matrix.rows = clampInt(Number(matrix.rows) || 1, 1, MAX_DIM);
  matrix.cols = clampInt(Number(matrix.cols) || 1, 1, MAX_DIM);

  matrix.data = (matrix.data || []).slice(0, matrix.rows).map((row) => (Array.isArray(row) ? row.slice(0, matrix.cols) : []));

  while (matrix.data.length < matrix.rows) {
    matrix.data.push(Array(matrix.cols).fill("0"));
  }

  for (let i = 0; i < matrix.rows; i += 1) {
    while (matrix.data[i].length < matrix.cols) {
      matrix.data[i].push("0");
    }
    matrix.data[i] = matrix.data[i].map((value) => {
      const text = String(value ?? "").trim();
      return text === "" ? "0" : text;
    });
  }
}

function matrixToText(data) {
  return data.map((row) => row.join("\t")).join("\n");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function operationLabel(op) {
  const labels = {
    add: "Сложение",
    mul: "Умножение",
    transpose: "Транспонирование",
    det: "Определитель",
    inv: "Обратная матрица",
  };
  return labels[op] || op;
}

function setMath(id, latex) {
  const node = document.getElementById(id);
  node.innerHTML = latex ? `$$${latex}$$` : "";
}

function setSteps(steps) {
  const ul = document.getElementById("steps");
  ul.innerHTML = "";
  for (const step of steps || []) {
    const li = document.createElement("li");
    li.innerHTML = step;
    ul.appendChild(li);
  }
}

function showError(message) {
  const box = document.getElementById("error");
  box.style.display = "block";
  box.textContent = message;
}

function clearError() {
  const box = document.getElementById("error");
  box.style.display = "none";
  box.textContent = "";
}

function updateExportState() {
  const disabled = !state.lastResult;
  document.getElementById("exportTxt").disabled = disabled;
  document.getElementById("exportPdf").disabled = disabled;

  const meta = document.getElementById("exportMeta");
  if (!state.lastResult) {
    meta.textContent = "Сначала выполните вычисление.";
    return;
  }

  const stepsCount = (state.lastResult.response.steps || []).length;
  const shape = state.lastResult.response.result_shape;
  const shapeText = Array.isArray(shape) ? `Размер результата: ${shape[0]}x${shape[1]}.` : "Скалярный результат.";
  meta.textContent = `${shapeText} Шагов: ${stepsCount}.`;
}

function clearComputedResult() {
  state.lastResult = null;
  setMath("srcLatex", "");
  setMath("calcLatex", "");
  setMath("resLatex", "");
  setSteps([]);
  updateExportState();
}

async function safeTypeset() {
  if (window.MathJax?.typesetPromise) {
    await window.MathJax.typesetPromise();
  }
}

function isUnary(op) {
  return op === "transpose" || op === "det" || op === "inv";
}

function renderGrid(name) {
  const grid = document.getElementById(`grid${name}`);
  const matrix = state[name];
  ensureRect(matrix);

  grid.innerHTML = "";
  grid.style.gridTemplateColumns = `repeat(${matrix.cols}, minmax(54px, 1fr))`;

  for (let i = 0; i < matrix.rows; i += 1) {
    for (let j = 0; j < matrix.cols; j += 1) {
      const input = document.createElement("input");
      input.className = "cell";
      input.value = matrix.data[i][j] ?? "0";
      input.dataset.m = name;
      input.dataset.i = String(i);
      input.dataset.j = String(j);

      input.addEventListener("input", (event) => {
        const { m, i: row, j: col } = event.target.dataset;
        const value = event.target.value.trim();
        state[m].data[Number(row)][Number(col)] = value === "" ? "0" : value;
        clearComputedResult();
        updateCompatibility();
      });

      input.addEventListener("blur", (event) => {
        if (event.target.value.trim() === "") {
          event.target.value = "0";
        }
      });

      input.addEventListener("keydown", (event) => {
        const row = Number(event.target.dataset.i);
        const col = Number(event.target.dataset.j);
        const rows = state[name].rows;
        const cols = state[name].cols;
        let nextRow = row;
        let nextCol = col;

        if (event.key === "Enter" || event.key === "ArrowDown") nextRow = Math.min(rows - 1, row + 1);
        if (event.key === "ArrowUp") nextRow = Math.max(0, row - 1);
        if (event.key === "ArrowRight") nextCol = Math.min(cols - 1, col + 1);
        if (event.key === "ArrowLeft") nextCol = Math.max(0, col - 1);

        if (nextRow !== row || nextCol !== col) {
          event.preventDefault();
          const next = grid.querySelector(`input[data-i="${nextRow}"][data-j="${nextCol}"]`);
          if (next) next.focus();
        }
      });

      grid.appendChild(input);
    }
  }

  document.getElementById(`size${name}`).textContent = `Размер: ${matrix.rows}x${matrix.cols}`;
  document.getElementById(`rowsValue${name}`).textContent = String(matrix.rows);
  document.getElementById(`colsValue${name}`).textContent = String(matrix.cols);
}

function resize(name, axis, delta) {
  const matrix = state[name];
  matrix[axis] = clampInt(matrix[axis] + delta, 1, MAX_DIM);
  ensureRect(matrix);
  renderGrid(name);
  clearComputedResult();
  updateCompatibility();
}

function getCompatibility(op, target) {
  const A = state.A;
  const B = state.B;
  const targetMatrix = target === "A" ? A : B;
  const cards = [
    { ok: true, label: "A", text: `${A.rows}x${A.cols}` },
    { ok: true, label: "B", text: `${B.rows}x${B.cols}` },
  ];

  if (op === "add") {
    const ok = A.rows === B.rows && A.cols === B.cols;
    cards.push({
      ok,
      label: "Проверка",
      text: ok
        ? `Сложение возможно. Размер результата: ${A.rows}x${A.cols}.`
        : `Для сложения нужны одинаковые размеры. Сейчас A=${A.rows}x${A.cols}, B=${B.rows}x${B.cols}.`,
    });
    return {
      ok,
      hint: "Сложение выполняется поэлементно: размеры A и B должны полностью совпадать.",
    cards,
    };
  }

  if (op === "mul") {
    const ok = A.cols === B.rows;
    cards.push({
      ok,
      label: "Проверка",
      text: ok
        ? `Умножение возможно. Размер результата: ${A.rows}x${B.cols}.`
        : `Для умножения нужно cols(A)=rows(B). Сейчас ${A.cols} != ${B.rows}.`,
    });
    return {
      ok,
      hint: "Умножение возможно только тогда, когда число столбцов A равно числу строк B.",
      cards,
    };
  }

  if (op === "transpose") {
    cards.push({
      ok: true,
      label: "Проверка",
      text: `Транспонирование ${target} всегда возможно. Размер результата: ${targetMatrix.cols}x${targetMatrix.rows}.`,
    });
    return {
      ok: true,
      hint: "При транспонировании строки и столбцы меняются местами.",
      cards,
    };
  }

  if (op === "det") {
    const ok = targetMatrix.rows === targetMatrix.cols;
    cards.push({
      ok,
      label: "Проверка",
      text: ok
        ? `det(${target}) можно вычислить: матрица квадратная ${targetMatrix.rows}x${targetMatrix.cols}.`
        : `det(${target}) требует квадратную матрицу. Сейчас ${target}=${targetMatrix.rows}x${targetMatrix.cols}.`,
    });
    return {
      ok,
      hint: "Определитель существует только для квадратной матрицы.",
      cards,
    };
  }

  if (op === "inv") {
    const square = targetMatrix.rows === targetMatrix.cols;
    cards.push({
      ok: square,
      label: "Проверка",
      text: square
        ? `${target} квадратная, базовая проверка пройдена. Далее сервер проверит, что det(${target}) != 0.`
        : `Для обратной матрицы ${target} должна быть квадратной. Сейчас ${target}=${targetMatrix.rows}x${targetMatrix.cols}.`,
    });
    return {
      ok: square,
      hint: "Обратимая матрица должна быть квадратной и невырожденной.",
      cards,
    };
  }

  return {
    ok: true,
    hint: "Проверьте выбранную операцию.",
    cards,
  };
}

function renderCompatibility(cards) {
  const box = document.getElementById("compatibility");
  box.innerHTML = cards
    .map(
      (card) => `
        <div class="compat-item ${card.ok ? "ok" : "bad"}">
          <span class="compat-label">${escapeHtml(card.label)}</span>
          <span class="compat-text">${escapeHtml(card.text)}</span>
        </div>
      `,
    )
    .join("");
}

function updateCompatibility() {
  const op = document.getElementById("op").value;
  const target = document.getElementById("target").value;
  const compatibility = getCompatibility(op, target);

  document.getElementById("hint").textContent = compatibility.hint;
  renderCompatibility(compatibility.cards);
  document.getElementById("eq").disabled = !compatibility.ok;
}

function syncTargetVisibility() {
  const op = document.getElementById("op").value;
  document.getElementById("targetWrap").style.display = isUnary(op) ? "flex" : "none";
}

function parseMatrixText(text) {
  const lines = String(text)
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    throw new Error("Файл пустой.");
  }

  const probe = lines.slice(0, 5).join("\n");
  let delimiter = "whitespace";
  if (probe.includes("\t")) delimiter = "\t";
  else if (probe.includes(";")) delimiter = ";";
  else if (probe.includes(",")) delimiter = ",";

  const rows = lines.map((line) => {
    if (delimiter === "whitespace") {
      return line.split(/\s+/).filter(Boolean);
    }
    return line.split(delimiter).map((value) => {
      const trimmed = value.trim();
      return trimmed === "" ? "0" : trimmed;
    });
  });

  const cols = rows[0]?.length || 0;
  if (!cols) {
    throw new Error("Не удалось определить столбцы в файле.");
  }
  if (rows.some((row) => row.length !== cols)) {
    throw new Error("Импорт невозможен: матрица должна быть прямоугольной.");
  }
  if (rows.length > MAX_DIM || cols > MAX_DIM) {
    throw new Error(`Импорт невозможен: лимит ${MAX_DIM}x${MAX_DIM}, а в файле ${rows.length}x${cols}.`);
  }

  return rows;
}

async function importMatrix(name, file) {
  try {
    clearError();
    const text = await file.text();
    const parsed = parseMatrixText(text);
    state[name].rows = parsed.length;
    state[name].cols = parsed[0].length;
    state[name].data = parsed;
    renderGrid(name);
    clearComputedResult();
    updateCompatibility();
  } catch (error) {
    showError(error.message || "Не удалось импортировать файл.");
  }
}

function stripStepHtml(html) {
  return String(html ?? "")
    .replace(/<div class='small'>/g, " - ")
    .replace(/<div class="small">/g, " - ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\$/g, "")
    .replace(/\\cdot/g, "*")
    .replace(/\\left/g, "")
    .replace(/\\right/g, "")
    .replace(/\\det/g, "det")
    .replace(/\\to/g, "->")
    .replace(/\\,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildReportText() {
  const result = state.lastResult;
  const response = result.response;
  const op = result.op;
  const target = result.target;
  const steps = (response.steps || []).map((step, index) => `${index + 1}. ${stripStepHtml(step)}`);

  return [
    "Matrixxx - отчет по вычислению",
    `Операция: ${operationLabel(op)}`,
    isUnary(op) ? `Матрица: ${target}` : "Матрицы: A и B",
    `A (${state.A.rows}x${state.A.cols}):`,
    matrixToText(state.A.data),
    "",
    `B (${state.B.rows}x${state.B.cols}):`,
    matrixToText(state.B.data),
    "",
    `Выражение: ${response.source_text || "-"}`,
    `Результат: ${response.result_text || "-"}`,
    "",
    "Шаги:",
    ...(steps.length ? steps : ["Шагов нет."]),
  ].join("\n");
}

function buildReportHtml() {
  const result = state.lastResult;
  const response = result.response;
  const op = result.op;
  const target = result.target;
  const steps = (response.steps || []).map((step) => `<li>${escapeHtml(stripStepHtml(step))}</li>`).join("");

  return `
    <div class="export-title">Matrixxx - отчет по вычислению</div>
    <div class="export-subtitle">Операция: ${escapeHtml(operationLabel(op))}</div>
    <div class="export-subtitle">${escapeHtml(isUnary(op) ? `Матрица: ${target}` : "Матрицы: A и B")}</div>

    <div class="export-section">
      <div class="export-heading">Матрица A (${state.A.rows}x${state.A.cols})</div>
      <pre>${escapeHtml(matrixToText(state.A.data))}</pre>
    </div>

    <div class="export-section">
      <div class="export-heading">Матрица B (${state.B.rows}x${state.B.cols})</div>
      <pre>${escapeHtml(matrixToText(state.B.data))}</pre>
    </div>

    <div class="export-section">
      <div class="export-heading">Выражение</div>
      <pre>${escapeHtml(response.source_text || "-")}</pre>
    </div>

    <div class="export-section">
      <div class="export-heading">Результат</div>
      <pre>${escapeHtml(response.result_text || "-")}</pre>
    </div>

    <div class="export-section">
      <div class="export-heading">Шаги</div>
      <ol>${steps || "<li>Шагов нет.</li>"}</ol>
    </div>
  `;
}

function downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportTxt() {
  if (!state.lastResult) return;
  downloadBlob(buildReportText(), "text/plain;charset=utf-8", `matrixxx-${state.lastResult.op}.txt`);
}

async function exportPdf() {
  if (!state.lastResult) return;
  if (!window.html2canvas || !window.jspdf?.jsPDF) {
    showError("Не удалось загрузить библиотеки для PDF-экспорта.");
    return;
  }

  clearError();
  const host = document.createElement("div");
  host.className = "export-sheet";
  host.innerHTML = buildReportHtml();
  document.body.appendChild(host);

  try {
    const canvas = await window.html2canvas(host, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const imageData = canvas.toDataURL("image/png");
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");
    const margin = 10;
    const pageWidth = pdf.internal.pageSize.getWidth() - margin * 2;
    const pageHeight = pdf.internal.pageSize.getHeight() - margin * 2;
    const imageHeight = (canvas.height * pageWidth) / canvas.width;

    let heightLeft = imageHeight;
    let position = margin;

    pdf.addImage(imageData, "PNG", margin, position, pageWidth, imageHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = margin - (imageHeight - heightLeft);
      pdf.addPage();
      pdf.addImage(imageData, "PNG", margin, position, pageWidth, imageHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`matrixxx-${state.lastResult.op}.pdf`);
  } catch (error) {
    showError(error.message || "Не удалось экспортировать PDF.");
  } finally {
    host.remove();
  }
}

async function compute() {
  clearError();
  const op = document.getElementById("op").value;
  const target = document.getElementById("target").value;
  const compatibility = getCompatibility(op, target);

  if (!compatibility.ok) {
    showError(compatibility.cards[compatibility.cards.length - 1].text);
    return;
  }

  try {
    const response = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        A: state.A.data,
        B: state.B.data,
        op,
        target,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      showError(data.detail || "Ошибка вычисления.");
      return;
    }

    setMath("srcLatex", data.source_latex || "");
    setMath("calcLatex", data.calc_latex || "");
    setSteps(data.steps || []);
    setMath("resLatex", data.result_latex || "");

    state.lastResult = { op, target, response: data };
    updateExportState();
    await safeTypeset();
  } catch (error) {
    showError(`Не удалось связаться с сервером: ${error.message}`);
  }
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-m][data-axis][data-act]");
  if (!button) return;
  const { m, axis, act } = button.dataset;
  resize(m, axis, act === "plus" ? 1 : -1);
});

document.querySelectorAll("input[data-import]").forEach((input) => {
  input.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    const target = event.target.dataset.import;
    if (file && target) {
      await importMatrix(target, file);
    }
    event.target.value = "";
  });
});

document.getElementById("eq").addEventListener("click", compute);
document.getElementById("exportTxt").addEventListener("click", exportTxt);
document.getElementById("exportPdf").addEventListener("click", exportPdf);

document.getElementById("op").addEventListener("change", () => {
  syncTargetVisibility();
  clearComputedResult();
  updateCompatibility();
});

document.getElementById("target").addEventListener("change", () => {
  clearComputedResult();
  updateCompatibility();
});

document.getElementById("toggleSteps").addEventListener("click", () => {
  const block = document.getElementById("stepsBlock");
  const button = document.getElementById("toggleSteps");
  const hidden = block.classList.toggle("hiddenSteps");
  button.textContent = hidden ? "Показать шаги" : "Скрыть шаги";
});

["A", "B"].forEach(renderGrid);
syncTargetVisibility();
clearComputedResult();
updateCompatibility();
