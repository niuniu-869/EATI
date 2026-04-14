#!/usr/bin/env node
/**
 * 语义优先优化器 v2
 * 原则：
 *  1. 每个人格先锁定 2-4 个"核心定义维度"——不可改
 *  2. 仅在语义次要维度上搜索最优
 *  3. 目标：分布改善即可，不强求 1.7x 极致
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
  const counts = new Int32Array(K + 1);
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
  for (let i = 0; i < K; i++) c += Math.pow(counts[i] - ideal, 2) / ideal;
  return c;
}

// ━━━ 严格语义锁定（基于人格描述逐个核对） ━━━
// 锁定 = 不允许优化器修改的维度，保护人格灵魂
const LOCKED = {
  "TAO-T":  { GUT: "H", TNG: "H", SOUL: "L", EYE: "L" }, // 饕餮=大胃+重口+纯生理+不讲卖相
  "BIRD":   { GUT: "L", TNG: "L", SOUL: "L" },           // 小鸟胃核心+偏清淡+非情绪(胃小就是胃小)
  "ROAR":   { TNG: "H", EYE: "L" },                      // 食肉重口+直接扑肉
  "LEAF":   { GUT: "L", TNG: "L", EYE: "H", SOUL: "H" }, // 素食清淡+朋友圈晒道场+修行
  "XENO":   { TNG: "H", LEG: "H", SOUL: "M" },           // 异食+全球觅食+理性探险(非情绪化)
  "PICKY":  { TNG: "L", LEG: "L", EYE: "L", SOUL: "L" }, // 挑食清淡+不爱探新+不讲卖相+非情绪(味觉敏感)
  "666":    { GUT: "H", SOUL: "L", EYE: "L" },           // 干饭=大胃+纯续命+不讲究
  "NICE":   { EYE: "H", SOUL: "H" },                     // 精致拍照=视觉+仪式感
  "ONLY-1": { CRW: "L", LEG: "H", EYE: "H" },            // 孤独+寻隐秘店+独食仪式
  "PAIR":   { CRW: "L", SOUL: "H", EYE: "M" },           // 饭搭子依赖+情感=关系
  "LINE":   { EYE: "H", LEG: "H", CRW: "H" },            // 网红打卡铁三角
  "LOFI":   { EYE: "L", TNG: "H", LEG: "H", SOUL: "L" }, // 下水道朋克+反虚荣
  "SPIC-Y": { TNG: "H", LEG: "H", SOUL: "H", EYE: "L" }, // 辣党=重口+跨城+修行+不讲卖相(辣到流泪)
  "SWEET":  { TNG: "L", SOUL: "H" },                     // 甜=非辣+对抗苦难
  "W0K!":   { TNG: "L", EYE: "L", LEG: "L", SOUL: "H", CRW: "L" }, // 妈味=清淡+不讲究+恋家+乡愁+独自思乡
  "DELE":   { GUT: "H", EYE: "L", SOUL: "L" },           // 光盘=吃完+不讲究+非享乐
  "M15":    { GUT: "H", LEG: "H", SOUL: "H", TNG: "H" }, // 夜宵=能吃+跑摊+情绪释放+烧烤重口
  "EMO-T":  { GUT: "H", SOUL: "H", TNG: "H" },           // 情绪化暴食+蛋糕烤鸭都重口/甜腻
  "DI-ET":  { GUT: "H", TNG: "H", SOUL: "H" },           // 减肥诈骗=爱吃+重口+立flag高情绪
  "ZZZZ":   { SOUL: "L", EYE: "L" },                     // 无欲+不讲卖相
  "REWD":   { SOUL: "H", EYE: "H", TNG: "M" },           // 奖励=情感驱动+仪式+烧烤日料偏重口(非清淡)
  "K-OL":   { EYE: "H", CRW: "H", LEG: "H", TNG: "H" },  // KOL 四铁律（SOUL 开放：允许改 L，流量非情感）
  "ISO-8":  { CRW: "L" },                                // 社恐核心
};

const N = 8000;
const USERS = genUserLevels(N, 12345);

const codes = types.standard.map((t) => t.code);
let patterns = types.standard.map((t) => parsePatternNum(t.pattern));

let bestChi = chiSq(simulate(patterns, USERS), N);
console.log(`初始 chi²=${bestChi.toFixed(2)}`);
let lockedCount = 0;
for (const c of codes) lockedCount += Object.keys(LOCKED[c] || {}).length;
console.log(`总锁定 ${lockedCount}/${23 * 6} 维度（${(lockedCount/(23*6)*100).toFixed(0)}%）`);

// 先强制应用锁定（修正原始 PAIR CRW=H→L, SWEET 等违和项）
console.log("\n━━━ 应用语义锁定（修正违和项） ━━━");
for (let ki = 0; ki < codes.length; ki++) {
  const code = codes[ki];
  const locked = LOCKED[code] || {};
  for (const [dim, lv] of Object.entries(locked)) {
    const di = DIM_ORDER.indexOf(dim);
    const lvNum = LEVEL_NUM[lv];
    if (patterns[ki][di] !== lvNum) {
      console.log(`  ${code.padEnd(7)} ${dim} ${NUM_LEVEL[patterns[ki][di]-1]}→${lv} (语义修正)`);
      patterns[ki][di] = lvNum;
    }
  }
}
const chiAfterLock = chiSq(simulate(patterns, USERS), N);
console.log(`锁定修正后 chi²=${chiAfterLock.toFixed(2)}`);
bestChi = chiAfterLock;

// ━━━ 仅在非锁定维度贪心搜索 ━━━
console.log("\n━━━ 贪心搜索（仅非锁定维度） ━━━");
let totalChanges = 0;
for (let round = 0; round < 60; round++) {
  let bestMove = null;
  let bestGain = 0;
  for (let ki = 0; ki < patterns.length; ki++) {
    const code = codes[ki];
    const locked = LOCKED[code] || {};
    for (let di = 0; di < 6; di++) {
      if (locked[DIM_ORDER[di]]) continue;
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
  if (!bestMove || bestGain < 0.3) break;
  patterns[bestMove.ki][bestMove.di] = bestMove.nv;
  bestChi = bestMove.ch;
  totalChanges++;
  console.log(`#${round+1}: ${codes[bestMove.ki].padEnd(7)} ${DIM_ORDER[bestMove.di]} ${NUM_LEVEL[bestMove.oldV-1]}→${NUM_LEVEL[bestMove.nv-1]} chi²=${bestChi.toFixed(2)} (+${bestGain.toFixed(1)})`);
}

console.log(`\n贪心完成 ${totalChanges} 步，chi²=${bestChi.toFixed(2)}`);

// ━━━ 大样本验证 ━━━
const USERS_V = genUserLevels(50000, 99999);
const c0 = simulate(types.standard.map((t) => parsePatternNum(t.pattern)), USERS_V);
const c1 = simulate(patterns, USERS_V);
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

console.log("\n━━━ 验证 (N=50000) ━━━");
console.log(`现状    chi²=${chi0.toFixed(1)} max=${max0.toFixed(2)}% min=${min0.toFixed(2)}% ratio=${(max0/min0).toFixed(1)}x`);
console.log(`优化后  chi²=${chi1.toFixed(1)} max=${max1.toFixed(2)}% min=${min1.toFixed(2)}% ratio=${(max1/min1).toFixed(1)}x`);

console.log("\n━━━ pattern 改动汇总 ━━━");
for (let i = 0; i < codes.length; i++) {
  const before = types.standard[i].pattern;
  const after = [...patterns[i]].map((v) => NUM_LEVEL[v - 1]).join("-");
  if (before !== after) {
    // 标注哪些是锁定修正、哪些是优化
    const locked = LOCKED[codes[i]] || {};
    const parts = [];
    const bArr = before.replace(/-/g, "").split("");
    const aArr = after.replace(/-/g, "").split("");
    for (let di = 0; di < 6; di++) {
      if (bArr[di] !== aArr[di]) {
        parts.push(`${DIM_ORDER[di]} ${bArr[di]}→${aArr[di]}${locked[DIM_ORDER[di]] ? "(语义修正)" : "(优化)"}`);
      }
    }
    console.log(`  ${codes[i].padEnd(7)} ${before} → ${after}  [${parts.join(", ")}]`);
  }
}

console.log("\n━━━ 新分布 ━━━");
for (const e of e1) {
  const bar = "█".repeat(Math.round(e.pct * 3));
  console.log(`  ${e.code.padEnd(7)} ${e.pct.toFixed(2).padStart(5)}% ${bar}`);
}

const ps = { GUT: [0,0,0], TNG: [0,0,0], EYE: [0,0,0], LEG: [0,0,0], CRW: [0,0,0], SOUL: [0,0,0] };
for (let ki = 0; ki < patterns.length; ki++) {
  for (let di = 0; di < 6; di++) ps[DIM_ORDER[di]][patterns[ki][di] - 1]++;
}
console.log("\n━━━ 新 pattern 维度统计 ━━━");
for (const d of DIM_ORDER) console.log(`  ${d}: L=${ps[d][0]} M=${ps[d][1]} H=${ps[d][2]}`);

const FINAL = {};
for (let i = 0; i < codes.length; i++) {
  FINAL[codes[i]] = [...patterns[i]].map((v) => NUM_LEVEL[v - 1]).join("-");
}
fs.writeFileSync(path.join(ROOT, "sim/final_patterns_v2.json"), JSON.stringify(FINAL, null, 2));
console.log("\n最终写入 sim/final_patterns_v2.json");
