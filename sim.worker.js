/* sim.worker.js: 순수 시뮬 계산 (DOM 접근 X) */

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

// ===== PRNG (xorshift32) =====
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
    int(maxExclusive) {
      return (this.nextU32() % maxExclusive) | 0;
    },
    int100() {
      return (this.nextU32() % 100) | 0;
    }
  };
}

// ===== 옵션 뽑기 (C#과 동일 분포) =====
function sampleOption1to9(r100) {
  if (r100 < 10) return 1;
  if (r100 < 22) return 2;
  if (r100 < 34) return 3;
  if (r100 < 44) return 4;
  if (r100 < 56) return 5;
  if (r100 < 68) return 6;
  if (r100 < 80) return 7;
  if (r100 < 90) return 8;
  return 9;
}

function maskFromTargets(arr5) {
  let mask = 0;
  for (const v of arr5) {
    const n = v | 0;
    if (n >= 1 && n <= 9) mask |= (1 << n);
  }
  return mask;
}

function popcount3(b0, b1, b2) {
  return (b0 ? 1 : 0) + (b1 ? 1 : 0) + (b2 ? 1 : 0);
}

function presentMaskFromOptions(opt3) {
  let m = 0;
  for (let i = 0; i < 3; i++) {
    const v = opt3[i] | 0;
    if (v >= 1 && v <= 9) m |= (1 << v);
  }
  return m;
}

/**
 * ✅ 성공 판정
 * - dupMode=false: 줄 고정 (각 줄 옵션이 해당 줄 목표에 포함돼야 함)
 * - dupMode=true : 줄 무시(전역) (선택된 '서로 다른 옵션'이 모두 present에 있어야 함)
 */
function checkSuccess(state, rowMasks, dupMode, requiredMask) {
  const presentMask = presentMaskFromOptions(state.options);

  if (dupMode) {
    // requiredMask가 0이면 요구 없음 -> 성공
    return (requiredMask & ~presentMask) === 0;
  }

  // 줄 고정 모드
  for (let i = 0; i < 3; i++) {
    if (state.locks[i]) continue;
    if (rowMasks[i] === 0) continue;

    const v = state.options[i] | 0;
    if (v < 1 || v > 9) return false;
    if ((rowMasks[i] & (1 << v)) === 0) return false;
  }
  return true;
}

// “현 상태에서 앞으로 성공 상태가 존재하는가?” 정확 판정 (데드엔드 감지)
function existsWinningAssignment(state, rowMasks, dupMode, requiredMask) {
  const ranges = [[], [], []];

  for (let i = 0; i < 3; i++) {
    if (state.locks[i]) {
      ranges[i] = [state.options[i] | 0];
    } else {
      if (i === 0) ranges[i] = [1,2,3,4,5,6,7,8,9];
      else ranges[i] = [0,1,2,3,4,5,6,7,8,9];
    }
  }

  const blocked = new Set();
  for (let i = 0; i < 3; i++) {
    if (state.locks[i]) {
      const v = state.options[i] | 0;
      if (v >= 1 && v <= 9) blocked.add(v);
    }
  }

  for (const a of ranges[0]) {
    if (!state.locks[0] && a !== 0 && blocked.has(a)) continue;

    for (const b of ranges[1]) {
      if (!state.locks[1] && b !== 0 && blocked.has(b)) continue;
      if (a !== 0 && b !== 0 && a === b) continue;

      for (const c of ranges[2]) {
        if (!state.locks[2] && c !== 0 && blocked.has(c)) continue;
        if (a !== 0 && c !== 0 && a === c) continue;
        if (b !== 0 && c !== 0 && b === c) continue;

        const tmp = { locks: state.locks, options: [a,b,c] };
        if (checkSuccess(tmp, rowMasks, dupMode, requiredMask)) return true;
      }
    }
  }
  return false;
}

function getOptionNoDup(state, idx, rng) {
  while (true) {
    const v = sampleOption1to9(rng.int100());
    let dup = false;
    for (let i = 0; i < 3; i++) {
      if (i === idx) continue;
      if (state.options[i] === v) { dup = true; break; }
    }
    if (!dup) return v;
  }
}

function lockModule(state, customMode) {
  state.reroll += 1;
  const cnt = popcount3(state.locks[0], state.locks[1], state.locks[2]);

  if (customMode) {
    if (cnt === 1) state.rerollCustom = 20;
    else if (cnt === 2) state.rerollCustom = 50;
  } else {
    if (cnt === 1) state.module += 2;
    else if (cnt === 2) state.module += 3;
  }
}

function run(config) {
  // rowMasks: 줄 고정 모드에서만 의미가 큼
  // (잠금된 줄은 요구하지 않는 것이 Unity 로직과 일치)
  const rowMasks = [
    config.locks[0] ? 0 : maskFromTargets(config.targets[0]),
    config.locks[1] ? 0 : maskFromTargets(config.targets[1]),
    config.locks[2] ? 0 : maskFromTargets(config.targets[2]),
  ];

  // ✅ Dup_option 전역 요구 옵션(서로 다른 옵션의 합집합)
  const requiredMask = rowMasks[0] | rowMasks[1] | rowMasks[2];

  const base = {
    locks: [!!config.locks[0], !!config.locks[1], !!config.locks[2]],
    options: [0,0,0],
    reroll: 1,
    rerollCustom: 0,
  };

  for (let i = 0; i < 3; i++) {
    if (base.locks[i]) base.options[i] = (config.lockValues[i] | 0);
  }

  base.reroll = 1 + popcount3(base.locks[0], base.locks[1], base.locks[2]);

  if (config.customMode) {
    const cnt = popcount3(base.locks[0], base.locks[1], base.locks[2]);
    if (cnt === 1) base.rerollCustom = 20;
    else if (cnt === 2) base.rerollCustom = 50;
  }

  const dupMode = !!config.dupMode;
  const customMode = !!config.customMode;
  const limits = config.limits.map(Boolean);

  // 초기 불가능 체크
  const initStateForCheck = {
    locks: [base.locks[0], base.locks[1], base.locks[2]],
    options: [base.options[0], base.options[1], base.options[2]]
  };
  if (!existsWinningAssignment(initStateForCheck, rowMasks, dupMode, requiredMask)) {
    throw new Error("현재 설정은 성공 상태가 존재하지 않습니다(불가능). 잠금/목표옵션/Dup_option 조합을 확인하세요.");
  }

  const rng = makeRng(config.seed);
  const n = config.n | 0;
  const maxModule = config.maxModule | 0;

  const hist = new Array(maxModule + 1).fill(0);
  const examples = [];

  let totalModule = 0;
  let totalReroll = 0;
  let totalCustom = 0;

  const progressEvery = Math.max(50, Math.floor(n / 100));

  for (let t = 0; t < n; t++) {
    const state = {
      locks: [base.locks[0], base.locks[1], base.locks[2]],
      options: [base.options[0], base.options[1], base.options[2]],
      reroll: base.reroll,
      rerollCustom: base.rerollCustom,
      module: 0,
      customKey: 0,
      rerollCnt: 0,
    };

    const recordSuccess = () => {
      const m = state.module;
      if (m <= maxModule) hist[m] += 1;
      totalModule += m;
      totalCustom += state.customKey;
      totalReroll += state.rerollCnt;

      if (examples.length < 5) {
        examples.push({
          module: state.module,
          rerollCnt: state.rerollCnt,
          customKey: state.customKey,
          options: [state.options[0], state.options[1], state.options[2]],
          locks: [state.locks[0], state.locks[1], state.locks[2]],
        });
      }
    };

    while (true) {
      // (루프 시작) 이미 성공이면 기록하고 종료
      if (checkSuccess(state, rowMasks, dupMode, requiredMask)) {
        recordSuccess();
        break;
      }

      if (state.module > maxModule) {
        throw new Error(`모듈 상한(${maxModule})을 초과했습니다. 상한을 올리거나 목표/잠금/limits를 조정하세요.`);
      }

      // 리롤 1회 비용
      state.rerollCnt += 1;
      state.module += state.reroll;
      state.customKey += state.rerollCustom;

      // 옵션 갱신
      if (!state.locks[2]) {
        const r = rng.int100();
        state.options[2] = (r < 30) ? getOptionNoDup(state, 2, rng) : 0;
      }
      if (!state.locks[1]) {
        const r = rng.int100();
        state.options[1] = (r < 50) ? getOptionNoDup(state, 1, rng) : 0;
      }
      if (!state.locks[0]) {
        state.options[0] = getOptionNoDup(state, 0, rng);
      }

      // ✅ 경우1 해결: 새 옵션으로 이미 성공이면 "잠금 비용" 없이 바로 종료
      if (checkSuccess(state, rowMasks, dupMode, requiredMask)) {
        recordSuccess();
        break;
      }

      // 자동 잠금 판단
      const lockworthy = [false, false, false];
      for (let i = 0; i < 3; i++) {
        if (state.locks[i]) continue;
        const v = state.options[i] | 0;
        if (v < 1 || v > 9) continue;

        if (dupMode) {
          // Dup_option: 전역 requiredMask에 포함된 옵션이면 잠금 가치
          lockworthy[i] = ((requiredMask & (1 << v)) !== 0);
        } else {
          lockworthy[i] = ((rowMasks[i] & (1 << v)) !== 0);
        }
      }

      // 3줄 잠금
      if (!state.locks[2] && lockworthy[2] && (limits[2] || limits[3])) {
        state.locks[2] = true;
        lockModule(state, customMode);
        if (!existsWinningAssignment(state, rowMasks, dupMode, requiredMask)) {
          throw new Error("자동 잠금으로 인해 데드엔드(불가능 상태)가 발생했습니다. limits 또는 목표 옵션을 조정하세요.");
        }
      }

      // 2줄 잠금
      if (!state.locks[1] && lockworthy[1]) {
        if (limits[1] || (limits[3] && state.locks[2])) {
          state.locks[1] = true;
          lockModule(state, customMode);
          if (!existsWinningAssignment(state, rowMasks, dupMode, requiredMask)) {
            throw new Error("자동 잠금으로 인해 데드엔드(불가능 상태)가 발생했습니다. limits 또는 목표 옵션을 조정하세요.");
          }
        }
      }

      // 1줄 잠금
      if (!state.locks[0] && lockworthy[0] && limits[0]) {
        state.locks[0] = true;
        lockModule(state, customMode);
        if (!existsWinningAssignment(state, rowMasks, dupMode, requiredMask)) {
          throw new Error("자동 잠금으로 인해 데드엔드(불가능 상태)가 발생했습니다. limits 또는 목표 옵션을 조정하세요.");
        }
      }
    }

    if ((t + 1) % progressEvery === 0) {
      self.postMessage({ type: "progress", done: t + 1, total: n });
    }
  }

  return {
    n,
    totalModule,
    totalReroll,
    totalCustom,
    hist,
    examples,
  };
}
