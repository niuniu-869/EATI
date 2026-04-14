#!/usr/bin/env node
/**
 * EATI 人格分布 Monte Carlo 模拟
 * 目的：用数据验证当前系统是否存在人格命中不均衡，并对比修复方案
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
const LEVEL_SCORE = { L: 5.5, M: 8, H: 10.5 }; // 档位中心分，用于方案 A

function parsePattern(p) {
  return p.replace(/-/g, "").split("");
}

// ───── 当前算法（离散档位距离） ─────
function matchDiscrete(userLevels, pattern, maxDistance = 12) {
  const typeLevels = parsePattern(pattern);
  let distance = 0;
  let exact = 0;
  for (let i = 0; i < DIM_ORDER.length; i++) {
    const u = LEVEL_NUM[userLevels[DIM_ORDER[i]]] || 2;
    const t = LEVEL_NUM[typeLevels[i]] || 2;
    const diff = Math.abs(u - t);
    distance += diff;
    if (diff === 0) exact++;
  }
  return { distance, exact, similarity: Math.max(0, Math.round((1 - distance / maxDistance) * 100)) };
}

// ───── 方案 A：连续分匹配 ─────
function matchContinuous(userScores, pattern, maxDistance = 39) {
  const typeLevels = parsePattern(pattern);
  let distance = 0;
  for (let i = 0; i < DIM_ORDER.length; i++) {
    const u = userScores[DIM_ORDER[i]] ?? 8;
    const t = LEVEL_SCORE[typeLevels[i]] ?? 8;
    distance += Math.abs(u - t);
  }
  return { distance, similarity: Math.max(0, Math.round((1 - distance / maxDistance) * 100)) };
}

function scoresToLevels(scores, thresholds) {
  const levels = {};
  for (const [dim, s] of Object.entries(scores)) {
    if (s <= thresholds.L[1]) levels[dim] = "L";
    else if (s >= thresholds.H[0]) levels[dim] = "H";
    else levels[dim] = "M";
  }
  return levels;
}

function calcScores(answers) {
  const scores = {};
  for (const q of questions.main) {
    scores[q.dim] = (scores[q.dim] || 0) + answers[q.id];
  }
  return scores;
}

// ───── 模拟一次测试 ─────
function simulateOnce(mode, thresholds, fallbackThreshold = 60) {
  const answers = {};
  for (const q of questions.main) {
    // 均匀随机：1/2/3 概率均为 1/3
    answers[q.id] = 1 + Math.floor(Math.random() * 3);
  }
  const scores = calcScores(answers);
  const levels = scoresToLevels(scores, thresholds);

  const rankings = types.standard.map((t) => {
    const m = mode === "discrete"
      ? matchDiscrete(levels, t.pattern, 12)
      : matchContinuous(scores, t.pattern, 39);
    return { code: t.code, ...m };
  });
  rankings.sort((a, b) => a.distance - b.distance || (b.exact || 0) - (a.exact || 0) || b.similarity - a.similarity);

  const best = rankings[0];
  if (best.similarity < fallbackThreshold) return { code: "404", similarity: best.similarity, levels, scores };
  return { code: best.code, similarity: best.similarity, levels, scores };
}

// ───── 分布分析 ─────
function distribution(mode, thresholds, fallbackThreshold, N = 50000) {
  const counts = {};
  const simSum = {};
  const dimLevelCounts = { GUT: { L: 0, M: 0, H: 0 }, TNG: { L: 0, M: 0, H: 0 }, EYE: { L: 0, M: 0, H: 0 }, LEG: { L: 0, M: 0, H: 0 }, CRW: { L: 0, M: 0, H: 0 }, SOUL: { L: 0, M: 0, H: 0 } };
  for (let i = 0; i < N; i++) {
    const r = simulateOnce(mode, thresholds, fallbackThreshold);
    counts[r.code] = (counts[r.code] || 0) + 1;
    simSum[r.code] = (simSum[r.code] || 0) + r.similarity;
    for (const d of DIM_ORDER) dimLevelCounts[d][r.levels[d]]++;
  }
  const entries = Object.entries(counts).map(([code, n]) => ({
    code,
    pct: (n / N * 100),
    avgSim: simSum[code] / n,
  }));
  entries.sort((a, b) => b.pct - a.pct);
  return { entries, dimLevelCounts, N };
}

// ───── 评估指标 ─────
function evaluate(dist) {
  const standardCodes = types.standard.map((t) => t.code);
  const pcts = standardCodes.map((c) => dist.entries.find((e) => e.code === c)?.pct ?? 0);
  const ideal = 100 / standardCodes.length; // 23 人格的理想均匀概率 ≈ 4.35%
  // Chi-square-like metric
  const chi = pcts.reduce((s, p) => s + Math.pow(p - ideal, 2), 0);
  // Entropy (higher = more uniform)
  const total = pcts.reduce((a, b) => a + b, 0) || 1;
  const entropy = -pcts.reduce((s, p) => {
    const q = p / total;
    return q > 0 ? s + q * Math.log2(q) : s;
  }, 0);
  const maxEntropy = Math.log2(standardCodes.length);
  const fallback = dist.entries.find((e) => e.code === "404")?.pct ?? 0;
  const zeros = pcts.filter((p) => p < 0.5).length;
  const max = Math.max(...pcts);
  const min = Math.min(...pcts);
  return { chi, entropy, entropyRatio: entropy / maxEntropy, fallback, zeros, max, min, ratio: max / (min || 0.01) };
}

function printReport(title, dist) {
  const ev = evaluate(dist);
  console.log(`\n━━━ ${title} (N=${dist.N}) ━━━`);
  console.log(`Fallback 404: ${ev.fallback.toFixed(2)}%`);
  console.log(`Max=${ev.max.toFixed(2)}% Min=${ev.min.toFixed(2)}% Ratio=${ev.ratio.toFixed(1)}x ZeroHits=${ev.zeros}`);
  console.log(`Entropy=${ev.entropy.toFixed(3)}/${Math.log2(23).toFixed(3)} (${(ev.entropyRatio * 100).toFixed(1)}% uniform)`);
  console.log(`ChiSq=${ev.chi.toFixed(2)} (lower=更均衡, 理想=0)`);
  console.log("\n人格命中分布（降序）:");
  for (const e of dist.entries) {
    const bar = "█".repeat(Math.round(e.pct * 2));
    console.log(`  ${e.code.padEnd(7)} ${e.pct.toFixed(2).padStart(5)}%  avgSim=${e.avgSim.toFixed(1)}%  ${bar}`);
  }
  console.log("\n维度分档分布（用户端）:");
  for (const d of DIM_ORDER) {
    const c = dist.dimLevelCounts[d];
    const total = c.L + c.M + c.H;
    console.log(`  ${d}: L=${(c.L / total * 100).toFixed(1)}% M=${(c.M / total * 100).toFixed(1)}% H=${(c.H / total * 100).toFixed(1)}%`);
  }
  return ev;
}

// ───── Pattern 统计 ─────
console.log("━━━ 人格 Pattern 分布统计 ━━━");
const patternStats = { GUT: { L: 0, M: 0, H: 0 }, TNG: { L: 0, M: 0, H: 0 }, EYE: { L: 0, M: 0, H: 0 }, LEG: { L: 0, M: 0, H: 0 }, CRW: { L: 0, M: 0, H: 0 }, SOUL: { L: 0, M: 0, H: 0 } };
for (const t of types.standard) {
  const p = parsePattern(t.pattern);
  for (let i = 0; i < 6; i++) patternStats[DIM_ORDER[i]][p[i]]++;
}
for (const d of DIM_ORDER) {
  const s = patternStats[d];
  console.log(`  ${d}: L=${s.L} M=${s.M} H=${s.H}`);
}

// ───── 运行对比 ─────
const CUR_THRESH = config.scoring.levelThresholds;
const OLD_THRESH = { L: [4, 6], M: [7, 9], H: [10, 12] };

const N = 50000;
console.log(`\n\n================= 模拟结果 (N=${N}) =================`);

// 现状：当前阈值 + 离散匹配
const d1 = distribution("discrete", CUR_THRESH, 60, N);
const ev1 = printReport("【现状】阈值 L[4,7]/M[8,8]/H[9,12] + 离散档位匹配", d1);

// 方案 A：当前阈值 + 连续分匹配
const d2 = distribution("continuous", CUR_THRESH, 60, N);
const ev2 = printReport("【方案 A】同阈值 + 连续分匹配 (maxDist=39, fallback=60)", d2);

// 方案 A2：连续分匹配 + 降低 fallback 阈值
const d3 = distribution("continuous", CUR_THRESH, 50, N);
const ev3 = printReport("【方案 A2】连续分匹配 + fallback=50", d3);

// 方案 A3：旧阈值（宽 M）+ 连续分
const d4 = distribution("continuous", OLD_THRESH, 50, N);
const ev4 = printReport("【方案 A3】阈值 L[4,6]/M[7,9]/H[10,12] + 连续分 + fallback=50", d4);

console.log("\n\n━━━ 方案对比 ━━━");
console.log("方案           | ChiSq    | Entropy% | 404%   | Max%   | Min%   | Zeros | Max/Min");
console.log("现状           | " + [ev1.chi.toFixed(1), ev1.entropyRatio * 100 | 0, ev1.fallback.toFixed(1), ev1.max.toFixed(1), ev1.min.toFixed(1), ev1.zeros, ev1.ratio.toFixed(1)].join("\t| "));
console.log("方案 A         | " + [ev2.chi.toFixed(1), ev2.entropyRatio * 100 | 0, ev2.fallback.toFixed(1), ev2.max.toFixed(1), ev2.min.toFixed(1), ev2.zeros, ev2.ratio.toFixed(1)].join("\t| "));
console.log("方案 A2        | " + [ev3.chi.toFixed(1), ev3.entropyRatio * 100 | 0, ev3.fallback.toFixed(1), ev3.max.toFixed(1), ev3.min.toFixed(1), ev3.zeros, ev3.ratio.toFixed(1)].join("\t| "));
console.log("方案 A3        | " + [ev4.chi.toFixed(1), ev4.entropyRatio * 100 | 0, ev4.fallback.toFixed(1), ev4.max.toFixed(1), ev4.min.toFixed(1), ev4.zeros, ev4.ratio.toFixed(1)].join("\t| "));
