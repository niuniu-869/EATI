import { shuffle } from './utils.js'

/**
 * 答题控制器 —— 单题沉浸 + 键盘 + 滑动 + 震动反馈
 * 主题目随机洗牌 + 火锅彩蛋题固定放在最后一题
 */

const DIM_EMOJI = {
  GUT: '🍚',
  TNG: '🌶️',
  EYE: '📸',
  LEG: '🚶',
  CRW: '👥',
  SOUL: '💭',
}
const SPECIAL_EMOJI = '🍲'
const LETTERS = ['A', 'B', 'C', 'D', 'E']
const LOCK_MS = 380   // 选中后锁定时长（动画 + 切题）
const VIBRATE_MS = 12

export function createQuiz(questions, config, onComplete) {
  const hotpotGateQ = questions.special.find((q) => q.id === config.hotpotGate.questionId)

  let queue = []
  let current = 0
  let answers = {}
  let isHotpot = false
  let locked = false

  const els = {
    dots: document.getElementById('progress-dots'),
    text: document.getElementById('progress-text'),
    pct: document.getElementById('progress-pct'),
    area: document.getElementById('question-area'),
    qNo: document.getElementById('question-no'),
    qText: document.getElementById('question-text'),
    qEmoji: document.getElementById('question-emoji'),
    options: document.getElementById('options'),
  }

  function totalCount() { return queue.length }

  function renderProgressDots() {
    const total = totalCount()
    els.dots.innerHTML = ''
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('span')
      dot.className = 'dot'
      if (i < current) dot.classList.add('done')
      if (i === current) dot.classList.add('active')
      els.dots.appendChild(dot)
    }
  }

  function updateProgress() {
    const total = totalCount()
    const pct = Math.round((current / total) * 100)
    els.text.textContent = `Q.${String(current + 1).padStart(2, '0')} / ${total}`
    els.pct.textContent = pct + '%'
    renderProgressDots()
  }

  function renderQuestion(enterAnim = true) {
    const q = queue[current]
    const isSpecial = !!q.special

    els.qNo.textContent = isSpecial
      ? `Q.${String(current + 1).padStart(2, '0')} · 彩蛋题`
      : `Q.${String(current + 1).padStart(2, '0')} · 档案收录`

    els.qText.textContent = q.text
    els.qEmoji.textContent = isSpecial ? SPECIAL_EMOJI : (DIM_EMOJI[q.dim] || '🍽️')

    // 渲染选项
    els.options.innerHTML = ''
    q.options.forEach((opt, i) => {
      const btn = document.createElement('button')
      btn.className = 'btn-option'
      btn.type = 'button'
      btn.dataset.idx = String(i)
      btn.innerHTML = `
        <span class="opt-letter">${LETTERS[i] || '?'}</span>
        <span class="opt-text">${escapeHTML(opt.label)}</span>
      `
      btn.addEventListener('click', () => selectOption(q, opt, btn))
      els.options.appendChild(btn)
    })

    updateProgress()

    if (enterAnim) {
      els.area.classList.remove('leaving')
      els.area.classList.add('entering')
      setTimeout(() => els.area.classList.remove('entering'), 360)
    }
  }

  function selectOption(question, option, btn) {
    if (locked) return
    locked = true

    answers[question.id] = option.value

    // 火锅彩蛋检测
    if (question.id === config.hotpotGate.questionId && option.value === config.hotpotGate.triggerValue) {
      isHotpot = true
    }

    // 视觉反馈
    if (btn) btn.classList.add('picked')
    if (navigator.vibrate) {
      try { navigator.vibrate(VIBRATE_MS) } catch (_) {}
    }

    // 延迟切题 + 左滑过渡
    setTimeout(() => {
      els.area.classList.add('leaving')
      setTimeout(() => {
        els.area.classList.remove('leaving')
        current++
        if (current >= totalCount()) {
          onComplete(answers, isHotpot)
        } else {
          renderQuestion(true)
          locked = false
        }
      }, 240)
    }, LOCK_MS - 240)
  }

  function buildQueue() {
    return [...shuffle(questions.main), hotpotGateQ]
  }

  // 键盘 A/B/C 直选
  function onKey(e) {
    if (document.getElementById('page-quiz')?.classList.contains('active') === false) return
    if (locked) return
    const key = e.key.toUpperCase()
    const idx = LETTERS.indexOf(key)
    if (idx < 0) return
    const btn = els.options.querySelector(`.btn-option[data-idx="${idx}"]`)
    if (btn) btn.click()
  }

  // 触屏滑动：向左滑超过阈值 = 当前选项是 B（居中最快切题）；可选关闭避免误触
  // 这里实现为纯视觉提示，不再自动切选项（更安全）
  let touchStartX = null
  function onTouchStart(e) { touchStartX = e.touches[0].clientX }
  function onTouchEnd(e) {
    if (touchStartX == null) return
    const dx = e.changedTouches[0].clientX - touchStartX
    touchStartX = null
    if (Math.abs(dx) < 60) return
    // 小幅提示
    els.area.style.transition = 'transform 0.15s ease'
    els.area.style.transform = `translateX(${dx < 0 ? -6 : 6}px)`
    setTimeout(() => { els.area.style.transform = '' }, 160)
  }

  function start() {
    current = 0
    answers = {}
    isHotpot = false
    locked = false
    queue = buildQueue()
    renderQuestion(false)

    // 仅注册一次全局监听
    if (!start._bound) {
      start._bound = true
      document.addEventListener('keydown', onKey)
      els.area.addEventListener('touchstart', onTouchStart, { passive: true })
      els.area.addEventListener('touchend', onTouchEnd, { passive: true })
    }
  }

  return { start, renderQuestion }
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]))
}
