#!/usr/bin/env node
/**
 * 检查优化后人格 pattern 两两区分度
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FINAL = JSON.parse(fs.readFileSync(path.join(ROOT, "sim/final_patterns_v2.json"), "utf8"));

const codes = Object.keys(FINAL);
const LEVEL_NUM = { L: 1, M: 2, H: 3 };
function parse(p) { return p.replace(/-/g, "").split("").map((c) => LEVEL_NUM[c]); }

const patterns = codes.map((c) => ({ code: c, nums: parse(FINAL[c]), str: FINAL[c] }));

console.log("━━━ 最终 pattern ━━━");
for (const p of patterns) console.log(`  ${p.code.padEnd(7)} ${p.str}`);

console.log("\n━━━ 相同/极近 pattern 检测 ━━━");
const dups = [];
const near = [];
for (let i = 0; i < patterns.length; i++) {
  for (let j = i + 1; j < patterns.length; j++) {
    const d = patterns[i].nums.reduce((s, v, k) => s + Math.abs(v - patterns[j].nums[k]), 0);
    if (d === 0) dups.push(`${patterns[i].code} = ${patterns[j].code}  (${patterns[i].str})`);
    else if (d <= 2) near.push({ pair: `${patterns[i].code} ↔ ${patterns[j].code}`, d, a: patterns[i].str, b: patterns[j].str });
  }
}
if (dups.length === 0) console.log("  无重复 ✓");
else for (const d of dups) console.log(`  ❌ 重复: ${d}`);

console.log("\n━━━ 距离 ≤2 的近邻 pair（潜在抢占）━━━");
near.sort((a, b) => a.d - b.d);
for (const n of near) console.log(`  d=${n.d}  ${n.pair.padEnd(20)} ${n.a}  vs  ${n.b}`);
