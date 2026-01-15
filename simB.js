const LEVEL_OPTIONS = Array.from({ length: 15 }, (_, i) => i);

function populateLevelSelect(selectEl) {
  LEVEL_OPTIONS.forEach((level) => {
    const opt = document.createElement("option");
    opt.value = String(level);
    opt.textContent = String(level);
    selectEl.appendChild(opt);
  });
}

const simB = {
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
    document.getElementById("bLimit3"),
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

simB.levels.forEach((sel) => populateLevelSelect(sel));

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
  });
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
