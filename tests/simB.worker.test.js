const assert = require("node:assert/strict");
const test = require("node:test");

const {
  applyAutoLocks,
  applyCandidate,
  findAutoLockTargets,
  generateCandidate,
  isFullSuccess,
  makeRng,
  run,
  runTrial,
  sampleLevelExcludingCurrent,
  shouldAcceptByStrategy,
} = require("../simB.worker.js");

function state(levels, locks = [false, false, false]) {
  return {
    currentLevels: levels.slice(),
    locks: locks.slice(),
    lockMaterials: [null, null, null],
    pendingLockModule: 0,
  };
}

test("Case A: 현재 레벨을 제외하고 원래 확률을 재정규화한다", () => {
  for (const excluded of [2, 11]) {
    const rng = makeRng(1000 + excluded);
    const counts = new Array(16).fill(0);
    const samples = 300000;
    for (let i = 0; i < samples; i++) {
      counts[sampleLevelExcludingCurrent(rng, excluded)] += 1;
    }
    assert.equal(counts[excluded], 0);
    const expectedHigh = 4 / (excluded === 2 ? 88 : 99);
    const actualHigh = (counts[12] + counts[13] + counts[14] + counts[15]) / samples;
    assert.ok(Math.abs(actualHigh - expectedHigh) < 0.002, `${actualHigh} vs ${expectedHigh}`);
  }
});

test("Case B: 더 좋은 경우 적용은 모든 활성 줄이 유지 또는 상승해야 한다", () => {
  const trial = state([2, 6, 0]);
  const targets = [12, 12, 0];
  assert.equal(shouldAcceptByStrategy(trial, [3, 7, 0], targets, "better"), true);
  applyCandidate(trial, [3, 7, 0]);
  assert.equal(shouldAcceptByStrategy(trial, [4, 5, 0], targets, "better"), false);
  assert.deepEqual(trial.currentLevels, [3, 7, 0]);
});

test("Case C: 저레벨 확보는 모든 활성 미잠금 줄이 5 이하여야 한다", () => {
  const trial = state([5, 5, 0]);
  const targets = [12, 13, 0];
  assert.equal(shouldAcceptByStrategy(trial, [4, 3, 0], targets, "low"), true);
  applyCandidate(trial, [4, 3, 0]);
  assert.equal(shouldAcceptByStrategy(trial, [1, 7, 0], targets, "low"), false);
  assert.deepEqual(trial.currentLevels, [4, 3, 0]);
});

test("Case D: 자동잠금은 저레벨 전략보다 우선하고 후보 전체를 적용한다", () => {
  const trial = state([5, 5, 0]);
  const targets = [12, 13, 0];
  const limits = [true, false, false];
  const firstCandidate = [12, 7, 0];
  assert.equal(shouldAcceptByStrategy(trial, firstCandidate, targets, "low"), false);
  const locks = findAutoLockTargets(trial, firstCandidate, targets, limits);
  assert.deepEqual(locks, [0]);
  applyCandidate(trial, firstCandidate);
  applyAutoLocks(trial, locks, false);
  assert.deepEqual(trial.currentLevels, [12, 7, 0]);
  assert.deepEqual(trial.locks, [true, false, false]);
  assert.equal(trial.pendingLockModule, 2);

  assert.equal(shouldAcceptByStrategy(trial, [12, 8, 0], targets, "low"), false);
  assert.deepEqual(trial.currentLevels, [12, 7, 0]);
  assert.equal(shouldAcceptByStrategy(trial, [12, 2, 0], targets, "low"), true);
  applyCandidate(trial, [12, 2, 0]);
  assert.equal(shouldAcceptByStrategy(trial, [12, 9, 0], targets, "low"), false);
  assert.deepEqual(trial.currentLevels, [12, 2, 0]);
  assert.equal(isFullSuccess([12, 13, 0], targets), true);
});

test("Case E: 거절한 후보가 아니라 적용 중인 현재 레벨을 다음 제외 기준으로 쓴다", () => {
  const trial = state([2, 0, 0]);
  const target = [15, 0, 0];
  const rolls = [81, 81]; // 둘 다 레벨 9. 레벨 2만 제외되므로 연속 후보가 허용된다.
  const rng = { int100: () => rolls.shift() };
  const first = generateCandidate(trial, target, rng);
  assert.deepEqual(first, [9, 0, 0]);
  const second = generateCandidate(trial, target, rng);
  assert.deepEqual(second, [9, 0, 0]);
  assert.deepEqual(trial.currentLevels, [2, 0, 0]);
});

test("Case F: 시작부터 완료된 trial은 비용과 리롤이 0이다", () => {
  const result = run({
    currentLevels: [12, 13, 0],
    targetLevels: [12, 13, 0],
    locks: [false, false, false],
    limits: [true, true, false],
    customMode: false,
    strategy: "better",
    n: 10,
    maxModule: 1,
    seed: 42,
  });
  assert.equal(result.successCount, 10);
  assert.equal(result.failureCount, 0);
  assert.equal(result.totalModule, 0);
  assert.equal(result.totalReroll, 0);
});

test("pending 잠금 비용은 다음 리롤을 실행할 수 있을 때만 소비된다", () => {
  const config = {
    currentLevels: [12, 1, 0],
    targetLevels: [12, 15, 0],
    locks: [false, false, false],
    limits: [true, false, false],
    customMode: false,
    strategy: "better",
    n: 1,
    maxModule: 3,
    seed: 7,
  };
  const trial = runTrial(config, makeRng(config.seed), config.maxModule);
  const result = run(config);
  // 초기 자동잠금 비용 2 + 잠금 1줄 리롤 비용 2 = 4라 상한 내 실행이 불가능하다.
  assert.equal(result.successCount, 0);
  assert.equal(result.failureCount, 1);
  assert.equal(result.totalModule, 0);
  assert.equal(trial.state.module, 0);
  assert.equal(trial.state.pendingLockModule, 2);
});
