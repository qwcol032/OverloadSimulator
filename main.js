/* main.js: UI 구성 + Worker 호출 + 결과 렌더 */

const OPTION_ITEMS = [
  { v: 0, label: "(비움 0)" },
  { v: 1, label: "A (1)" },
  { v: 2, label: "B (2)" },
  { v: 3, label: "C (3)" },
  { v: 4, label: "D (4)" },
  { v: 5, label: "E (5)" },
  { v: 6, label: "F (6)" },
  { v: 7, label: "G (7)" },
  { v: 8, label: "H (8)" },
  { v: 9, label: "I (9)" },
];

function makeSelect(defaultValue = 0) {
  const sel = document.createElement("select");
  for (const it of OPTION_ITEMS) {
    const opt = document.createElement("option");
    opt.value = String(it.v);
    opt.textContent = it.label;
    if (it.v === defaultValue) opt.selected = true;
    sel.appendChild(opt);
  }
  return sel;
}

function rowTitle(i) {
  return `${i + 1}줄`;
}

function buildRowUI(container, i) {
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.style.padding = "12px";
  wrap.style.marginBottom = "12px";

  const header = document.createElement("div");
  header.style.display = "grid";
  header.style.gridTemplateColumns = "1fr 1fr";
  header.style.gap = "10px";
  header.style.alignItems = "center";

  const title = document.createElement("div");
  title.innerHTML = `<b>${rowTitle(i)}</b> <span class="muted small">(잠금 토글/잠금값/목표옵션 5개)</span>`;
  header.appendChild(title);

  const lockLabel = document.createElement("label");
  lockLabel.className = "check";
  const lock = document.createElement("input");
  lock.type = "checkbox";
  lock.id = `lock${i}`;
  const lockText = document.createElement("span");
  lockText.textContent = "초기 잠금";
  lockLabel.appendChild(lock);
  lockLabel.appendChild(lockText);
  header.appendChild(lockLabel);

  wrap.appendChild(header);

  const row2 = document.createElement("div");
  row2.className = "row2";

  // 잠금값
  const lockValField = document.createElement("label");
  lockValField.className = "field";
  const lockValTitle = document.createElement("span");
  lockValTitle.textContent = "잠금값(현재값)";
  const lockVal = makeSelect(0);
  lockVal.id = `lockVal${i}`;
  lockValField.appendChild(lockValTitle);
  lockValField.appendChild(lockVal);

  // 목표옵션 5개
  const targetsField = document.createElement("div");
  targetsField.className = "field";
  const targetsTitle = document.createElement("span");
  targetsTitle.textContent = "목표 옵션(최대 5개, 중복 선택 가능)";
  targetsField.appendChild(targetsTitle);

  const targetsGrid = document.createElement("div");
  targetsGrid.style.display = "grid";
  targetsGrid.style.gridTemplateColumns = "repeat(5, 1fr)";
  targetsGrid.style.gap = "8px";

  const targetSelects = [];
  for (let k = 0; k < 5; k++) {
    const sel = makeSelect(0);
    sel.id = `t${i}_${k}`;
    targetSelects.push(sel);
    targetsGrid.appendChild(sel);
  }
  targetsField.appendChild(targetsGrid);

  row2.appendChild(lockValField);
  row2.appendChild(targetsField);
  wrap.appendChild(row2);

  // 잠금 체크 시: 목표옵션 비활성 / 잠금값 활성
  const sync = () => {
    const isLocked = lock.checked;
    lockVal.disabled = !isLocked;
    for (const sel of targetSelects) sel.disabled = isLocked; // Unity처럼: 잠금이면 해당 줄 목표는 의미 없게 취급
  };
  lock.addEventListener("change", sync);
  sync();

  container.appendChild(wrap);

  return { lock, lockVal, targetSelects };
}

const ui = {
  rows: [],
  dupMode: document.getElementById("dupMode"),
  customMode: document.getElementById("customMode"),
  limits: [
    document.getElementById("limit0"),
    document.getElementById("limit1"),
    document.getElementById("limit2"),
    document.getElementById("limit3"),
  ],
  n: document.getElementById("n"),
  maxModule: document.getElementById("maxModule"),
  seed: document.getElementById("seed"),
  runBtn: document.getElementById("runBtn"),
  stopBtn: document.getElementById("stopBtn"),
  statusText: document.getElementById("statusText"),
  progress: document.getElementById("progress"),
  errorBox: document.getElementById("errorBox"),
  avgModule: document.getElementById("avgModule"),
  avgReroll: document.getElementById("avgReroll"),
  avgCustom: document.getElementById("avgCustom"),
  canvas: document.getElementById("histCanvas"),
};

(function initUI() {
  const rowsContainer = document.getElementById("rows");
  for (let i = 0; i < 3; i++) ui.rows.push(buildRowUI(rowsContainer, i));
})();

function showError(msg) {
  ui.errorBox.textContent = msg;
  ui.errorBox.classList.remove("hidden");
}

function clearError() {
  ui.errorBox.textContent = "";
  ui.errorBox.classList.add("hidden");
}

function readConfig() {
  const locks = ui.rows.map(r => r.lock.checked);
  const lockVals = ui.rows.map(r => Number(r.lockVal.value));

  const targets = ui.rows.map(r => r.targetSelects.map(s => Number(s.value)));

  const n = Math.max(1, Number(ui.n.value || 1));
  const maxModule = Math.max(1, Number(ui.maxModule.value || 2000));

  const seedRaw = ui.seed.value.trim();
  const seed = seedRaw === "" ? null : Number(seedRaw);

  return {
    locks,
    lockVals,
    targets,     // [[5],[5],[5]]
    limits: ui.limits.map(x => x.checked),
    dupMode: ui.dupMode.checked,
    customMode: ui.customMode.checked,
    n,
    maxModule,
    seed,
  };
}

function drawHistogram(canvas, hist) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // last non-zero
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < hist.length; i++) {
    const v = hist[i];
    if (v > 0) maxX = i;
    if (v > maxY) maxY = v;
  }
  if (maxY === 0) {
    ctx.fillText("데이터 없음", 20, 30);
    return;
  }

  const padL = 46, padR = 14, padT = 14, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // axes
  ctx.strokeStyle = "rgba(154,167,189,.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  // bars
  const bins = Math.max(1, maxX + 1);
  const barW = plotW / bins;

  ctx.fillStyle = "rgba(90,166,255,.75)";
  for (let x = 0; x <= maxX; x++) {
    const count = hist[x];
    if (!count) continue;
    const h = (count / maxY) * plotH;
    const px = padL + x * barW;
    const py = padT + plotH - h;
    ctx.fillRect(px, py, Math.max(1, barW), h);
  }

  // labels
  ctx.fillStyle = "rgba(233,238,247,.85)";
  ctx.font = "12px system-ui";
  ctx.fillText(`0`, padL - 18, padT + plotH + 12);
  ctx.fillText(`${maxX}`, padL + plotW - 26, padT + plotH + 12);
  ctx.fillText(`${maxY}`, 6, padT + 12);
}

let worker = null;

function setRunning(running) {
  ui.runBtn.disabled = running;
  ui.stopBtn.disabled = !running;
}

function setStatus(text, pct = null) {
  ui.statusText.textContent = text;
  if (pct == null) return;
  ui.progress.value = Math.max(0, Math.min(100, pct));
}

ui.runBtn.addEventListener("click", () => {
  clearError();

  const config = readConfig();

  // Worker 재시작
  if (worker) worker.terminate();
  worker = new Worker("./sim.worker.js");

  setRunning(true);
  setStatus("시뮬 준비 중...", 0);

  worker.onmessage = (e) => {
    const msg = e.data;

    if (msg.type === "progress") {
      const pct = Math.floor((msg.done / msg.total) * 100);
      setStatus(`진행 중... (${msg.done}/${msg.total})`, pct);
      return;
    }

    if (msg.type === "error") {
      setRunning(false);
      setStatus("오류로 중단", 0);
      showError(msg.message);
      return;
    }

    if (msg.type === "result") {
      setRunning(false);
      setStatus("완료", 100);

      const { n, totalModule, totalReroll, totalCustom, hist } = msg;

      ui.avgModule.textContent = (totalModule / n).toFixed(3);
      ui.avgReroll.textContent = (totalReroll / n).toFixed(3);
      ui.avgCustom.textContent = (totalCustom / n).toFixed(3);

      drawHistogram(ui.canvas, hist);
      return;
    }
  };

  worker.onerror = (err) => {
    setRunning(false);
    setStatus("Worker 오류", 0);
    showError(String(err.message || err));
  };

  worker.postMessage({ type: "run", config });
});

ui.stopBtn.addEventListener("click", () => {
  if (worker) worker.terminate();
  worker = null;
  setRunning(false);
  setStatus("사용자 중지", 0);
});
