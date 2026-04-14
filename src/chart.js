/**
 * SVG 手绘雷达图 —— 杂志感 + 套印错版
 * 同心六边形印章圈 + 数据区块错位套印 + emoji 标签
 */

const LEVEL_STARS = { L: "★", M: "★★", H: "★★★" };

// 原始分数 (4-12) → 雷达图半径比例 (0.18 ~ 1.0)
// 内圈留 18% 防止低分塌成一个点，且让差异更明显
const SCORE_MIN = 4;
const SCORE_MAX = 12;
const RADIUS_FLOOR = 0.18;
function scoreToRatio(s) {
  if (s == null) return 0.5;
  const clamped = Math.max(SCORE_MIN, Math.min(SCORE_MAX, s));
  const t = (clamped - SCORE_MIN) / (SCORE_MAX - SCORE_MIN); // 0~1
  return RADIUS_FLOOR + t * (1 - RADIUS_FLOOR); // 0.18~1
}

// 维度 → emoji 映射
const DIM_EMOJI = {
  GUT: "🥢",
  TNG: "👅",
  EYE: "👀",
  LEG: "🦵",
  CRW: "👥",
  SOUL: "✨",
};

/**
 * 绘制 SVG 雷达图
 * @param {HTMLElement} container  容器元素（原 canvas 替换）
 * @param {Object} userLevels      { GUT:'H', ... }
 * @param {Array}  dimOrder        维度顺序
 * @param {Object} dimDefs         维度定义
 * @param {string} themeColor      主色（人格主题色，默认番茄红）
 */
export function drawRadar(
  container,
  userLevels,
  userScores,
  dimOrder,
  dimDefs,
  themeColor = "#FF5B3E",
) {
  const VB = 400; // viewBox 边长
  const R = 128; // 最外圈半径
  const cx = 0,
    cy = 0; // 原点居中
  const n = dimOrder.length;
  const step = (Math.PI * 2) / n;
  const start = -Math.PI / 2;

  const ink = "#1A1613";
  const inkSoft = "#5C534A";

  // 同心六边形的顶点
  const ringPoints = (r) => {
    return Array.from({ length: n }, (_, i) => {
      const a = start + i * step;
      return `${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`;
    }).join(" ");
  };

  // 数据多边形顶点 —— 用原始分数 4-12 的连续值，避免规则六边形
  const ratios = dimOrder.map((d) => scoreToRatio(userScores?.[d]));
  const dataPts = ratios
    .map((ratio, i) => {
      const a = start + i * step;
      const r = ratio * R;
      return `${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`;
    })
    .join(" ");

  // 顶点（emoji + 维度名 + 档位）
  const labels = dimOrder.map((dim, i) => {
    const a = start + i * step;
    const labelR = R + 42;
    const lx = cx + Math.cos(a) * labelR;
    const ly = cy + Math.sin(a) * labelR;
    const def = dimDefs[dim] || { name: dim };
    // 从 "胃 GUT 食量" 里拿第一个字
    const shortName =
      (def.name || dim)
        .replace(/^[A-Za-z0-9\s]+/, "")
        .trim()
        .charAt(0) || dim;
    const emoji = DIM_EMOJI[dim] || "●";
    const level = userLevels[dim] || "M";
    const stars = LEVEL_STARS[level];
    return { lx, ly, shortName, emoji, stars, level };
  });

  // 3 层同心六边形
  const ring1 = ringPoints(R * 0.35); // 内环（低档位参考）
  const ring2 = ringPoints(R * 0.68); // 中环
  const ring3 = ringPoints(R); // 外环

  // 轴线
  const axes = dimOrder
    .map((_, i) => {
      const a = start + i * step;
      const x = cx + Math.cos(a) * R;
      const y = cy + Math.sin(a) * R;
      return `<line x1="0" y1="0" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" stroke="${ink}" stroke-width="0.8" stroke-opacity="0.18" stroke-dasharray="2 3"/>`;
    })
    .join("");

  // 数据点
  const dots = ratios
    .map((ratio, i) => {
      const a = start + i * step;
      const r = ratio * R;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="5" fill="${themeColor}" stroke="${ink}" stroke-width="1.5"/>`;
    })
    .join("");

  // 顶点标签 HTML（在 SVG 外层用 foreignObject 或 text 都可；这里用 text，emoji 用 <text> 渲染）
  const labelEls = labels
    .map(({ lx, ly, shortName, emoji, stars, level }) => {
      const levelColor =
        level === "H" ? themeColor : level === "M" ? "#F4C430" : inkSoft;
      return `
      <g class="radar-label" transform="translate(${lx.toFixed(2)}, ${ly.toFixed(2)})">
        <text x="0" y="-10" text-anchor="middle" font-size="22" dominant-baseline="middle">${emoji}</text>
        <text x="0" y="14" text-anchor="middle" font-size="15" font-weight="700" fill="${ink}" font-family="LXGW WenKai, 霞鹜文楷, serif">${shortName}</text>
        <text x="0" y="32" text-anchor="middle" font-size="11" letter-spacing="1" fill="${levelColor}" font-weight="700">${stars}</text>
      </g>
    `;
    })
    .join("");

  // SVG 总输出
  const svg = `
    <svg viewBox="${-VB / 2} ${-VB / 2} ${VB} ${VB}" xmlns="http://www.w3.org/2000/svg" class="radar-svg" role="img" aria-label="六维食格雷达图">
      <defs>
        <filter id="radar-noise" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="2" seed="3"/>
          <feColorMatrix values="0 0 0 0 0.1  0 0 0 0 0.08  0 0 0 0 0.06  0 0 0 0.18 0"/>
          <feComposite in2="SourceGraphic" operator="in"/>
        </filter>
      </defs>

      <!-- 外层印章圈（带虚线套印感）-->
      <polygon points="${ring3}" fill="#FFFDF8" stroke="${ink}" stroke-width="1.8" stroke-opacity="0.85"/>
      <polygon points="${ring3}" fill="none" stroke="${ink}" stroke-width="0.8" stroke-opacity="0.45" stroke-dasharray="3 4" transform="scale(1.055)"/>

      <!-- 中环 & 内环 -->
      <polygon points="${ring2}" fill="none" stroke="${ink}" stroke-width="1" stroke-opacity="0.35" stroke-dasharray="2 3"/>
      <polygon points="${ring1}" fill="none" stroke="${ink}" stroke-width="0.8" stroke-opacity="0.25" stroke-dasharray="2 3"/>

      <!-- 轴线 -->
      ${axes}

      <!-- 数据区：错版套印（副色偏移 + 主色实填） -->
      <g class="radar-data">
        <polygon points="${dataPts}" fill="none" stroke="${ink}" stroke-width="2" transform="translate(3.5,3.5)" opacity="0.55"/>
        <polygon points="${dataPts}" fill="${themeColor}" fill-opacity="0.28" stroke="${themeColor}" stroke-width="2.5" stroke-linejoin="round"/>
        ${dots}
      </g>

      <!-- 标签 -->
      ${labelEls}
    </svg>
  `;

  container.innerHTML = svg;

  // 入场动画：数据多边形从中心 scale 展开
  const dataGroup = container.querySelector(".radar-data");
  if (
    dataGroup &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    dataGroup.style.transformOrigin = "center";
    dataGroup.style.transform = "scale(0.05)";
    dataGroup.style.opacity = "0";
    requestAnimationFrame(() => {
      dataGroup.style.transition =
        "transform 1.1s cubic-bezier(0.2, 1.2, 0.3, 1), opacity 0.5s ease-out";
      dataGroup.style.transform = "scale(1)";
      dataGroup.style.opacity = "1";
    });
  }
}
