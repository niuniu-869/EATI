import { drawRadar } from "./chart.js";
import { generateShareImage } from "./share.js";

const LEVEL_LABEL = { L: "低", M: "中", H: "高" };
const LEVEL_STARS = { L: "★", M: "★★", H: "★★★" };
const DIM_EMOJI = {
  GUT: "🥢",
  TNG: "👅",
  EYE: "👀",
  LEG: "🦵",
  CRW: "👥",
  SOUL: "✨",
};

/**
 * 根据 hex 派生深一档颜色（用于 hover / 阴影）
 */
function darken(hex, amount = 0.18) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const int = parseInt(m[1], 16);
  const r = Math.max(0, Math.round(((int >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.round(((int >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.round((int & 0xff) * (1 - amount)));
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

export function renderResult(
  result,
  userLevels,
  userScores,
  dimOrder,
  dimDefs,
  config,
) {
  const { primary, secondary, rankings, mode } = result;

  // ━━━ 主题色注入 ━━━
  const themeColor = primary.themeColor || "#FF5B3E";
  const themeDeep = darken(themeColor, 0.18);
  const body = document.body;
  body.setAttribute("data-persona", primary.code);
  body.style.setProperty("--theme-c", themeColor);
  body.style.setProperty("--theme-d", themeDeep);

  // ━━━ Kicker ━━━
  const kicker = document.getElementById("result-kicker");
  if (mode === "hotpot") kicker.textContent = "🔥 火锅教祖已激活";
  else if (mode === "fallback") kicker.textContent = "404 SYSTEM OVERRIDE";
  else kicker.textContent = "档案生成 / COMPLETE";

  const labelKicker = document.getElementById("result-label-kicker");
  if (labelKicker) {
    labelKicker.textContent =
      mode === "hotpot"
        ? "隐藏食格"
        : mode === "fallback"
          ? "兜底食格"
          : "你的主食格";
  }

  // ━━━ 主类型 Code：字母逐个掉落 ━━━
  const codeEl = document.getElementById("result-code");
  codeEl.innerHTML = "";
  const chars = String(primary.code).split("");
  chars.forEach((ch, i) => {
    const span = document.createElement("span");
    span.className = "char";
    span.textContent = ch;
    span.style.animationDelay = `${i * 65}ms`;
    codeEl.appendChild(span);
  });

  // ━━━ 人格名 ━━━
  document.getElementById("result-name").textContent = primary.cn;

  // ━━━ Emoji 贴纸 ━━━
  const stickers = document.getElementById("result-stickers");
  const emojis = primary.emoji || ["🍽️"];
  stickers.innerHTML = emojis.map((e) => `<span>${e}</span>`).join("");

  // ━━━ 印章式匹配度 ━━━
  const totalDims = dimOrder.length;
  const stamp = document.getElementById("result-badge");
  stamp.innerHTML =
    primary.exact != null
      ? `匹配度 ${primary.similarity}% · 精准 ${primary.exact}/${totalDims}`
      : `匹配度 ${primary.similarity}%`;

  // ━━━ Intro & 描述 ━━━
  document.getElementById("result-intro").textContent = primary.intro || "";
  document.getElementById("result-desc").textContent = primary.desc || "";

  // ━━━ 次要匹配（hotpot/fallback 模式） ━━━
  const secEl = document.getElementById("result-secondary");
  if (secondary && (mode === "hotpot" || mode === "fallback")) {
    secEl.style.display = "";
    document.getElementById("secondary-info").textContent =
      `${secondary.code}（${secondary.cn}）· 匹配度 ${secondary.similarity}%`;
  } else {
    secEl.style.display = "none";
  }

  // ━━━ SVG 雷达图（用原始分数渲染连续值，避免六边形） ━━━
  const radarWrap = document.getElementById("radar-wrap");
  drawRadar(radarWrap, userLevels, userScores, dimOrder, dimDefs, themeColor);

  // ━━━ 维度详情 ━━━
  const detailEl = document.getElementById("dimensions-detail");
  detailEl.innerHTML = "";
  for (const dim of dimOrder) {
    const level = userLevels[dim] || "M";
    const def = dimDefs[dim];
    if (!def) continue;

    const row = document.createElement("div");
    row.className = "dim-row";
    const shortName = (def.name || dim).replace(/^[A-Za-z0-9\s]+/, "").trim();
    row.innerHTML = `
      <div class="dim-header">
        <span class="dim-name"><span class="dim-emoji">${DIM_EMOJI[dim] || "●"}</span>${escapeHTML(shortName || dim)}</span>
        <span class="dim-level level-${level}">
          <span class="dim-stars">${LEVEL_STARS[level]}</span>
          ${LEVEL_LABEL[level]}
        </span>
      </div>
      <div class="dim-desc">${escapeHTML(def.levels[level] || "")}</div>
    `;
    detailEl.appendChild(row);
  }

  // ━━━ TOP 5 ━━━
  const topEl = document.getElementById("top-list");
  topEl.innerHTML = "";
  const top5 = rankings.slice(0, 5);
  top5.forEach((t, i) => {
    const item = document.createElement("div");
    item.className = "top-item" + (t.code === primary.code ? " current" : "");
    item.innerHTML = `
      <span class="top-rank">#${i + 1}</span>
      <span class="top-code">${escapeHTML(t.code)}</span>
      <span class="top-name">${escapeHTML(t.cn)}</span>
      <span class="top-sim">${t.similarity}%</span>
    `;
    // 数字滚动
    animateNumber(item.querySelector(".top-sim"), t.similarity, i * 80 + 600);
    topEl.appendChild(item);
  });

  // ━━━ 免责声明 ━━━
  document.getElementById("disclaimer").textContent =
    mode === "normal" ? config.display.funNote : config.display.funNoteSpecial;

  // ━━━ 海报按钮 ━━━
  const btnDownload = document.getElementById("btn-download");
  btnDownload.onclick = async () => {
    btnDownload.disabled = true;
    const original = btnDownload.textContent;
    btnDownload.textContent = "正在生成...";
    try {
      await generateShareImage(
        primary,
        userLevels,
        userScores,
        dimOrder,
        dimDefs,
        mode,
        config,
      );
    } catch (e) {
      console.error(e);
      btnDownload.textContent = "生成失败，请重试";
      setTimeout(() => {
        btnDownload.textContent = original;
        btnDownload.disabled = false;
      }, 1600);
      return;
    }
    btnDownload.textContent = "已保存 ✓";
    setTimeout(() => {
      btnDownload.textContent = original;
      btnDownload.disabled = false;
    }, 1800);
  };

  // ━━━ 复制朋友圈文案 ━━━
  const btnCopy = document.getElementById("btn-copy");
  const copyHint = document.getElementById("copy-hint");
  btnCopy.onclick = async () => {
    const siteUrl = "https://niuniu-869.github.io/EATI/";
    const text = `我是 ${primary.code} ${primary.cn}
${primary.intro}

来 EATI 测测你是哪种吃货 ${emojis.join("")}
${siteUrl}`;
    try {
      await navigator.clipboard.writeText(text);
      copyHint.style.display = "block";
      btnCopy.textContent = "已复制 ✓";
      setTimeout(() => {
        btnCopy.textContent = "复制文案";
        copyHint.style.display = "none";
      }, 2400);
    } catch (e) {
      btnCopy.textContent = "复制失败";
      setTimeout(() => {
        btnCopy.textContent = "复制文案";
      }, 1600);
    }
  };
}

/**
 * 数字从 0 滚动到 target，delay 毫秒后开始
 */
function animateNumber(el, target, delay = 0) {
  if (!el) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = target + "%";
    return;
  }
  const duration = 800;
  const start = performance.now() + delay;
  function tick(now) {
    if (now < start) {
      requestAnimationFrame(tick);
      return;
    }
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(target * eased) + "%";
    if (t < 1) requestAnimationFrame(tick);
  }
  el.textContent = "0%";
  requestAnimationFrame(tick);
}

function escapeHTML(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}
