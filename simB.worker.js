/* simB.worker.js: 시뮬레이션 B 계산 */

self.onmessage = (e) => {
  const msg = e.data;
  if (!msg || msg.type !== "run") return;

  try {
    const result = run(msg.config);
    self.postMessage({ type: "result", ...result });
  } catch (err) {
    self.postMessage({ type: "error", message: String(err?.message || err) });
  }
};

function makeRng(seed) {
  let x = (seed == null ? (Date.now() ^ (Math.random() * 0xffffffff)) : seed) >>> 0;
  if (x === 0) x = 0x9e3779b9;
  return {
    nextU32() {
      x ^= (x << 13) >>> 0;
      x ^= (x >>> 17) >>> 0;
      x ^= (x << 5) >>> 0;
      return x >>> 0;
    },
    int100() {
      return (this.nextU32() % 100) | 0;
    }
  };
}

function sampleLevel(r100) {
  if (r100 < 12) return 0;
  if (r100 < 24) return 1;
  if (r100 < 36) return 2;
  if (r100 < 48) return 3;
  if (r100 < 60) return 4;
  if (r100 < 67) return 5;
  if (r100 < 74) return 6;
  if (r100 < 81) return 7;
  if (r100 < 88) return 8;
  if (r100 < 95) return 9;
  if (r100 < 96) return 10;
  if (r100 < 97) return 11;
  if (r100 < 98) return 12;
  if (r100 < 99) return 13;
  return 14;
}

function countLocks(locks) {
  return (locks[0] ? 1 : 0) + (locks[1] ? 1 : 0) + (locks[2] ? 1 : 0);
}

function lockModule(state, customMode) {
  state.reroll += 1;
  const cnt = countLocks(state.locks);

  if (customMode) {
    if (cnt === 1) state.rerollCustom = 20;
    else if (cnt === 2) state.rerollCustom = 50;
  } else {
    if (cnt === 1) state.module += 2;
    else if (cnt === 2) state.module += 3;
  }
}

function endCheck(state, targets, limits, customMode) {
  const find = [false, false, false];
  for (let i = 0; i < 3; i++) {
    if (!state.locks[i]) {
      if (state.levels[i] >= targets[i]) find[i] = true;
    } else {
      find[i] = true;
    }
  }

  let cnt = 0;
  for (let i = 0; i < 3; i++) {
    if (find[i]) cnt += 1;
  }
  if (cnt === 3) return true;

  for (let i = 0; i < 3; i++) {
    if (!state.locks[i] && find[i] && targets[i] !== 0) {
      if (limits[i]) {
        state.locks[i] = true;
        lockModule(state, customMode);
      }
    }
  }
  return false;
}

function run(config) {
  const rng = makeRng(config.seed);
  const n = Math.max(1, config.n | 0);
  const maxModule = Math.max(1, config.maxModule | 0);

  let totalModule = 0;
  let totalReroll = 0;
  let totalCustom = 0;

  const resultCounts = new Map();
  let maxResult = 0;

  const progressEvery = Math.max(50, Math.floor(n / 100));

  for (let t = 0; t < n; t++) {
    const state = {
      levels: [0, 0, 0],
      locks: [!!config.locks[0], !!config.locks[1], !!config.locks[2]],
      reroll: 1,
      rerollCustom: 0,
      module: 0,
      customKey: 0,
      rerollCnt: 0,
    };

    state.reroll += countLocks(state.locks);

    if (config.customMode) {
      const cnt = countLocks(state.locks);
      if (cnt === 1) state.rerollCustom = 20;
      else if (cnt === 2) state.rerollCustom = 50;
    }

    while (true) {
      if (endCheck(state, config.levels, config.limits, config.customMode) || state.module > maxModule) {
        const m = state.module;
        resultCounts.set(m, (resultCounts.get(m) || 0) + 1);
        maxResult = Math.max(maxResult, m);
        totalModule += m;
        totalCustom += state.customKey;
        totalReroll += state.rerollCnt;
        break;
      }

      state.rerollCnt += 1;
      state.module += state.reroll;
      state.customKey += state.rerollCustom;

      for (let i = 0; i < 3; i++) {
        if (!state.locks[i] && config.levels[i] !== 0) {
          state.levels[i] = sampleLevel(rng.int100());
        }
      }
    }

    if ((t + 1) % progressEvery === 0) {
      self.postMessage({ type: "progress", done: t + 1, total: n });
    }
  }

  const hist = new Array(maxResult + 1).fill(0);
  resultCounts.forEach((count, key) => {
    hist[key] = count;
  });

  return {
    n,
    totalModule,
    totalReroll,
    totalCustom,
    hist,
  };
}
