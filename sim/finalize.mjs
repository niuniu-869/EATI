#!/usr/bin/env node
/**
 * 手动微调 + 最终验证
 * 目的：修复 d=1 近邻，避免人格过度相似
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
const NUM_LEVEL = ["L", "M", "H"];

// ━━━ 最终 pattern（语义一致 + 手动微调）━━━
// 修正点：
// - PICKY CRW L→M（避免全 L，保留"被动随局"的挑食感）
// - DELE SOUL L→M（和 666 区分）
const FINAL = {
  "TAO-T":  "H-H-L-L-M-L",   // 改：LEG M→L
  "BIRD":   "L-L-M-L-L-L",   // 不变
  "ROAR":   "M-H-L-H-L-M",   // 改：LEG L→H, CRW M→L
  "LEAF":   "L-L-H-L-L-H",   // 不变
  "XENO":   "H-H-M-H-L-M",   // 改：GUT M→H, SOUL H→M
  "PICKY":  "L-L-L-L-M-L",   // 改：SOUL M→L（手动 CRW 保持 M 避免全 L）
  "666":    "H-M-L-L-H-L",   // 不变
  "NICE":   "L-L-H-H-M-H",   // 改：TNG M→L
  "ONLY-1": "M-L-H-H-L-M",   // 改：TNG H→L
  "PAIR":   "L-M-M-M-L-H",   // 改：GUT M→L, CRW H→L
  "LINE":   "M-M-H-H-H-M",   // 不变
  "LOFI":   "M-H-L-H-L-L",   // 不变
  "SPIC-Y": "L-H-L-H-M-H",   // 改：GUT M→L, EYE M→L, LEG M→H
  "SWEET":  "L-L-H-H-H-H",   // 改：TNG H→L, LEG M→H, CRW M→H
  "W0K!":   "M-L-L-L-L-H",   // 改：EYE M→L
  "DELE":   "H-M-L-L-M-M",   // 手动保持 SOUL=M 和 666 区分
  "M15":    "H-H-L-H-H-H",   // 改：LEG M→H
  "EMO-T":  "H-H-M-L-L-H",   // 改：LEG M→L
  "DI-ET":  "H-H-H-M-M-H",   // 不变
  "ZZZZ":   "M-M-L-L-H-L",   // 改：CRW M→H
  "REWD":   "M-M-H-M-H-H",   // 改：CRW M→H
  "K-OL":   "M-H-H-H-H-L",   // 改：SOUL H→L
  "ISO-8":  "L-M-H-L-L-M",   // 改：EYE L→H
};

// ━━━ 模拟验证 ━━━
function parsePatternNum(p) {
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

function genUserLevels(N, seed) {
  const rnd = mulberry32(seed);
  const th = config.scoring.levelThresholds;
  const out = [];
  for (let i = 0; i < N; i++) {
    const scores = { GUT: 0, TNG: 0, EYE: 0, LEG: 0, CRW: 0, SOUL: 0 };
    for (const q of questions.main) scores[q.dim] += 1 + Math.floor(rnd() * 3);
    const arr = new Int8Array(6);
    for (let di = 0; di < 6; di++) {
      const s = scores[DIM_ORDER[di]];
      arr[di] = s <= th.L[1] ? 1 : s >= th.H[0] ? 3 : 2;
    }
    out.push(arr);
  }
  return out;
}

function simulate(patterns, userArr, fallbackTh = 60) {
  const K = patterns.length;
  const counts = new Int32Array(K + 1);
  for (const u of userArr) {
    let bd = 9999, be = -1, bi = -1;
    for (let ki = 0; ki < K; ki++) {
      const p = patterns[ki];
      let d = 0, ex = 0;
      for (let i = 0; i < 6; i++) {
        const diff = Math.abs(u[i] - p[i]);
        d += diff;
        if (diff === 0) ex++;
      }
      if (d < bd || (d === bd && ex > be)) { bd = d; be = ex; bi = ki; }
    }
    const sim = Math.max(0, Math.round((1 - bd / 12) * 100));
    if (sim < fallbackTh) counts[K]++; else counts[bi]++;
  }
  return counts;
}

function chiSq(counts, N, K = 23) {
  const ideal = N / K;
  let c = 0;
  for (let i = 0; i < K; i++) c += Math.pow(counts[i] - ideal, 2) / ideal;
  return c;
}

const N = 50000;
const USERS = genUserLevels(N, 99999);
const codes = types.standard.map((t) => t.code);

const origPatterns = types.standard.map((t) => parsePatternNum(t.pattern));
const newPatterns = codes.map((c) => parsePatternNum(FINAL[c]));

const c0 = simulate(origPatterns, USERS);
const c1 = simulate(newPatterns, USERS);
const chi0 = chiSq(c0, N);
const chi1 = chiSq(c1, N);

function toEntries(counts) {
  const e = codes.map((c, i) => ({ code: c, pct: counts[i] / N * 100 }));
  e.sort((a, b) => b.pct - a.pct);
  return e;
}

const e0 = toEntries(c0);
const e1 = toEntries(c1);

console.log("━━━ 现状 vs 最终方案 ━━━");
console.log(`现状      chi²=${chi0.toFixed(1)}  max=${e0[0].pct.toFixed(2)}%  min=${e0.at(-1).pct.toFixed(2)}%  ratio=${(e0[0].pct/e0.at(-1).pct).toFixed(1)}x`);
console.log(`最终方案  chi²=${chi1.toFixed(1)}  max=${e1[0].pct.toFixed(2)}%  min=${e1.at(-1).pct.toFixed(2)}%  ratio=${(e1[0].pct/e1.at(-1).pct).toFixed(1)}x`);
console.log(`fallback: 现状=${(c0[23]/N*100).toFixed(2)}%  新方案=${(c1[23]/N*100).toFixed(2)}%`);

console.log("\n━━━ 最终分布 ━━━");
for (const e of e1) {
  const bar = "█".repeat(Math.round(e.pct * 3));
  console.log(`  ${e.code.padEnd(7)} ${e.pct.toFixed(2).padStart(5)}%  ${bar}`);
}

// ━━━ 区分度 ━━━
console.log("\n━━━ 区分度检查（人格 pattern 距离）━━━");
let dupCount = 0, d1Count = 0, d2Count = 0;
for (let i = 0; i < codes.length; i++) {
  for (let j = i + 1; j < codes.length; j++) {
    let d = 0;
    for (let k = 0; k < 6; k++) d += Math.abs(newPatterns[i][k] - newPatterns[j][k]);
    if (d === 0) { dupCount++; console.log(`  ❌ ${codes[i]} = ${codes[j]}`); }
    else if (d === 1) d1Count++;
    else if (d === 2) d2Count++;
  }
}
console.log(`  重复=${dupCount}  d=1 近邻=${d1Count}  d=2 近邻=${d2Count}`);

// 输出所有改动
console.log("\n━━━ 最终 pattern 改动清单 ━━━");
let changeCount = 0;
for (let i = 0; i < codes.length; i++) {
  if (types.standard[i].pattern !== FINAL[codes[i]]) {
    changeCount++;
    console.log(`  ${codes[i].padEnd(7)} ${types.standard[i].pattern}  →  ${FINAL[codes[i]]}`);
  }
}
console.log(`\n共 ${changeCount}/23 人格改动，6 人格 pattern 保持不变`);

fs.writeFileSync(path.join(ROOT, "sim/final_patterns.json"), JSON.stringify(FINAL, null, 2));
console.log("写入 sim/final_patterns.json");
