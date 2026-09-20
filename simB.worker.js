/* simB.worker.js: 수치재설정 Monte Carlo 계산 */

if (typeof self !== "undefined") {
  self.onmessage = (event) => {
    const msg = event.data;
    if (!msg || msg.type !== "run") return;

    try {
      const result = run(msg.config);
      self.postMessage({ type: "result", ...result });
    } catch (err) {
      self.postMessage({ type: "error", message: String(err?.message || err) });
    }
  };
}

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
    },
  };
}

function sampleLevel(r100) {
  if (r100 < 12) return 1;
  if (r100 < 24) return 2;
  if (r100 < 36) return 3;
  if (r100 < 48) return 4;
  if (r100 < 60) return 5;
  if (r100 < 67) return 6;
  if (r100 < 74) return 7;
  if (r100 < 81) return 8;
  if (r100 < 88) return 9;
  if (r100 < 95) return 10;
  if (r100 < 96) return 11;
  if (r100 < 97) return 12;
  if (r100 < 98) return 13;
  if (r100 < 99) return 14;
  return 15;
}

function sampleLevelExcludingCurrent(rng, currentLevel) {
  let nextLevel;
  do {
    nextLevel = sampleLevel(rng.int100());
  } while (nextLevel === currentLevel);
  return nextLevel;
}

function countLocks(locks) {
  return locks.reduce((count, locked) => count + (locked ? 1 : 0), 0);
}

function getActiveUnlockedIndexes(state, targetLevels) {
  const indexes = [];
  for (let i = 0; i < 3; i++) {
    if (!state.locks[i] && targetLevels[i] > 0) indexes.push(i);
  }
  return indexes;
}

function isFullSuccess(levels, targetLevels) {
  return targetLevels.every((target, index) => target <= 0 || levels[index] >= target);
}

function generateCandidate(state, targetLevels, rng) {
  const candidateLevels = state.currentLevels.slice();
  getActiveUnlockedIndexes(state, targetLevels).forEach((index) => {
    candidateLevels[index] = sampleLevelExcludingCurrent(
      rng,
      state.currentLevels[index]
    );
  });
  return candidateLevels;
}

function findAutoLockTargets(state, candidateLevels, targetLevels, limits) {
  return getActiveUnlockedIndexes(state, targetLevels).filter(
    (index) => limits[index] && candidateLevels[index] >= targetLevels[index]
  );
}

function shouldAcceptByStrategy(state, candidateLevels, targetLevels, strategy) {
  const indexes = getActiveUnlockedIndexes(state, targetLevels);
  if (strategy === "low") {
    return indexes.every((index) => candidateLevels[index] <= 5);
  }
  return indexes.every(
    (index) => candidateLevels[index] >= state.currentLevels[index]
  );
}

function applyCandidate(state, candidateLevels) {
  state.currentLevels = candidateLevels.slice();
}

function applyAutoLocks(state, indexes, customMode) {
  indexes.forEach((index) => {
    if (state.locks[index]) return;
    state.locks[index] = true;
    state.lockMaterials[index] = customMode ? "customLock" : "module";

    // 일반 잠금의 1차/2차 선택 비용(2/3)은 다음 실제 리롤 때 지불한다.
    if (!customMode) {
      const lockCount = countLocks(state.locks);
      if (lockCount === 1) state.pendingLockModule += 2;
      else if (lockCount === 2) state.pendingLockModule += 3;
    }
  });
}

function getRerollCost(state, customMode) {
  const lockCount = countLocks(state.locks);
  return {
    module: 1 + lockCount + state.pendingLockModule,
    customKey: customMode ? (lockCount === 1 ? 20 : lockCount === 2 ? 50 : 0) : 0,
  };
}

function runTrial(config, rng, maxModule) {
  const targetLevels = config.targetLevels;
  const state = {
    currentLevels: config.currentLevels.slice(),
    locks: config.locks.map(Boolean),
    lockMaterials: config.locks.map((locked) => (locked ? "existing" : null)),
    pendingLockModule: 0,
    module: 0,
    customKey: 0,
    rerollCnt: 0,
  };

  // 전체 완료가 최우선이므로 시작 상태가 완료라면 불필요한 잠금을 만들지 않는다.
  if (isFullSuccess(state.currentLevels, targetLevels)) {
    return { success: true, state };
  }

  const initialAutoLocks = findAutoLockTargets(
    state,
    state.currentLevels,
    targetLevels,
    config.limits
  );
  applyAutoLocks(state, initialAutoLocks, config.customMode);

  while (true) {
    const cost = getRerollCost(state, config.customMode);
    if (state.module + cost.module > maxModule) {
      return { success: false, state };
    }

    // 결과를 채택하는지와 관계없이 실제 리롤 실행 시 모든 비용을 먼저 소비한다.
    state.module += cost.module;
    state.customKey += cost.customKey;
    state.rerollCnt += 1;
    state.pendingLockModule = 0;

    const candidateLevels = generateCandidate(state, targetLevels, rng);

    // 1순위: 전체 목표 완료
    if (isFullSuccess(candidateLevels, targetLevels)) {
      applyCandidate(state, candidateLevels);
      return { success: true, state };
    }

    // 2순위: 새 자동잠금. 후보 일부가 아니라 후보 전체를 먼저 적용한다.
    const autoLockTargets = findAutoLockTargets(
      state,
      candidateLevels,
      targetLevels,
      config.limits
    );
    if (autoLockTargets.length > 0) {
      applyCandidate(state, candidateLevels);
      applyAutoLocks(state, autoLockTargets, config.customMode);
      continue;
    }

    // 3순위: 선택 전략. 거절하면 currentLevels는 그대로 남는다.
    if (shouldAcceptByStrategy(
      state,
      candidateLevels,
      targetLevels,
      config.strategy
    )) {
      applyCandidate(state, candidateLevels);
    }
  }
}

function validateConfig(config) {
  if (!Array.isArray(config.currentLevels) || !Array.isArray(config.targetLevels)) {
    throw new Error("현재 레벨과 목표 레벨 설정이 필요합니다.");
  }
  for (let i = 0; i < 3; i++) {
    if (config.targetLevels[i] > 0 && config.currentLevels[i] <= 0) {
      throw new Error(`${i + 1}줄의 현재 레벨을 선택해 주세요.`);
    }
  }
}

function run(config) {
  validateConfig(config);
  const rng = makeRng(config.seed);
  const n = Math.max(1, config.n | 0);
  const maxModule = Math.max(1, config.maxModule | 0);
  let totalModule = 0;
  let totalReroll = 0;
  let totalCustom = 0;
  let successCount = 0;
  let failureCount = 0;
  const resultCounts = new Map();
  let maxResult = 0;
  const progressEvery = Math.max(50, Math.floor(n / 100));

  for (let t = 0; t < n; t++) {
    const trial = runTrial(config, rng, maxModule);
    if (trial.success) {
      const { module, customKey, rerollCnt } = trial.state;
      successCount += 1;
      totalModule += module;
      totalCustom += customKey;
      totalReroll += rerollCnt;
      resultCounts.set(module, (resultCounts.get(module) || 0) + 1);
      maxResult = Math.max(maxResult, module);
    } else {
      failureCount += 1;
    }

    if ((t + 1) % progressEvery === 0 && typeof self !== "undefined") {
      self.postMessage({ type: "progress", done: t + 1, total: n });
    }
  }

  const hist = new Array(maxResult + 1).fill(0);
  resultCounts.forEach((count, key) => {
    hist[key] = count;
  });
  return {
    n,
    successCount,
    failureCount,
    totalModule,
    totalReroll,
    totalCustom,
    hist,
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    applyAutoLocks,
    applyCandidate,
    findAutoLockTargets,
    generateCandidate,
    isFullSuccess,
    makeRng,
    run,
    runTrial,
    sampleLevel,
    sampleLevelExcludingCurrent,
    shouldAcceptByStrategy,
  };
}
