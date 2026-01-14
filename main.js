/* main.js: UI 구성 + Worker 호출 + 결과 렌더 */

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

function buildRowUI(container, i) {
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.style.padding = "12px";
  wrap.style.marginBottom = "12px";

  const header = document.createElement("div");
  header.style.display = "grid";
  header.style.gridTemplateColumns = "1fr auto";
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

  wrap.appendChild(header);

  // 목표 옵션 5개
  const targetsField = document.createElement("div");
  targetsField.className = "field";
  const targetsTitle = document.createElement("span");
  targetsTitle.textContent = "목표 옵션 (5개)  —  ※ 초기잠금 체크 시: 첫번째 옵션을 잠금값(현재값)으로 사용";
  targetsField.appendChild(targetsTitle);

  const targetsGrid = document.createElement("div");
  targetsGrid.className = "targetsGrid";

  const targetSelects = [];
  for (let k = 0; k < 5; k++) {
    const sel = makeSelect(0);
    sel.id = `t${i}_${k}`;
    targetSelects.push(sel);
    targetsGrid.appendChild(sel);
  }
  targetsField.appendChild(targetsGrid);
  wrap.appendChild(targetsField);

  // 잠금 체크 시: 첫번째만 활성화(잠금값으로 쓰이기 때문), 나머지는 비활성
  const sync = () => {
    const isLocked = lock.checked;
    targetSelects[0].disabled = false;
    for (let k = 1; k < 5; k++) targetSelects[k].disabled = isLocked;
  };
  lock.addEventListener("change", sync);
  sync();

  container.appendChild(wrap);

  return { lock, targetSelects };
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
  const targets = ui.rows.map(r => r.targetSelects.map(s => Number(s.value)));

  // ✅ 잠금값은 사용자 입력 UI가 아니라 "첫번째 목표 옵션"을 사용
  const lockValues = targets.map((arr5, i) => locks[i] ? (arr5[0] | 0) : 0);

  const n = Math.max(1, Number(ui.n.value || 1));
  const maxModule = Math.max(1, Number(ui.maxModule.value || 2000));

  const seedRaw = ui.seed.value.trim();
  const seed = seedRaw === "" ? null : Number(seedRaw);

  return {
    locks,
    lockValues,  // [3]  (locks=true면 targets[i][0])
    targets,     // [[5],[5],[5]]
    limits: ui.li
