/* main.js
   - 줄 초기화 버튼
   - 0이 아닌 옵션 강조
   - 잠금 체크 시 2~5번째 옵션 자동 0 초기화
   - ✅ 난수 시드 입력 제거(항상 랜덤)
   - ✅ 전체 초기화 버튼 추가(줄/잠금/dup/custom/limits 모두 초기화)
   - 성공 예시 5개 렌더
*/

const OPTION_ITEMS = [
  { v: 0, label: "효과 없음 (0)" },
  { v: 1, label: "우월코드 데미지 증가 (1)" },
  { v: 2, label: "명중률 증가 (2)" },
  { v: 3, label: "최대 장탄 수 증가 (3)" },
  { v: 4, label: "공격력 증가 (4)" },
  { v: 5, label: "차지 데미지 증가 (5)" },
  { v: 6, label: "차지 속도 증가 (6)" },
  { v: 7, label: "크리티컬 피해량 증가 (7)" },
  { v: 8, label: "크리티컬 확률 증가 (8)" },
  { v: 9, label: "방어력 증가 (9)" },
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

/* ===== 선택 강조 관련 ===== */
function updateSelectHighlight(sel) {
  const v = Number(sel.value);
  if (v !== 0) sel.classList.add("optSelected");
  else sel.classList.remove("optSelected");
}

function updateRowHighlight(rowEl, selects) {
  const anySelected = selects.some((s) => Number(s.value) !== 0);
  if (anySelected) rowEl.classList.add("rowHasSelection");
  else rowEl.classList.remove("rowHasSelection");
}

/* ===== Row UI 생성 ===== */
function buildRowUI(container, i) {
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.style.padding = "12px";
  wrap.style.marginBottom = "12px";

  const header = document.createElement("div");
  header.style.display = "grid";
  header.style.gridTemplateColumns = "1fr auto auto";
  header.style.gap = "10px";
  header.style.alignItems = "center";

  const title = document.createElement("div");
  title.innerHTML = `<b>${rowTitle(i)}</b> <span class="muted small">(목표옵션 5개 / 초기잠금 시 첫번째 옵션 고정)</span>`;
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

  // 줄 초기화 버튼
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "danger smallBtn";
  resetBtn.textContent = "초기화";
  header.appendChild(resetBtn);

  wrap.appendChild(header);

  // 목표 옵션 5개
  const targetsField = document.createElement("div");
  targetsField.className = "field";
  const targetsTitle = document.createElement("span");
  targetsTitle.textContent =
    "목표 옵션 (5개)  —  ※ 초기잠금 체크 시: 첫번째 옵션을 잠금값(현재값)으로 사용";
  targetsField.appendChild(targetsTitle);

  const targetsGrid = document.createElement("div");
  targetsGrid.className = "targetsGrid";

  const targetSelects = [];

  for (let k = 0; k < 5; k++) {
    const sel = makeSelect(0);
    sel.id = `t${i}_${k}`;

    // 값 바뀔 때마다 강조 업데이트
    sel.addEventListener("change", () => {
      updateSelectHighlight(sel);
      updateRowHighlight(wrap, targetSelects);
    });

    targetSelects.push(sel);
    targetsGrid.appendChild(sel);
  }

  targetsField.appendChild(targetsGrid);
  wrap.appendChild(targetsField);

  // ✅ 잠금 체크 규칙
  // - 잠금 ON이면 2~5번째 옵션을 0으로 초기화 후 비활성화
  // - 첫번째는 항상 활성
  const applyLockRule = () => {
    const isLocked = lock.checked;

    if (isLocked) {
      for (let k = 1; k < 5; k++) {
        targetSelects[k].value = "0";
        updateSelectHighlight(targetSelects[k]);
      }
    }

    targetSelects[0].disabled = false;
    for (let k = 1; k < 5; k++) targetSelects[k].disabled = isLocked;

    updateRowHighlight(wrap, targetSelects);
  };

  lock.addEventListener("change", applyLockRule);

  // ✅ 줄 초기화 동작
  const resetRow = () => {
    lock.checked = false;
    for (const sel of targetSelects) {
      sel.value = "0";
      sel.disabled = false;
      updateSelectHighlight(sel);
    }
    applyLockRule();
  };

  resetBtn.addEventListener("click", resetRow);

  // 초기 상태 반영
  applyLockRule();
  for (const sel of targetSelects) updateSelectHighlight(sel);
  updateRowHighlight(wrap, targetSelects);

  container.appendChild(wrap);
  return { lock, targetSelects, wrap, resetRow };
}

/* ===== UI 레퍼런스 ===== */
const ui = {
  rows: [],
  resetAllBtn: document.getElementById("resetAllBtn"),
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
  runBtn: document.getElementById("runBtn"),
  stopBtn: document.getElementById("stopBtn"),
  statusText: document.getElementById("statusText"),
  progress: document.getElementById("progress"),
  errorBox: document.getElementById("errorBox"),
  avgModule: document.getElementById("avgModule"),
  avgReroll: document.getElementById("avgReroll"),
  avgCustom: document.getElementById("avgCustom"),
  canvas: document.getElementById("histCanvas"),
  examplesBox: document.getElementById("examples"),
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

/* ===== 결과/예시 렌더 ===== */
function optionLabel(v) {
  const found = OPTION_ITEMS.find((x) => x.v === v);
  return found ? found.label : String(v);
}

function renderExamples(examples) {
  if (!ui.examplesBox) return;
  ui.examplesBox.innerHTML = "";

  if (!examples || examples.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted small";
    empty.textContent = "표시할 예시가 없습니다.";
    ui.examplesBox.appendChild(empty);
    return;
  }

  examples.forEach((ex, idx) => {
    const card = document.createElement("div");
    card.className = "exCard";

    const top = document.createElement("div");
    top.className = "exTop";

    const badge = document.createElement("div");
    badge.className = "exBadge";
    badge.textContent = `예시 #${idx + 1}`;

    const meta = document.createElement("div");
    meta.className = "exMeta";
    meta.textContent = `모듈 ${ex.module} / 리롤 ${ex.rerollCnt} / 커스텀키 ${ex.customKey}`;

    top.appendChild(badge);
    top.appendChild(meta);

    const rows = document.createElement("div");
    rows.className = "exRows";

    for (let i = 0; i < 3; i++) {
      const row = document.createElement("div");
      row.className = "exRow";

      const t = document.createElement("div");
      t.className = "t";
      t.textContent = `${i + 1}줄 ${ex.locks[i] ? "(잠금)" : ""}`;

      const v = document.createElement("div");
      v.className = "v";
      v.textContent = optionLabel(ex.options[i]);

      row.appendChild(t);
      row.appendChild(v);
      rows.appendChild(row);
    }

    card.appendChild(top);
    card.appendChild(rows);
    ui.examplesBox.appendChild(card);
  });
}

function readConfig() {
  const locks = ui.rows.map((r) => r.lock.checked);
  const targets = ui.rows.map((r) => r.targetSelects.map((s) => Number(s.value)));

  // 잠금값은 "첫번째 목표 옵션"을 사용
  const lockValues = targets.map((arr5, i) => (locks[i] ? (arr5[0] | 0) : 0));

  const n = Math.max(1, Number(ui.n.value || 1));
  const maxModule = Math.max(1, Number(ui.maxModule.value || 2000));

  return {
    locks,
    lockValues,
    targets,
    limits: ui.limits.map((x) => x.checked),
    dupMode: ui.dupMode.checked,
    customMode: ui.customMode.checked,
    n,
    maxModule,
    // ✅ seed를 보내지 않음(Worker는 seed==null/undefined면 항상 랜덤)
  };
}

/* ===== 히스토그램 ===== */
function drawHistogram(canvas, hist) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < hist.length; i++) {
    const v = hist[i];
    if (v > 0) maxX = i;
    if (v > maxY) maxY = v;
  }
  if (maxY === 0) {
    ctx.fillStyle = "rgba(233,238,247,.85)";
    ctx.font = "12px system-ui";
    ctx.fillText("데이터 없음", 20, 30);
    return;
  }

  const padL = 46, padR = 14, padT = 14, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  ctx.strokeStyle = "rgba(154,167,189,.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

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

  ctx.fillStyle = "rgba(233,238,247,.85)";
  ctx.font = "12px system-ui";
  ctx.fillText(`0`, padL - 18, padT + plotH + 12);
  ctx.fillText(`${maxX}`, padL + plotW - 26, padT + plotH + 12);
  ctx.fillText(`${maxY}`, 6, padT + 12);
}

/* ===== Worker 연결 ===== */
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

function stopWorkerIfAny() {
  if (worker) worker.terminate();
  worker = null;
  setRunning(false);
}

ui.runBtn.addEventListener("click", () => {
  clearError();
  const config = readConfig();

  stopWorkerIfAny();
  // ✅ 너가 이미 적용한 캐시 무시 파라미터 유지
  worker = new Worker("./sim.worker.js?v=fix2");

  setRunning(true);
  setStatus("시뮬 준비 중...", 0);
  renderExamples([]);

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

      const { n, totalModule, totalReroll, totalCustom, hist, examples } = msg;

      ui.avgModule.textContent = (totalModule / n).toFixed(3);
      ui.avgReroll.textContent = (totalReroll / n).toFixed(3);
      ui.avgCustom.textContent = (totalCustom / n).toFixed(3);

      drawHistogram(ui.canvas, hist);
      renderExamples(examples);
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
  stopWorkerIfAny();
  setStatus("사용자 중지", 0);
});

/* ===== ✅ 전체 초기화 버튼 ===== */
ui.resetAllBtn?.addEventListener("click", () => {
  // 실행 중이면 중지
  stopWorkerIfAny();

  // 줄 전체 초기화
  ui.rows.forEach(r => r.resetRow());

  // 상단 토글 초기화
  ui.dupMode.checked = false;
  ui.customMode.checked = false;
  ui.limits.forEach(l => (l.checked = false));

  // 상태/출력 초기화
  clearError();
  ui.avgModule.textContent = "-";
  ui.avgReroll.textContent = "-";
  ui.avgCustom.textContent = "-";
  renderExamples([]);
  setStatus("대기 중", 0);

  // 캔버스 비우기
  const ctx = ui.canvas.getContext("2d");
  ctx.clearRect(0, 0, ui.canvas.width, ui.canvas.height);
});
