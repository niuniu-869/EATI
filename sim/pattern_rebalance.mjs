#!/usr/bin/env node
/**
 * 探索「重新平衡 pattern 分布」方案
 * 用户均匀答题下每维 L=38% M=24% H=38%
 * 理想 23 人格 pattern 分布应匹配此比例：L≈8.7, M≈5.5, H≈8.7
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

function parsePattern(p) { return p.replace(/-/g, "").split(""); }

function matchDiscrete(userLevels, pattern) {
  const t = parsePattern(pattern);
  let dist = 0, exact = 0;
  for (let i = 0; i < 6; i++) {
    const u = LEVEL_NUM[userLevels[DIM_ORDER[i]]] || 2;
    const tv = LEVEL_NUM[t[i]] || 2;
    const d = Math.abs(u - tv);
    dist += d;
    if (d === 0) exact++;
  }
  return { distance: dist, exact, similarity: Math.max(0, Math.round((1 - dist / 12) * 100)) };
}

function scoresToLevels(scores, th) {
  const o = {};
  for (const [d, s] of Object.entries(scores)) {
    if (s <= th.L[1]) o[d] = "L";
    else if (s >= th.H[0]) o[d] = "M"; // typo fix below
    else o[d] = "M";
  }
  // correct:
  for (const [d, s] of Object.entries(scores)) {
    if (s <= th.L[1]) o[d] = "L";
    else if (s >= th.H[0]) o[d] = "H";
    else o[d] = "M";
  }
  return o;
}

function calcScores(ans) {
  const o = {};
  for (const q of questions.main) o[q.dim] = (o[q.dim] || 0) + ans[q.id];
  return o;
}

function simulateBatch(standardTypes, threshold, fallbackTh, N) {
  const counts = {};
  for (let i = 0; i < N; i++) {
    const ans = {};
    for (const q of questions.main) ans[q.id] = 1 + Math.floor(Math.random() * 3);
    const scores = calcScores(ans);
    const levels = scoresToLevels(scores, threshold);
    const rankings = standardTypes.map((t) => ({ code: t.code, ...matchDiscrete(levels, t.pattern) }));
    rankings.sort((a, b) => a.distance - b.distance || b.exact - a.exact || b.similarity - a.similarity);
    const best = rankings[0];
    const code = best.similarity < fallbackTh ? "404" : best.code;
    counts[code] = (counts[code] || 0) + 1;
  }
  return counts;
}

function analyze(counts, N, standardCount = 23) {
  const entries = Object.entries(counts).map(([c, n]) => ({ code: c, pct: n / N * 100 }));
  entries.sort((a, b) => b.pct - a.pct);
  const std = entries.filter((e) => e.code !== "404");
  const ideal = 100 / standardCount;
  const chi = std.reduce((s, e) => s + Math.pow(e.pct - ideal, 2), 0)
    + standardCount - std.length; // missing entries count 0
  const pcts = std.map((e) => e.pct);
  const max = Math.max(...pcts, 0);
  const min = std.length < standardCount ? 0 : Math.min(...pcts);
  const zeros = standardCount - std.length + pcts.filter((p) => p < 0.5).length;
  return { entries, chi, max, min, zeros, fallback: counts["404"] ? counts["404"] / N * 100 : 0 };
}

function patternStats(typesArr) {
  const s = { GUT: { L: 0, M: 0, H: 0 }, TNG: { L: 0, M: 0, H: 0 }, EYE: { L: 0, M: 0, H: 0 }, LEG: { L: 0, M: 0, H: 0 }, CRW: { L: 0, M: 0, H: 0 }, SOUL: { L: 0, M: 0, H: 0 } };
  for (const t of typesArr) {
    const p = parsePattern(t.pattern);
    for (let i = 0; i < 6; i++) s[DIM_ORDER[i]][p[i]]++;
  }
  return s;
}

const CUR = config.scoring.levelThresholds;
const N = 50000;

console.log("━━━ 当前 pattern 统计 ━━━");
const ps0 = patternStats(types.standard);
for (const d of DIM_ORDER) console.log(`  ${d}: L=${ps0[d].L} M=${ps0[d].M} H=${ps0[d].H}`);

// ━━━ 现状 baseline ━━━
const baseCounts = simulateBatch(types.standard, CUR, 60, N);
const base = analyze(baseCounts, N);
console.log(`\n现状: chi=${base.chi.toFixed(1)} max=${base.max.toFixed(1)}% min=${base.min.toFixed(1)}% fallback=${base.fallback.toFixed(1)}%`);
console.log("Top5 / Bottom5:");
base.entries.slice(0, 5).forEach((e) => console.log(`  TOP ${e.code}: ${e.pct.toFixed(2)}%`));
base.entries.slice(-5).forEach((e) => console.log(`  BOT ${e.code}: ${e.pct.toFixed(2)}%`));

// ━━━ 基于数据诊断：哪些 pattern 需要调整 ━━━
// 理想比例：L≈38%*23=8.74, M≈24%*23=5.52, H≈38%*23=8.74
console.log("\n━━━ pattern 总量 vs 理想值 (用户端 L=38% M=24% H=38%) ━━━");
for (const d of DIM_ORDER) {
  const s = ps0[d];
  const tot = s.L + s.M + s.H;
  const pl = s.L / tot * 100, pm = s.M / tot * 100, ph = s.H / tot * 100;
  const devL = pl - 38, devM = pm - 24, devH = ph - 38;
  console.log(`  ${d}: L=${pl.toFixed(0)}%(${devL > 0 ? "+" : ""}${devL.toFixed(0)}) M=${pm.toFixed(0)}%(${devM > 0 ? "+" : ""}${devM.toFixed(0)}) H=${ph.toFixed(0)}%(${devH > 0 ? "+" : ""}${devH.toFixed(0)})`);
}

// ━━━ 方案 B：手工重新平衡 pattern ━━━
// 原则：保留人格核心语义，只改边缘的 M→L/H 或 L/H→M
// 目标每维分布：L≈9 M≈5 H≈9
const rebalanced = JSON.parse(JSON.stringify(types.standard));
// 查表并修改：保持语义前提下微调
const patchMap = {
  // GUT: 当前 L=6 M=11 H=6 → 目标 L=9 M=5 H=9
  // 把"边缘 M" GUT 改成 L 或 H
  "ROAR":   "M-H-L-L-M-M", // 霸王龙食肉，胃口应是 H（大量吃肉）
  "XENO":   "M-H-M-H-L-H", // 猎奇党，胃量未必大，保持 M
  "ONLY-1": "M-H-H-H-L-M", // 孤独美食家，食量正常
  "PAIR":   "M-M-M-M-M-H", // 饭搭子：独处CRW应L才符合描述；但描述是"一个人不吃"=CRW-L? 实际:PAIR不喜欢独处=CRW-L但饭局中不是气氛担当 → CRW=L
  "LINE":   "M-M-H-H-H-M", // 网红打卡：食量普通，不改
  "LOFI":   "H-H-L-H-L-L", // 下水道：能吃（深夜摊常吃多）→改 H
  "SPIC-Y": "H-H-M-M-M-H", // 辣党:能吃辣通常胃口好 → H
  "ZZZZ":   "L-M-L-L-M-L", // 无欲吃饭:吃得少 → L
  "REWD":   "M-L-H-M-M-H", // 奖励型：食量中等但口味未必重 → TNG=L
  "K-OL":   "M-H-H-H-H-H", // 保持
  // TNG: L=4 M=8 H=11 → 目标 L=9 M=5 H=9
  // 把"可 M 可 L 的"改成 L
  "ROAR_t": "M-L-L-L-M-M", // 霸王龙不一定重口，改 TNG-L（肉不等于辣）但要保食肉身份 → 不改
  // 实际策略：把一些 TNG=H 的改成 M 或 L
  // 候选：ROAR(爱肉不重口)、SWEET(甜不是辣,可L)、W0K!(妈味清淡,可L)...
  // SWEET 当前 L-H-H-M-M-H，TNG 改 L (甜≠辣)
  "SWEET":  "L-L-H-M-M-H",
  // W0K! 妈味是清淡温和 → TNG=L 不变 (已经是L)
  // EYE: L=9 M=6 H=8 基本均衡
  // LEG: L=9 M=8 H=6 → 需要+3 H
  "M15":    "H-H-L-H-H-H", // 夜宵会跑 → LEG H
  // EMO-T 当前 H-H-M-M-L-H
  "EMO-T":  "H-H-M-H-L-H", // 情绪化进食会去远处买安慰品 → LEG H
  // CRW: L=8 M=10 H=5 → +4 H
  // 候选改 M→H 的：REWD(奖励型爱请客), DI-ET(减肥人爱拉群), TAO-T(大胃王爱炫耀), SWEET(甜党喜欢分享甜点)
  "TAO-T":  "H-H-L-M-H-L", // 饕餮爱吃饭局
  "DI-ET":  "H-H-H-M-H-H", // 减肥诈骗犯爱朋友圈打卡
  "666":    "H-M-L-L-H-L", // 已是 H
  "M15_c":  "H-H-L-H-H-H", // already
  // SOUL: L=5 M=6 H=12 → 减 3 H 加 3 L
  // 候选改 H→M 的：REWD(奖励型,未必情绪化), XENO(猎奇党重理性探索非情绪)
  "XENO":   "M-H-M-H-L-M", // 改 SOUL M
  "REWD":   "M-L-H-M-H-M", // SOUL 改 M
  // SWEET SOUL H 改 L？甜党是"快乐型" → SOUL 可 M
  "SWEET_s":"L-L-H-M-M-M",
  "DI-ET_s":"H-H-H-M-H-M", // 改 SOUL M
  // M15 SOUL H 保留（夜宵情绪化）
  // K-OL SOUL H 改 M（打卡更多是虚荣而非情绪）
  "K-OL_s": "M-H-H-H-H-M",
};

// 实际应用修改（合并多处修改到最终 pattern）
const FINAL = {
  "TAO-T":  "H-H-L-M-H-L",
  "BIRD":   "L-L-M-L-L-L",
  "ROAR":   "H-H-L-L-M-M",   // GUT M→H (霸王龙能吃)
  "LEAF":   "L-L-H-L-L-H",
  "XENO":   "M-H-M-H-L-M",   // SOUL H→M
  "PICKY":  "L-L-L-L-M-M",
  "666":    "H-M-L-L-H-L",
  "NICE":   "L-M-H-H-M-H",
  "ONLY-1": "M-H-H-H-L-M",
  "PAIR":   "M-M-M-M-L-H",   // CRW H→L (社恐要饭搭子)
  "LINE":   "M-M-H-H-H-M",
  "LOFI":   "H-H-L-H-L-L",   // GUT M→H (夜摊能吃)
  "SPIC-Y": "H-H-M-M-M-H",   // GUT M→H (爱辣的一般食量可以)
  "SWEET":  "L-L-H-M-H-M",   // TNG H→L, CRW M→H, SOUL H→M
  "W0K!":   "M-L-M-L-L-H",
  "DELE":   "H-M-L-L-M-M",
  "M15":    "H-H-L-H-H-H",   // LEG M→H
  "EMO-T":  "H-H-M-H-L-H",   // LEG M→H
  "DI-ET":  "H-H-H-M-H-M",   // CRW M→H, SOUL H→M
  "ZZZZ":   "L-M-L-L-M-L",   // GUT M→L
  "REWD":   "M-L-H-M-H-M",   // TNG M→L, CRW M→H, SOUL H→M
  "K-OL":   "M-H-H-H-H-M",   // SOUL H→M
  "ISO-8":  "L-M-L-L-L-M",
};

for (const t of rebalanced) {
  if (FINAL[t.code]) t.pattern = FINAL[t.code];
}

console.log("\n━━━ 重平衡后 pattern 统计 ━━━");
const ps1 = patternStats(rebalanced);
for (const d of DIM_ORDER) {
  const s = ps1[d];
  const tot = s.L + s.M + s.H;
  const pl = s.L / tot * 100, pm = s.M / tot * 100, ph = s.H / tot * 100;
  console.log(`  ${d}: L=${s.L}(${pl.toFixed(0)}%) M=${s.M}(${pm.toFixed(0)}%) H=${s.H}(${ph.toFixed(0)}%)`);
}

const rbCounts = simulateBatch(rebalanced, CUR, 60, N);
const rb = analyze(rbCounts, N);
console.log(`\n重平衡 chi=${rb.chi.toFixed(1)} max=${rb.max.toFixed(1)}% min=${rb.min.toFixed(1)}% fallback=${rb.fallback.toFixed(1)}%`);
console.log("完整分布:");
rb.entries.forEach((e) => {
  const bar = "█".repeat(Math.round(e.pct * 2));
  console.log(`  ${e.code.padEnd(7)} ${e.pct.toFixed(2).padStart(5)}% ${bar}`);
});

console.log("\n━━━ 对比 ━━━");
console.log(`现状  chi=${base.chi.toFixed(1)} max=${base.max.toFixed(1)}% min=${base.min.toFixed(1)}% ratio=${(base.max/base.min).toFixed(1)}x fallback=${base.fallback.toFixed(1)}%`);
console.log(`重平衡 chi=${rb.chi.toFixed(1)} max=${rb.max.toFixed(1)}% min=${rb.min.toFixed(1)}% ratio=${(rb.max/rb.min).toFixed(1)}x fallback=${rb.fallback.toFixed(1)}%`);
