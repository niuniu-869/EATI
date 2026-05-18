/**
 * Fisher-Yates 洗牌算法
 */
export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * 在数组的随机位置插入元素
 */
export function insertAtRandom(arr, item) {
  const a = [...arr]
  const idx = Math.floor(Math.random() * (a.length + 1))
  a.splice(idx, 0, item)
  return a
}

/**
 * 在指定元素后面插入新元素
 */
export function insertAfter(arr, afterId, item) {
  const a = [...arr]
  const idx = a.findIndex((q) => q.id === afterId)
  if (idx >= 0) a.splice(idx + 1, 0, item)
  return a
}

/**
 * 配图 URL：BASE_URL + cfg/<kind>/<name>.webp
 * kind 为 'q'（题图）或 'type'（人格图）
 */
export function cfgImg(kind, name) {
  return `${import.meta.env.BASE_URL}cfg/${kind}/${name}.webp`
}

/**
 * 人格 code → 配图文件名 slug（须与 _configgen 生成脚本保持一致）
 * 例：'TAO-T' → 'tao_t'，'W0K!' → 'w0k'
 */
export function typeSlug(code) {
  return String(code).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'x'
}
