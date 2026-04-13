import { shuffle } from './utils.js'

/**
 * 答题控制器
 * 主题目随机洗牌 + 火锅彩蛋题固定放在最后一题
 */
export function createQuiz(questions, config, onComplete) {
  const hotpotGateQ = questions.special.find((q) => q.id === config.hotpotGate.questionId)

  let queue = []
  let current = 0
  let answers = {}
  let isHotpot = false

  const els = {
    fill: document.getElementById('progress-fill'),
    text: document.getElementById('progress-text'),
    qText: document.getElementById('question-text'),
    options: document.getElementById('options'),
  }

  function totalCount() {
    return queue.length
  }

  function updateProgress() {
    const pct = (current / totalCount()) * 100
    els.fill.style.width = pct + '%'
    els.text.textContent = `${current + 1} / ${totalCount()}`
  }

  function renderQuestion() {
    const q = queue[current]
    els.qText.textContent = q.text

    els.options.innerHTML = ''
    q.options.forEach((opt) => {
      const btn = document.createElement('button')
      btn.className = 'btn btn-option'
      btn.textContent = opt.label
      btn.addEventListener('click', () => selectOption(q, opt))
      els.options.appendChild(btn)
    })

    updateProgress()
  }

  function selectOption(question, option) {
    answers[question.id] = option.value

    // 火锅彩蛋检测：选了"火锅"触发 HOT-T
    if (question.id === config.hotpotGate.questionId && option.value === config.hotpotGate.triggerValue) {
      isHotpot = true
    }

    current++
    if (current >= totalCount()) {
      onComplete(answers, isHotpot)
    } else {
      renderQuestion()
    }
  }

  function buildQueue() {
    // 主题目随机洗牌 + 彩蛋题固定放在最后
    return [...shuffle(questions.main), hotpotGateQ]
  }

  function start() {
    current = 0
    answers = {}
    isHotpot = false
    queue = buildQueue()
    renderQuestion()
  }

  return { start, renderQuestion }
}
