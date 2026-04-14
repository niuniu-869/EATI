#!/usr/bin/env node
/**
 * 数据驱动 pattern 优化器（快速版）
 * 策略：
 * 1. 预计算用户样本的 levels 向量（只算一次）
 * 2. 局部搜索：每步找最佳单点改动
 * 3. 锁定语义核心维度防止漂移
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const questions = JSON.parse(fs.readFileSync(path.join(ROOT, "data/questions.json"), "utf8"));
const dimensions = JSON.parse(fs.readFileSync(path.join(ROOT, "data/dimensions.json"), "utf8"));
const types = JSON.parse(fs.readFileSync(path.join(ROOT, "data/types.json"), "utf8"));
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "data/config.json"), "utf8"));

const DIM_ORDER = dimensions.order;
const LEVEL_NUM = { L: 1, M: 2, H: 3 };
const LEVELS = ["L", "M", "H"];
const NUM_LEVEL = ["L", "M", "H"]; // index 0..2 -> level

function parsePatternNum(p) {
  // "H-H-L-M-M-L" -> Int8Array([3,3,1,2,2,1])
  const parts = p.replace(/-/g, "").split("");
  const a = new Int8Array(6);
  for (let i = 0; i < 6; i++) a[i] = LEVEL_NUM[parts[i]] || 2;
  return a;
}

function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 预计算用户 level 向量
function genUserLevels(N, seed) {
  const rnd = mulberry32(seed);
  const th = config.scoring.levelThresholds;
  const out = new Array(N);
  for (let i = 0; i < N; i++) {
    const scores = { GUT: 0, TNG: 0, EYE: 0, LEG: 0, CRW: 0, SOUL: 0 };
    for (const q of questions.main) scores[q.dim] += 1 + Math.floor(rnd() * 3);
    const arr = new Int8Array(6);
    for (let di = 0; di < 6; di++) {
      const s = scores[DIM_ORDER[di]];
      arr[di] = s <= th.L[1] ? 1 : s >= th.H[0] ? 3 : 2;
    }
    out[i] = arr;
  }
  return out;
}

function simulate(patterns, userArr, fallbackTh = 60) {
  const K = patterns.length;
  const N = userArr.length;
  const counts = new Int32Array(K + 1); // last = 404
  for (let ui = 0; ui < N; ui++) {
    const u = userArr[ui];
    let bestDist = 9999, bestExact = -1, bestIdx = -1;
    for (let ki = 0; ki < K; ki++) {
      const p = patterns[ki];
      let d = 0, ex = 0;
      for (let i = 0; i < 6; i++) {
        const diff = Math.abs(u[i] - p[i]);
        d += diff;
        if (diff === 0) ex++;
      }
      if (d < bestDist || (d === bestDist && ex > bestExact)) {
        bestDist = d; bestExact = ex; bestIdx = ki;
      }
    }
    const sim = Math.max(0, Math.round((1 - bestDist / 12) * 100));
    if (sim < fallbackTh) counts[K]++; else counts[bestIdx]++;
  }
  return counts;
}

function chiSq(counts, N, K = 23) {
  const ideal = N / K;
  let c = 0;
  for (let i = 0; i < K; i++) {
    c += Math.pow(counts[i] - ideal, 2) / ideal;
  }
  return c;
}

// ━━━ 语义约束（核心维度不可改） ━━━
const LOCKED = {
  "TAO-T":  { GUT: "H", TNG: "H" },
  "BIRD":   { GUT: "L" },
  "ROAR":   { TNG: "H" },
  "LEAF":   { TNG: "L", GUT: "L" },
  "XENO":   { TNG: "H" },
  "PICKY":  { TNG: "L" },
  "666":    { GUT: "H", SOUL: "L" },
  "NICE":   { EYE: "H" },
  "ONLY-1": { CRW: "L" },
  "PAIR":   { CRW: "L" },  // 修正：社恐依赖饭搭子 ≠ 气氛担当
  "LINE":   { EYE: "H", LEG: "H" },
  "LOFI":   { EYE: "L", TNG: "H" },
  "SPIC-Y": { TNG: "H" },
  "SWEET":  { TNG: "L" },
  "W0K!":   { SOUL: "H" },
  "DELE":   { SOUL: "L" },
  "M15":    { GUT: "H", SOUL: "H" },
  "EMO-T":  { SOUL: "H" },
  "DI-ET":  { GUT: "H", TNG: "H" },
  "ZZZZ":   { SOUL: "L" },
  "REWD":   { SOUL: "H" },
  "K-OL":   { EYE: "H", CRW: "H" },
  "ISO-8":  { CRW: "L" },
};

const N = 8000;
const USERS = genUserLevels(N, 12345);

// 当前 patterns（Int8Array）
const codes = types.standard.map((t) => t.code);
let patterns = types.standard.map((t) => parsePatternNum(t.pattern));

// 初始 chi²
let bestChi = chiSq(simulate(patterns, USERS), N);
console.log(`初始 chi²=${bestChi.toFixed(2)} (N=${N})`);

// ━━━ 贪心 ━━━
let totalChanges = 0;
for (let round = 0; round < 80; round++) {
  let bestMove = null;
  let bestGain = 0;
  for (let ki = 0; ki < patterns.length; ki++) {
    const code = codes[ki];
    const locked = LOCKED[code] || {};
    for (let di = 0; di < 6; di++) {
      const dim = DIM_ORDER[di];
      if (locked[dim]) continue;
      const oldV = patterns[ki][di];
      for (let nv = 1; nv <= 3; nv++) {
        if (nv === oldV) continue;
        patterns[ki][di] = nv;
        const ch = chiSq(simulate(patterns, USERS), N);
        const gain = bestChi - ch;
        if (gain > bestGain) {
          bestGain = gain;
          bestMove = { ki, di, oldV, nv, ch };
        }
        patterns[ki][di] = oldV;
      }
    }
  }
  if (!bestMove || bestGain < 0.2) break;
  patterns[bestMove.ki][bestMove.di] = bestMove.nv;
  bestChi = bestMove.ch;
  totalChanges++;
  const code = codes[bestMove.ki];
  const dim = DIM_ORDER[bestMove.di];
  console.log(`#${round+1}: ${code.padEnd(7)} ${dim} ${NUM_LEVEL[bestMove.oldV-1]}→${NUM_LEVEL[bestMove.nv-1]}  chi²=${bestChi.toFixed(2)} (gain ${bestGain.toFixed(2)})`);
}

console.log(`\n总改动 ${totalChanges} 处，最终 chi²=${bestChi.toFixed(2)}`);

// ━━━ 验证（用更大样本）━━━
const USERS_VERIFY = genUserLevels(50000, 99999);
const c0 = simulate(types.standard.map((t) => parsePatternNum(t.pattern)), USERS_VERIFY);
const c1 = simulate(patterns, USERS_VERIFY);
const chi0 = chiSq(c0, 50000);
const chi1 = chiSq(c1, 50000);

function toEntries(counts, N) {
  const e = [];
  for (let i = 0; i < 23; i++) e.push({ code: codes[i], pct: counts[i] / N * 100 });
  e.sort((a, b) => b.pct - a.pct);
  return e;
}

const e0 = toEntries(c0, 50000);
const e1 = toEntries(c1, 50000);
const max0 = e0[0].pct, min0 = e0.at(-1).pct;
const max1 = e1[0].pct, min1 = e1.at(-1).pct;

console.log(`\n━━━ 大样本验证 (N=50000) ━━━`);
console.log(`现状    chi²=${chi0.toFixed(1)} max=${max0.toFixed(2)}% min=${min0.toFixed(2)}% ratio=${(max0/min0).toFixed(1)}x  fallback=${(c0[23]/500).toFixed(2)}%`);
console.log(`优化后  chi²=${chi1.toFixed(1)} max=${max1.toFixed(2)}% min=${min1.toFixed(2)}% ratio=${(max1/min1).toFixed(1)}x  fallback=${(c1[23]/500).toFixed(2)}%`);

console.log("\n━━━ pattern 改动 ━━━");
for (let i = 0; i < codes.length; i++) {
  const before = types.standard[i].pattern;
  const after = [...patterns[i]].map((v) => NUM_LEVEL[v - 1]).join("-");
  if (before !== after) console.log(`  ${codes[i].padEnd(7)} ${before}  →  ${after}`);
}

console.log("\n━━━ 优化后完整分布 ━━━");
for (const e of e1) {
  const bar = "█".repeat(Math.round(e.pct * 3));
  console.log(`  ${e.code.padEnd(7)} ${e.pct.toFixed(2).padStart(5)}% ${bar}`);
}

// 最终 pattern 统计
const ps = { GUT: [0,0,0], TNG: [0,0,0], EYE: [0,0,0], LEG: [0,0,0], CRW: [0,0,0], SOUL: [0,0,0] };
for (let ki = 0; ki < patterns.length; ki++) {
  for (let di = 0; di < 6; di++) ps[DIM_ORDER[di]][patterns[ki][di] - 1]++;
}
console.log("\n━━━ 优化后 pattern 维度统计 ━━━");
for (const d of DIM_ORDER) console.log(`  ${d}: L=${ps[d][0]} M=${ps[d][1]} H=${ps[d][2]}`);

// 输出 FINAL map
const FINAL = {};
for (let i = 0; i < codes.length; i++) {
  FINAL[codes[i]] = [...patterns[i]].map((v) => NUM_LEVEL[v - 1]).join("-");
}
fs.writeFileSync(path.join(ROOT, "sim/final_patterns.json"), JSON.stringify(FINAL, null, 2));
console.log(`\n最终 pattern 写入 sim/final_patterns.json`);
