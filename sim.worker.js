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
  // seed가 null이면 시간 기반
  let x = (seed == null ? (Date.now() ^ (Math.random() * 0xffffffff)) : seed) >>> 0;
  if (x === 0) x = 0x9e3779b9; // avoid zero state
  return {
    nextU32() {
      // xorshift32
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

// ===== 옵션 뽑기 (C#과 동일한 분포) =====
// 1:10%, 2:12%, 3:12%, 4:10%, 5:12%, 6:12%, 7:12%, 8:10%, 9:10%
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

// “현 상태에서(locks/value 고정) 앞으로 성공 상태가 존재하는가?” 정확 판정
// null_flag의 “정확한 버전”
function existsWinningAssignment(state, rowMasks, dupMode) {
  // 후보 값 범위: 1줄은 1..9, 2/3줄은 0..9 (시뮬에서 0이 가능하므로)
  const ranges = [
    [], [], []
  ];

  for (let i = 0; i < 3; i++) {
    if (state.locks[i]) {
      ranges[i] = [state.options[i] | 0];
    } else {
      if (i === 0) {
        ranges[i] = [1,2,3,4,5,6,7,8,9];
      } else {
        ranges[i] = [0,1,2,3,4,5,6,7,8,9];
      }
    }
  }

  // locked 값(중복 허용) -> unlocked는 그 값과 중복 불가(시뮬 GetOption이 그렇게 동작)
  const blocked = new Set();
  for (let i = 0; i < 3; i++) {
    if (state.locks[i]) {
      const v = state.options[i] | 0;
      if (v >= 1 && v <= 9) blocked.add(v);
    }
  }

  for (const a of ranges[0]) {
    // unlocked가 locked값과 중복 불가(0 제외)
    if (!state.locks[0] && a !== 0 && blocked.has(a)) continue;

    for (const b of ranges[1]) {
      if (!state.locks[1] && b !== 0 && blocked.has(b)) continue;

      // unlocked끼리도 중복 불가(0 제외)
      if (a !== 0 && b !== 0 && a === b) continue;

      for (const c of ranges[2]) {
        if (!state.locks[2] && c !== 0 && blocked.has(c)) continue;
        if (a !== 0 && c !== 0 && a === c) continue;
        if (b !== 0 && c !== 0 && b === c) continue;

        // 성공 판정(이 후보 조합으로 성공 가능한지)
        const tmp = {
          locks: state.locks,
          options: [a,b,c]
        };

        if (checkSuccess(tmp, rowMasks, dupMode)) {
          return true;
        }
      }
    }
  }
  return false;
}

function checkSuccess(state, rowMasks, dupMode) {
  const presentMask = presentMaskFromOptions(state.options);

  for (let i = 0; i < 3; i++) {
    // 잠금 or 목표 비어있음 => 해당 줄은 요구하지 않음(원본 C#과 동일 의미)
    if (state.locks[i]) continue;
    if (rowMasks[i] === 0) continue;

    if (dupMode) {
      // 줄 무시 매칭: presentMask가 해당 줄 목표와 교집합이면 OK
      if ((rowMasks[i] & presentMask) === 0) return false;
    } else {
      // 줄 고정: 그 줄의 옵션이 목표에 포함돼야 함
      const v = state.options[i] | 0;
      if (v < 1 || v > 9) return false;
      if ((rowMasks[i] & (1 << v)) === 0) return false;
    }
  }
  return true;
}

function getOptionNoDup(state, idx, rng) {
  // 원본 C#처럼: 중복이 나오면 다시 뽑기 (options[] 기준)
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
    // 원본처럼: cnt=1/2만 갱신, cnt=3이면 기존 값 유지
    if (cnt === 1) state.rerollCustom = 20;
    else if (cnt === 2) state.rerollCustom = 50;
  } else {
    if (cnt === 1) state.module += 2;
    else if (cnt === 2) state.module += 3;
  }
}

function run(config) {
  // ===== 입력 전처리(비트마스크) =====
  const rowMasks = [
    maskFromTargets(config.targets[0]),
    maskFromTargets(config.targets[1]),
    maskFromTargets(config.targets[2]),
  ];

  const desiredUnionMask = rowMasks[0] | rowMasks[1] | rowMasks[2];

  // 초기 state
  const base = {
    locks: [!!config.locks[0], !!config.locks[1], !!config.locks[2]],
    options: [0,0,0],
    reroll: 1,
    rerollCustom: 0,
    module: 0,
    customKey: 0,
    rerollCnt: 0,
  };

  // 잠금값 반영 (초기잠금이면 "첫번째 목표 옵션" 값을 잠금값으로 사용)
  for (let i = 0; i < 3; i++) {
    if (base.locks[i]) base.options[i] = (config.lockValues[i] | 0);
  }

  // 초기 reroll 비용
  base.reroll = 1 + popcount3(base.locks[0], base.locks[1], base.locks[2]);

  // 초기 커스텀키 비용
  if (config.customMode) {
    const cnt = popcount3(base.locks[0], base.locks[1], base.locks[2]);
    if (cnt === 1) base.rerollCustom = 20;
    else if (cnt === 2) base.rerollCustom = 50;
  }

  // ===== 초기 “가능성” 사전 검사 (불가능 설정이면 바로 에러) =====
  // (null_flag로 도중에 멈추는 대신, 가능한지 정확히 먼저 판단)
  if (!existsWinningAssignment(base, rowMasks, !!config.dupMode)) {
    throw new Error("현재 설정은 성공 상태가 존재하지 않습니다(불가능). 잠금/목표옵션/Dup_option 조합을 확인하세요.");
  }

  const rng = makeRng(config.seed);

  const n = config.n | 0;
  const maxModule = config.maxModule | 0;

  // 결과 집계: 정렬 없이 히스토그램
  const hist = new Array(maxModule + 1).fill(0);
  const examples = [];

  let totalModule = 0;
  let totalReroll = 0;
  let totalCustom = 0;

  const limits = config.limits.map(Boolean);
  const dupMode = !!config.dupMode;
  const customMode = !!config.customMode;

  // 진행 표시 빈도
  const progressEvery = Math.max(50, Math.floor(n / 100));

  for (let t = 0; t < n; t++) {
    // trial state 복사
    const state = {
      locks: [base.locks[0], base.locks[1], base.locks[2]],
      options: [base.options[0], base.options[1], base.options[2]],
      reroll: base.reroll,
      rerollCustom: base.rerollCustom,
      module: 0,
      customKey: 0,
      rerollCnt: 0,
    };

    // 첫 상태가 이미 성공이면 바로 기록
    while (true) {
      if (checkSuccess(state, rowMasks, dupMode)) {
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
        break;
      }

      // 안전장치
      if (state.module > maxModule) {
        // 원본은 false 반환했지만, 웹에선 “상한 초과”로 중단시키는 게 사용자 친화적
        throw new Error(`모듈 상한(${maxModule})을 초과했습니다. 상한을 올리거나 목표/잠금/limits를 조정하세요.`);
      }

      // 리롤 1회 비용
      state.rerollCnt += 1;
      state.module += state.reroll;
      state.customKey += state.rerollCustom;

      // 3줄(인덱스2): 30% 등장, 아니면 0
      if (!state.locks[2]) {
        const r = rng.int100();
        state.options[2] = (r < 30) ? getOptionNoDup(state, 2, rng) : 0;
      }

      // 2줄(인덱스1): 50% 등장, 아니면 0
      if (!state.locks[1]) {
        const r = rng.int100();
        state.options[1] = (r < 50) ? getOptionNoDup(state, 1, rng) : 0;
      }

      // 1줄(인덱스0): 항상 등장
      if (!state.locks[0]) {
        state.options[0] = getOptionNoDup(state, 0, rng);
      }

      // ===== 자동 잠금 판단 =====
      // Dup ON일 때 find[i]는 “다른 줄 덕분에 만족”이 될 수 있으므로,
      // 잠금은 “그 줄 자체가 좋은 옵션을 들고 있느냐”로만 판단하는 게 안전.
      const lockworthy = [false, false, false];
      for (let i = 0; i < 3; i++) {
        if (state.locks[i]) continue;
        const v = state.options[i] | 0;
        if (v < 1 || v > 9) continue; // 0은 잠금할 가치 없음

        if (dupMode) {
          // 줄 무시 매칭이면: 전체 목표 옵션(desiredUnion) 중 하나면 “좋은 옵션”
          lockworthy[i] = ((desiredUnionMask & (1 << v)) !== 0);
        } else {
          // 줄 고정이면: 해당 줄 목표에 포함돼야 “좋은 옵션”
          lockworthy[i] = ((rowMasks[i] & (1 << v)) !== 0);
        }
      }

      // 3줄 잠금
      if (!state.locks[2] && lockworthy[2] && (limits[2] || limits[3])) {
        state.locks[2] = true;
        lockModule(state, customMode);
        // 잠금 후 데드엔드 검사(원본 null_flag의 정확판)
        if (!existsWinningAssignment(state, rowMasks, dupMode)) {
          throw new Error("자동 잠금으로 인해 데드엔드(불가능 상태)가 발생했습니다. limits 또는 목표 옵션을 조정하세요.");
        }
      }

      // 2줄 잠금
      if (!state.locks[1] && lockworthy[1]) {
        if (limits[1] || (limits[3] && state.locks[2])) {
          state.locks[1] = true;
          lockModule(state, customMode);
          if (!existsWinningAssignment(state, rowMasks, dupMode)) {
            throw new Error("자동 잠금으로 인해 데드엔드(불가능 상태)가 발생했습니다. limits 또는 목표 옵션을 조정하세요.");
          }
        }
      }

      // 1줄 잠금
      if (!state.locks[0] && lockworthy[0] && limits[0]) {
        state.locks[0] = true;
        lockModule(state, customMode);
        if (!existsWinningAssignment(state, rowMasks, dupMode)) {
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
