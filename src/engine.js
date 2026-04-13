/**
 * EATI 评分引擎 — 纯函数，无 DOM 依赖
 */

/**
 * 按维度求和：每维度 4 题，分值相加 (范围 4-12)
 * @param {Object} answers  { q_gut1: 2, q_gut2: 1, ... }
 * @param {Array}  questions 题目定义数组
 * @returns {Object} { GUT: 10, TNG: 6, ... }
 */
export function calcDimensionScores(answers, questions) {
  const scores = {}
  for (const q of questions) {
    if (answers[q.id] == null) continue
    scores[q.dim] = (scores[q.dim] || 0) + answers[q.id]
  }
  return scores
}

/**
 * 原始分 → L/M/H 等级
 * @param {Object} scores      { GUT: 10, ... }
 * @param {Object} thresholds  { L: [4,6], M: [7,9], H: [10,12] }
 * @returns {Object} { GUT: 'H', TNG: 'L', ... }
 */
export function scoresToLevels(scores, thresholds) {
  const levels = {}
  for (const [dim, score] of Object.entries(scores)) {
    if (score <= thresholds.L[1]) levels[dim] = 'L'
    else if (score >= thresholds.H[0]) levels[dim] = 'H'
    else levels[dim] = 'M'
  }
  return levels
}

/**
 * 等级 → 数值 (L=1, M=2, H=3)
 */
const LEVEL_NUM = { L: 1, M: 2, H: 3 }

/**
 * 解析人格类型的 pattern 字符串
 * "H-H-L-M-M-L" → ['H','H','L','M','M','L']
 */
export function parsePattern(pattern) {
  return pattern.replace(/-/g, '').split('')
}

/**
 * 计算用户向量与类型 pattern 的曼哈顿距离
 * @param {Object} userLevels  { GUT: 'H', ... }
 * @param {Array}  dimOrder    ['GUT','TNG','EYE','LEG','CRW','SOUL']
 * @param {string} pattern     "H-H-L-M-M-L"
 * @param {number} maxDistance 归一化用的最大距离（默认 12 = 6 维 × 每维差 2）
 * @returns {{ distance: number, exact: number, similarity: number }}
 */
export function matchType(userLevels, dimOrder, pattern, maxDistance = 12) {
  const typeLevels = parsePattern(pattern)
  let distance = 0
  let exact = 0

  for (let i = 0; i < dimOrder.length; i++) {
    const userVal = LEVEL_NUM[userLevels[dimOrder[i]]] || 2
    const typeVal = LEVEL_NUM[typeLevels[i]] || 2
    const diff = Math.abs(userVal - typeVal)
    distance += diff
    if (diff === 0) exact++
  }

  const similarity = Math.max(0, Math.round((1 - distance / maxDistance) * 100))
  return { distance, exact, similarity }
}

/**
 * 匹配所有类型，排序，应用特殊覆盖
 * @param {Object}  userLevels   { GUT: 'H', ... }
 * @param {Array}   dimOrder     维度顺序
 * @param {Array}   standardTypes 标准类型数组
 * @param {Array}   specialTypes  特殊类型数组
 * @param {Object}  options      { isHotpot: boolean, maxDistance: number, fallbackThreshold: number }
 * @returns {{ primary: Object, secondary: Object|null, rankings: Array, mode: string }}
 */
export function determineResult(userLevels, dimOrder, standardTypes, specialTypes, options = {}) {
  const maxDistance = options.maxDistance || 12
  const fallbackThreshold = options.fallbackThreshold || 60

  const rankings = standardTypes.map((type) => ({
    ...type,
    ...matchType(userLevels, dimOrder, type.pattern, maxDistance),
  }))

  // 排序：距离升序 → 精准命中降序 → 相似度降序
  rankings.sort((a, b) => a.distance - b.distance || b.exact - a.exact || b.similarity - a.similarity)

  const best = rankings[0]
  const hotpot = specialTypes.find((t) => t.code === 'HOT-T')
  const fallback = specialTypes.find((t) => t.code === '404')

  // 火锅教祖彩蛋覆盖
  if (options.isHotpot && hotpot) {
    return {
      primary: { ...hotpot, similarity: best.similarity, exact: best.exact },
      secondary: best,
      rankings,
      mode: 'hotpot',
    }
  }

  // 404 兜底
  if (best.similarity < fallbackThreshold && fallback) {
    return {
      primary: { ...fallback, similarity: best.similarity, exact: best.exact },
      secondary: best,
      rankings,
      mode: 'fallback',
    }
  }

  return {
    primary: best,
    secondary: rankings[1] || null,
    rankings,
    mode: 'normal',
  }
}
