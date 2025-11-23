// ---------------------- 상수/테이블 ----------------------
const Grade = { R: "R", SR: "SR" };
const KitType = { A: 0, B: 1, C: 2 };
const KitKey = ["a", "b", "c"];

const r_level_up = 1000;
const sr_level_up = 3000;
const big_success_step = 5;
const kit_exp = { [KitType.A]: 200, [KitType.B]: 500, [KitType.C]: 1000 };

const r_big_success = [
  [0.176, 0.55, 1],
  [0.208, 0.65, 1],
  [0.24, 0.75, 1],
  [0.272, 0.85, 1],
  [0.4, 1.0, 1],
  [0.16, 0.5, 1],
  [0.192, 0.6, 1],
  [0.224, 0.7, 1],
  [0.272, 0.85, 1],
  [0.4, 1.0, 1],
  [0.144, 0.45, 1],
  [0.176, 0.55, 1],
  [0.224, 0.7, 1],
  [0.272, 0.85, 1],
  [0.4, 1.0, 1]
];
const sr_big_success = [
  [0.036, 0.11, 0.25],
  [0.059, 0.198, 0.4],
  [0.078, 0.287, 0.55],
  [0.113, 0.413, 0.75],
  [0.15, 0.55, 1.0],
  [0.022, 0.08, 0.2],
  [0.033, 0.12, 0.3],
  [0.049, 0.18, 0.45],
  [0.076, 0.28, 0.7],
  [0.125, 0.5, 1.0],
  [0.012, 0.054, 0.15],
  [0.022, 0.099, 0.275],
  [0.031, 0.144, 0.4],
  [0.047, 0.216, 0.6],
  [0.1, 0.45, 1.0]
];

// ---------------------- 유틸 함수 ----------------------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const unitExp = (grade) => (grade === Grade.R ? r_level_up : sr_level_up);
const levelFromTotalExp = (total, grade) =>
  clamp(Math.floor(total / unitExp(grade)), 0, 15);
const residualExpInLevel = (total, grade) =>
  total - levelFromTotalExp(total, grade) * unitExp(grade);
const nextBigSuccessTargetLevel = (curr) =>
  clamp((Math.floor(curr / big_success_step) + 1) * big_success_step, 0, 15);
const bigSuccessProb = (grade, level, kit) =>
  (grade === Grade.R ? r_big_success : sr_big_success)[clamp(level, 0, 14)][
    kit
  ];
const mulberry32 = (seed) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

// ---------------------- 상태 및 순수 시도 ----------------------
function attemptLevelUp(prevState, kit, rng) {
  let grade = prevState.grade;
  let total = prevState.totalExp;

  if (grade === Grade.SR && levelFromTotalExp(total, Grade.SR) >= 15) {
    const lvl = levelFromTotalExp(total, Grade.SR);
    return {
      bigSuccess: false,
      state: { grade, totalExp: total },
      level: lvl,
      exp: residualExpInLevel(total, Grade.SR)
    };
  }

  const lvlBefore = levelFromTotalExp(total, grade);
  const p = bigSuccessProb(grade, lvlBefore, kit);
  let big = false;
  if ((rng || Math.random)() < p) {
    big = true;
    const target = nextBigSuccessTargetLevel(lvlBefore);
    total = target * unitExp(grade);
  } else {
    const cap = 15 * unitExp(grade);
    total = clamp(total + kit_exp[kit], 0, cap);
  }

  if (grade === Grade.R && levelFromTotalExp(total, Grade.R) >= 15) {
    grade = Grade.SR; // 경험치 그대로 유지
  }

  const newState = { grade, totalExp: total };
  const lvl = levelFromTotalExp(newState.totalExp, newState.grade);
  const exp = residualExpInLevel(newState.totalExp, newState.grade);
  return { bigSuccess: big, state: newState, level: lvl, exp };
}

// ---------------------- 시뮬레이션 전략 ----------------------
function chooseKitByStrategy(state, kits, ctx) {
  const lvlR = levelFromTotalExp(state.totalExp, Grade.R);
  const lvlSR = levelFromTotalExp(state.totalExp, Grade.SR);

  if (state.grade === Grade.R) {
    const lvl = lvlR;
    if (lvl < 10) {
      if (kits.a > 0) return KitType.A;
      return undefined;
    }
    if (lvl === 10) {
      if (!ctx.r10PhaseActive) {
        ctx.r10PhaseActive = true;
        ctx.r10BLeft = 2;
      }
      if (ctx.r10BLeft > 0 && kits.b > 0) return KitType.B;
      if (kits.a > 0) return KitType.A;
      return undefined;
    }
    if (lvl < 15) {
      if (kits.a > 0) return KitType.A;
      return undefined;
    }
    return undefined;
  }

  const lvl = lvlSR;
  if (lvl >= 15) return undefined;
  if (lvl === 14) {
    if (kits.b > 0) return KitType.B;
    if (kits.a > 0) return KitType.A;
    return undefined;
  }
  if (kits.c > 0) return KitType.C;
  if (kits.b > 0) return KitType.B;
  if (kits.a > 0) return KitType.A;
  return undefined;
}

// 비동기 버전(Progress Bar 갱신용)
async function runSimulationAsync(
  { iterations, kits, initial, seed = 123456789, batch = 50 },
  onProgress
) {
  const rng = mulberry32(seed);

  const sr5 = { reached: 0, avgKitsUsed: { a: 0, b: 0, c: 0 } };
  const sr10 = { reached: 0, avgKitsUsed: { a: 0, b: 0, c: 0 } };
  const sr15 = { reached: 0, avgKitsUsed: { a: 0, b: 0, c: 0 } };

  let sumFinalSREquiv = 0;
  let finalCount = {};

  const addAvg = (avg, count, val) =>
    count ? (avg * (count - 1) + val) / count : 0;
  const addKitsAvg = (avg, count, add) => {
    avg.a = addAvg(avg.a, count, add.a);
    avg.b = addAvg(avg.b, count, add.b);
    avg.c = addAvg(avg.c, count, add.c);
  };

  for (let t = 1; t <= iterations; t++) {
    const u = unitExp(initial.grade);
    let total = clamp(initial.level * u + (initial.exp || 0), 0, 15 * u);
    let state = { grade: initial.grade, totalExp: total };
    if (
      state.grade === Grade.R &&
      levelFromTotalExp(state.totalExp, Grade.R) >= 15
    ) {
      state.grade = Grade.SR;
    }

    const inv = { a: kits.a, b: kits.b, c: kits.c };
    const used = { a: 0, b: 0, c: 0 };
    const ctx = { r10PhaseActive: false, r10BLeft: 0 };

    let got5 = false,
      got10 = false,
      got15 = false;

    while (true) {
      const lvlSR = levelFromTotalExp(state.totalExp, Grade.SR);
      if (!got5 && state.grade === Grade.SR && lvlSR >= 5) {
        got5 = true;
        sr5.reached++;
        addKitsAvg(sr5.avgKitsUsed, sr5.reached, used);
      }
      if (!got10 && state.grade === Grade.SR && lvlSR >= 10) {
        got10 = true;
        sr10.reached++;
        addKitsAvg(sr10.avgKitsUsed, sr10.reached, used);
      }
      if (!got15 && state.grade === Grade.SR && lvlSR >= 15) {
        got15 = true;
        sr15.reached++;
        addKitsAvg(sr15.avgKitsUsed, sr15.reached, used);
      }
      if (state.grade === Grade.SR && lvlSR >= 15) break;

      const pick = chooseKitByStrategy(state, inv, ctx);
      if (pick === undefined) break;
      if (state.grade === Grade.R) {
        const lvlR = levelFromTotalExp(state.totalExp, Grade.R);
        if (lvlR === 10 && pick === KitType.B && ctx.r10BLeft > 0)
          ctx.r10BLeft--;
      }
      const key = KitKey[pick];
      inv[key]--;
      used[key]++;
      const res = attemptLevelUp(state, pick, rng);
      state = res.state;
    }

    const fGrade = state.grade;
    const fLvl = levelFromTotalExp(state.totalExp, fGrade);
    const k = `${fGrade} ${fLvl}`;
    finalCount[k] = (finalCount[k] || 0) + 1;
    sumFinalSREquiv += state.totalExp / sr_level_up;

    if (t % batch === 0) {
      onProgress && onProgress(t / iterations);
      await new Promise((r) => setTimeout(r, 0)); // DOM 갱신 타임슬라이스
    }
  }

  onProgress && onProgress(1);
  const bestKey =
    Object.entries(finalCount).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    "(no data)";
  return {
    trials: iterations,
    probSR5: sr5.reached / iterations,
    probSR10: sr10.reached / iterations,
    probSR15: sr15.reached / iterations,
    sr5,
    sr10,
    sr15,
    avgFinal: {
      gradeLevelText: bestKey,
      srEquivalentLevel: sumFinalSREquiv / iterations
    }
  };
}

// ---------------------- UI 바인딩 ----------------------
const el = (id) => document.getElementById(id);
const gradeSel = el("grade");
const levelSel = el("level");
const expInput = el("exp");
const stateText = el("stateText");
const resetBtn = el("resetState");

const pA = el("pA");
const pB = el("pB");
const pC = el("pC");

const singleLog = el("singleLog");
const countAEl = el("countA");
const countBEl = el("countB");
const countCEl = el("countC");

const simOut = el("simOut");
const bar = el("bar");
const progressText = el("progressText");

for (let i = 0; i <= 15; i++) {
  const opt = document.createElement("option");
  opt.value = String(i);
  opt.textContent = String(i);
  levelSel.append(opt);
}

const pct = (x) => (x * 100).toFixed(1) + "%";

function readStateFromInputs() {
  const grade = gradeSel.value;
  const lvl = parseInt(levelSel.value || "0", 10);
  const unit = unitExp(grade);
  let exp = parseInt(expInput.value || "0", 10);
  if (isNaN(exp)) exp = 0;
  // 100 단위 강제 및 한계
  exp = Math.round(exp / 100) * 100;
  exp = clamp(exp, 0, unit - 100);
  if (lvl >= 15) {
    exp = 0;
  }
  const total = clamp(lvl * unit + exp, 0, 15 * unit);
  return { grade, totalExp: total };
}

function updateProbLabels(state) {
  const lvl = levelFromTotalExp(state.totalExp, state.grade);
  const a = bigSuccessProb(state.grade, lvl, KitType.A);
  const b = bigSuccessProb(state.grade, lvl, KitType.B);
  const c = bigSuccessProb(state.grade, lvl, KitType.C);
  pA.textContent = `대성공 ${pct(a)}`;
  pB.textContent = `대성공 ${pct(b)}`;
  pC.textContent = `대성공 ${pct(c)}`;
}

function writeInputsFromState(state) {
  const unit = unitExp(state.grade);
  const lvl = levelFromTotalExp(state.totalExp, state.grade);
  const exp = residualExpInLevel(state.totalExp, state.grade);
  gradeSel.value = state.grade;
  levelSel.value = String(lvl);
  expInput.value = String(lvl >= 15 ? 0 : Math.round(exp / 100) * 100);
  expInput.disabled = lvl >= 15;
  updateStateText(state);
  updateProbLabels(state);
}

function fmtState(grade, total) {
  const lvl = levelFromTotalExp(total, grade);
  const exp = residualExpInLevel(total, grade);
  return `${grade}${lvl}${lvl >= 15 ? "" : " Exp " + exp}`;
}
function updateStateText(state) {
  stateText.textContent = "현재 상태: " + fmtState(state.grade, state.totalExp);
}

// 내부 현재 상태 (입력값과 동기화)
let currentState = { grade: Grade.R, totalExp: 0 };

// 단일 시도 사용 기록
let usedCount = { a: 0, b: 0, c: 0 };
function refreshAttemptCounts() {
  countAEl.textContent = String(usedCount.a);
  countBEl.textContent = String(usedCount.b);
  countCEl.textContent = String(usedCount.c);
}
function resetAttemptRecord() {
  usedCount = { a: 0, b: 0, c: 0 };
  refreshAttemptCounts();
  singleLog.textContent = "";
}

// 동기화/초기화
function syncFromInputs() {
  currentState = readStateFromInputs();
  writeInputsFromState(currentState);
  resetAttemptRecord();
}
function resetToR0() {
  currentState = { grade: Grade.R, totalExp: 0 };
  writeInputsFromState(currentState);
  resetAttemptRecord();
}

gradeSel.addEventListener("change", syncFromInputs);
levelSel.addEventListener("change", syncFromInputs);
expInput.addEventListener("change", syncFromInputs);
resetBtn.addEventListener("click", resetToR0);

// 최초 렌더
writeInputsFromState(currentState);
refreshAttemptCounts();

// 단일 시도 버튼들
function appendSingleLog(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  singleLog.append(div);
  singleLog.scrollTop = singleLog.scrollHeight;
}

function handleAttempt(kit) {
  const before = { ...currentState };
  const lvlBefore = levelFromTotalExp(before.totalExp, before.grade);
  const expBefore = residualExpInLevel(before.totalExp, before.grade);

  if (before.grade === Grade.SR && lvlBefore >= 15) {
    appendSingleLog(`<span class="warn">이미 최고 레벨입니다</span>`);
    return; // 기록 증가 없음
  }

  const res = attemptLevelUp(before, kit); // Math.random 사용
  currentState = res.state;
  writeInputsFromState(currentState);

  // 기록 증가
  if (kit === KitType.A) usedCount.a++;
  else if (kit === KitType.B) usedCount.b++;
  else usedCount.c++;
  refreshAttemptCounts();

  // 메시지 구성
  const name =
    kit === KitType.A
      ? "초급자용"
      : kit === KitType.B
      ? "중급자용"
      : "상급자용";
  const afterLvl = levelFromTotalExp(currentState.totalExp, currentState.grade);
  const afterExp = residualExpInLevel(
    currentState.totalExp,
    currentState.grade
  );

  const beforeStr = `${before.grade}${lvlBefore}${
    lvlBefore >= 15 ? "" : ` Exp ${expBefore}`
  }`;
  const afterStr = `${currentState.grade}${afterLvl}${
    afterLvl >= 15 ? "" : ` Exp ${afterExp}`
  }`;

  if (res.bigSuccess) {
    appendSingleLog(
      `<span class="danger">${name} 관리 키트 사용: 대성공!</span> ${beforeStr} → ${afterStr}`
    );
  } else {
    appendSingleLog(`${name} 관리 키트 사용: ${beforeStr} → ${afterStr}`);
  }
}

document
  .getElementById("btnA")
  .addEventListener("click", () => handleAttempt(KitType.A));
document
  .getElementById("btnB")
  .addEventListener("click", () => handleAttempt(KitType.B));
document
  .getElementById("btnC")
  .addEventListener("click", () => handleAttempt(KitType.C));

// 시뮬레이터 실행 (Progress Bar 포함)
function renderSimResult(r, usedSeed) {
  const kitRow = (k, label) =>
    `<tr><td>${label}</td><td>${r[k].reached}</td><td>${
      r[k].reached ? r[k].avgKitsUsed.a.toFixed(2) : "-"
    }</td><td>${r[k].reached ? r[k].avgKitsUsed.b.toFixed(2) : "-"}</td><td>${
      r[k].reached ? r[k].avgKitsUsed.c.toFixed(2) : "-"
    }</td></tr>`;
  const pctTxt = (x) => (x * 100).toFixed(1) + "%";
  simOut.innerHTML = `
      <small class="muted">* "평균 사용량"은 해당 목표에 도달한 시행들에서의 <b>키트별 평균 소모량</b>입니다.</small>
      <div class="row">
        <div>
          <table>
            <thead><tr><th>목표</th><th>도달 횟수</th><th>초급자 키트 평균 사용량</th><th>중급자 키트 평균 사용량</th><th>상급자 키트 평균 사용량</th></tr></thead>
            <tbody>
              ${kitRow("sr5", "SR5")}
              ${kitRow("sr10", "SR10")}
              ${kitRow("sr15", "SR15")}
            </tbody>
          </table>
        </div>
        <div>
          <table>
            <tbody>
              <tr><th>SR5 도달 확률</th><td>${pctTxt(r.probSR5)}</td></tr>
              <tr><th>SR10 도달 확률</th><td>${pctTxt(r.probSR10)}</td></tr>
              <tr><th>SR15 도달 확률</th><td>${pctTxt(r.probSR15)}</td></tr>
              <tr><th>최다 최종 상태</th><td class="code">${
                r.avgFinal.gradeLevelText
              }</td></tr>
              <tr><th>SR 환산 평균 레벨</th><td>${r.avgFinal.srEquivalentLevel.toFixed(
                3
              )}</td></tr>
              <tr><th>시행 수</th><td>${r.trials}</td></tr>
              <tr><th>사용 시드</th><td class="code">${usedSeed}</td></tr>
            </tbody>
          </table>
        </div>
      </div>`;
}

function randomSeed8() {
  return Math.floor(10000000 + Math.random() * 90000000);
}

document.getElementById("runSim").addEventListener("click", async () => {
  // 초기화
  const s = readStateFromInputs();
  if (s.grade === Grade.R && levelFromTotalExp(s.totalExp, Grade.R) >= 15) {
    s.grade = Grade.SR;
  }
  const initial = {
    grade: s.grade,
    level: levelFromTotalExp(s.totalExp, s.grade),
    exp: residualExpInLevel(s.totalExp, s.grade)
  };

  const iterations = parseInt(
    document.getElementById("iters").value || "1000",
    10
  );
  const kits = {
    a: parseInt(document.getElementById("ka").value || "0", 10),
    b: parseInt(document.getElementById("kb").value || "0", 10),
    c: parseInt(document.getElementById("kc").value || "0", 10)
  };

  let seedInput = document.getElementById("seed");
  let seedVal = seedInput.value.trim();
  let seed = parseInt(seedVal, 10);
  if (!seedVal || Number.isNaN(seed)) {
    seed = randomSeed8();
    seedInput.value = String(seed); // 재현을 위해 입력칸에 채워 넣기
  }

  // 버튼 잠금 + 진행바 0%
  const btn = document.getElementById("runSim");
  btn.disabled = true;
  bar.style.width = "0%";
  progressText.textContent = "";

  const onProgress = (ratio) => {
    const pctNum = Math.round(ratio * 100);
    bar.style.width = pctNum + "%";
    progressText.textContent = `진행률: ${pctNum}%`;
  };

  try {
    await new Promise((r) => setTimeout(r, 0));
    const res = await runSimulationAsync(
      { iterations, kits, initial, seed, batch: 50 },
      onProgress
    );
    renderSimResult(res, seed);
  } catch (e) {
    alert("오류: " + (e.message || e));
  } finally {
    btn.disabled = false;
  }
});
