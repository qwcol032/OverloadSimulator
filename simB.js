const OPTION_LABELS = [
  "우월코드 데미지 증가",
  "명중률 증가",
  "최대 장탄 수 증가",
  "공격력 증가",
  "차지 데미지 증가",
  "차지 속도 증가",
  "크리티컬 피해량 증가",
  "크리티컬 확률 증가",
  "방어력 증가",
];

const LEVEL_VALUES = {
  arr1: ["[1] 9.54","[2] 10.94","[3] 12.34","[4] 13.75","[5] 15.15","[6] 16.55","[7] 17.95","[8] 19.35","[9] 20.75","[10] 22.15","[11] 23.56","[12] 24.96","[13] 26.36","[14] 27.76","[15] 29.16"],
  arr2: ["[1] 4.77","[2] 5.47","[3] 6.18","[4] 6.88","[5] 7.59","[6] 8.29","[7] 9.00","[8] 9.70","[9] 10.40","[10] 11.11","[11] 11.81","[12] 12.52","[13] 13.22","[14] 13.93","[15] 14.63"],
  arr3: ["[1] 27.84","[2] 31.95","[3] 36.06","[4] 40.17","[5] 44.28","[6] 48.39","[7] 52.50","[8] 56.60","[9] 60.71","[10] 64.82","[11] 68.93","[12] 73.04","[13] 77.15","[14] 81.26","[15] 82.37"],
  arr4: ["[1] 1.98","[2] 2.28","[3] 2.57","[4] 2.86","[5] 3.16","[6] 3.45","[7] 3.75","[8] 4.04","[9] 4.33","[10] 4.63","[11] 4.92","[12] 5.21","[13] 5.51","[14] 5.80","[15] 6.09"],
  arr5: ["[1] 6.64","[2] 7.62","[3] 8.60","[4] 9.58","[5] 10.56","[6] 11.54","[7] 12.52","[8] 13.50","[9] 14.48","[10] 15.46","[11] 16.44","[12] 17.42","[13] 18.40","[14] 19.38","[15] 20.36"],
  arr6: ["[1] 2.30","[2] 2.64","[3] 2.98","[4] 3.32","[5] 3.66","[6] 4.00","[7] 4.35","[8] 4.69","[9] 5.03","[10] 5.37","[11] 5.70","[12] 6.05","[13] 6.39","[14] 6.73","[15] 7.07"],
};

const LEVEL_TABLE_BY_OPTION = {
  1: LEVEL_VALUES.arr1,
  2: LEVEL_VALUES.arr2,
  3: LEVEL_VALUES.arr3,
  4: LEVEL_VALUES.arr2,
  5: LEVEL_VALUES.arr2,
  6: LEVEL_VALUES.arr4,
  7: LEVEL_VALUES.arr5,
  8: LEVEL_VALUES.arr6,
  9: LEVEL_VALUES.arr2,
};

function populateOptionSelect(selectEl) {
  const placeholder = document.createElement("option");
  placeholder.value = "-1";
  placeholder.textContent = "옵션 선택";
  placeholder.selected = true;
  selectEl.appendChild(placeholder);

  OPTION_LABELS.forEach((label, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx + 1);
    opt.textContent = label;
    selectEl.appendChild(opt);
  });
}

function populateLevelSelect(selectEl, levelLabels = []) {
  selectEl.innerHTML = "";
  const none = document.createElement("option");
  none.value = "0";
  none.textContent = "레벨 선택";
  selectEl.appendChild(none);

  levelLabels.forEach((label, index) => {
    const opt = document.createElement("option");
    opt.value = String(index + 1);
    opt.textContent = label;
    selectEl.appendChild(opt);
  });
}

function updateLevelColor(selectEl) {
  const value = Number(selectEl.value);
  selectEl.classList.remove("levelLow", "levelHigh");
  if (value >= 12) selectEl.classList.add("levelHigh");
  else if (value >= 1) selectEl.classList.add("levelLow");
}

const simB = {
  options: [
    document.getElementById("bOption0"),
    document.getElementById("bOption1"),
    document.getElementById("bOption2"),
  ],
  levels: [
    document.getElementById("bLevel0"),
    document.getElementById("bLevel1"),
    document.getElementById("bLevel2"),
  ],
  locks: [
    document.getElementById("bLock0"),
    document.getElementById("bLock1"),
    document.getElementById("bLock2"),
  ],
  limits: [
    document.getElementById("bLimit0"),
    document.getElementById("bLimit1"),
    document.getElementById("bLimit2"),
  ],
  customMode: document.getElementById("bCustomMode"),
  n: document.getElementById("bN"),
  maxModule: document.getElementById("bMaxModule"),
  runBtn: document.getElementById("bRunBtn"),
  stopBtn: document.getElementById("bStopBtn"),
  resetBtn: document.getElementById("resetAllBtnB"),
  statusText: document.getElementById("bStatusText"),
  progress: document.getElementById("bProgress"),
  errorBox: document.getElementById("bErrorBox"),
  avgModule: document.getElementById("bAvgModule"),
  avgReroll: document.getElementById("bAvgReroll"),
  avgCustom: document.getElementById("bAvgCustom"),
  canvas: document.getElementById("bHistCanvas"),
};

simB.options.forEach((sel) => populateOptionSelect(sel));
simB.levels.forEach((sel) => {
  populateLevelSelect(sel, []);
  updateLevelColor(sel);
});

function updateOptionAvailability() {
  const selected = new Set(
    simB.options
      .map((sel) => Number(sel.value))
      .filter((value) => value > 0)
  );

  simB.options.forEach((sel) => {
    const currentValue = Number(sel.value);
    Array.from(sel.options).forEach((opt) => {
      const optValue = Number(opt.value);
      if (optValue <= 0) {
        opt.disabled = false;
        return;
      }
      opt.disabled = optValue !== currentValue && selected.has(optValue);
    });
  });
}

updateOptionAvailability();

simB.options.forEach((optionSel, index) => {
  const levelSel = simB.levels[index];
  optionSel.addEventListener("change", () => {
    const optionValue = Number(optionSel.value);
    const table = optionValue > 0 ? (LEVEL_TABLE_BY_OPTION[optionValue] || []) : [];
    populateLevelSelect(levelSel, table);
    levelSel.disabled = optionValue <= 0;
    levelSel.value = "0";
    updateLevelColor(levelSel);
    updateOptionAvailability();
  });
});

simB.levels.forEach((levelSel) => {
  levelSel.addEventListener("change", () => updateLevelColor(levelSel));
});

function drawHistogramB(canvas, hist) {
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

function setRunningB(running) {
  simB.runBtn.disabled = running;
  simB.stopBtn.disabled = !running;
}

function setStatusB(text, pct = null) {
  simB.statusText.textContent = text;
  if (pct == null) return;
  simB.progress.value = Math.max(0, Math.min(100, pct));
}

function showErrorB(msg) {
  simB.errorBox.textContent = msg;
  simB.errorBox.classList.remove("hidden");
}

function clearErrorB() {
  simB.errorBox.textContent = "";
  simB.errorBox.classList.add("hidden");
}

function readConfigB() {
  return {
    levels: simB.levels.map((sel) => Number(sel.value)),
    locks: simB.locks.map((lock) => lock.checked),
    limits: simB.limits.map((limit) => limit.checked),
    customMode: simB.customMode.checked,
    n: Math.max(1, Number(simB.n.value || 1)),
    maxModule: Math.max(1, Number(simB.maxModule.value || 2000)),
  };
}

let workerB = null;

function stopWorkerB() {
  if (workerB) workerB.terminate();
  workerB = null;
  setRunningB(false);
}

simB.runBtn.addEventListener("click", () => {
  clearErrorB();
  const config = readConfigB();

  stopWorkerB();
  workerB = new Worker("./simB.worker.js?v=simB1");

  setRunningB(true);
  setStatusB("시뮬 준비 중...", 0);

  workerB.onmessage = (e) => {
    const msg = e.data;

    if (msg.type === "progress") {
      const pct = Math.floor((msg.done / msg.total) * 100);
      setStatusB(`진행 중... (${msg.done}/${msg.total})`, pct);
      return;
    }

    if (msg.type === "error") {
      setRunningB(false);
      setStatusB("오류로 중단", 0);
      showErrorB(msg.message);
      return;
    }

    if (msg.type === "result") {
      setRunningB(false);
      setStatusB("완료", 100);

      const { n, totalModule, totalReroll, totalCustom, hist } = msg;
      simB.avgModule.textContent = (totalModule / n).toFixed(3);
      simB.avgReroll.textContent = (totalReroll / n).toFixed(3);
      simB.avgCustom.textContent = (totalCustom / n).toFixed(3);

      drawHistogramB(simB.canvas, hist);
    }
  };

  workerB.onerror = (err) => {
    setRunningB(false);
    setStatusB("Worker 오류", 0);
    showErrorB(String(err.message || err));
  };

  workerB.postMessage({ type: "run", config });
});

simB.stopBtn.addEventListener("click", () => {
  stopWorkerB();
  setStatusB("사용자 중지", 0);
});

simB.resetBtn?.addEventListener("click", () => {
  stopWorkerB();

  simB.levels.forEach((sel) => {
    sel.value = "0";
    sel.disabled = true;
    populateLevelSelect(sel, []);
    updateLevelColor(sel);
  });
  simB.options.forEach((sel) => {
    sel.value = "-1";
  });
  updateOptionAvailability();
  simB.locks.forEach((lock) => {
    lock.checked = false;
  });
  simB.limits.forEach((limit) => {
    limit.checked = false;
  });
  simB.customMode.checked = false;

  clearErrorB();
  simB.avgModule.textContent = "-";
  simB.avgReroll.textContent = "-";
  simB.avgCustom.textContent = "-";
  setStatusB("대기 중", 0);

  const ctx = simB.canvas.getContext("2d");
  ctx.clearRect(0, 0, simB.canvas.width, simB.canvas.height);
});

document.addEventListener("sim:change", (event) => {
  if (event.detail !== "simB") {
    stopWorkerB();
    setStatusB("대기 중", 0);
  }
});
