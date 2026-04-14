/**
 * EATI 食格档案 · 1080×1920 竖版分享海报
 * 纯 Canvas 绘制 + QR 码 + navigator.share 优先
 */
import QRCode from "qrcode";

// 原始分数 (4-12) → 雷达图半径比例 (0.18 ~ 1.0)，与页面雷达图保持一致
const SCORE_MIN = 4;
const SCORE_MAX = 12;
const RADIUS_FLOOR = 0.18;
function scoreToRatio(s) {
  if (s == null) return 0.5;
  const clamped = Math.max(SCORE_MIN, Math.min(SCORE_MAX, s));
  const t = (clamped - SCORE_MIN) / (SCORE_MAX - SCORE_MIN);
  return RADIUS_FLOOR + t * (1 - RADIUS_FLOOR);
}

const THEME = {
  paper: "#F5EDE0",
  paperDeep: "#EAE0CC",
  card: "#FFFDF8",
  ink: "#1A1613",
  inkSoft: "#5C534A",
  inkFaint: "#9B9086",
  tomato: "#FF5B3E",
  mustard: "#F4C430",
  matcha: "#7BA05B",
};

const DIM_EMOJI = {
  GUT: "🥢",
  TNG: "👅",
  EYE: "👀",
  LEG: "🦵",
  CRW: "👥",
  SOUL: "✨",
};

const FF_DISPLAY =
  '"Smiley Sans Oblique", "得意黑", ui-sans-serif, system-ui, "PingFang SC", sans-serif';
const FF_SERIF = '"LXGW WenKai", "霞鹜文楷", ui-serif, Georgia, serif';
const FF_SANS =
  'ui-sans-serif, system-ui, -apple-system, "PingFang SC", sans-serif';
const FF_MONO =
  'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';

const SITE_URL = "https://niuniu-869.github.io/EATI/";

/**
 * 生成 1080×1920 海报 + 优先 navigator.share
 */
export async function generateShareImage(
  primary,
  userLevels,
  userScores,
  dimOrder,
  dimDefs,
  mode,
  _config,
) {
  // 等字体就绪（最多等 1.5s，避免字体 CDN 慢死）
  try {
    await Promise.race([
      document.fonts?.ready || Promise.resolve(),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch (_) {}

  const W = 1080;
  const H = 1920;
  const dpr = 2;

  const canvas = document.createElement("canvas");
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const theme = primary.themeColor || THEME.tomato;
  const themeDeep = darken(theme, 0.18);

  // ═══ 背景（奶油米 + 噪点） ═══
  ctx.fillStyle = THEME.paper;
  ctx.fillRect(0, 0, W, H);
  drawNoise(ctx, W, H, 0.06);

  // ═══ 外描边硬阴影卡片 ═══
  const M = 52;
  const card = { x: M, y: M, w: W - M * 2, h: H - M * 2 };
  // 阴影
  ctx.fillStyle = THEME.ink;
  ctx.fillRect(card.x + 10, card.y + 10, card.w, card.h);
  // 卡片
  ctx.fillStyle = THEME.card;
  ctx.fillRect(card.x, card.y, card.w, card.h);
  // 硬描边
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 4;
  ctx.strokeRect(card.x, card.y, card.w, card.h);

  drawNoise(ctx, W, H, 0.035);

  // ═══ 顶部 kicker ═══
  const padX = card.x + 56;
  const padR = card.x + card.w - 56;

  ctx.textBaseline = "alphabetic";
  ctx.font = `700 20px ${FF_MONO}`;
  ctx.fillStyle = THEME.ink;
  ctx.textAlign = "left";
  ctx.fillText("EATI · VOL.01 · 食格档案", padX, card.y + 80);
  ctx.textAlign = "right";
  const kickerRight =
    mode === "hotpot"
      ? "🔥 HIDDEN"
      : mode === "fallback"
        ? "404 OVERRIDE"
        : "COMPLETE";
  ctx.fillText(kickerRight, padR, card.y + 80);

  // kicker 下分隔线
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padX, card.y + 108);
  ctx.lineTo(padR, card.y + 108);
  ctx.stroke();

  // ═══ Label ═══
  ctx.textAlign = "left";
  ctx.font = `700 18px ${FF_MONO}`;
  ctx.fillStyle = THEME.inkSoft;
  const labelText =
    mode === "hotpot"
      ? "你的隐藏食格"
      : mode === "fallback"
        ? "你的兜底食格"
        : "你的主食格";
  ctx.fillText(
    labelText.toUpperCase ? labelText : labelText,
    padX,
    card.y + 168,
  );
  // 中文保留原样
  ctx.fillText(labelText, padX, card.y + 168);

  // ═══ 大号 Code ═══
  let y = card.y + 360;
  ctx.textAlign = "left";
  const code = primary.code;
  // Code 字号根据长度自适应
  const codeFontSize = code.length <= 4 ? 220 : code.length <= 5 ? 180 : 150;
  ctx.font = `700 ${codeFontSize}px ${FF_MONO}`;
  ctx.fillStyle = theme;
  // 墨黑错版
  ctx.save();
  ctx.translate(6, 6);
  ctx.fillStyle = THEME.ink;
  ctx.globalAlpha = 0.15;
  ctx.fillText(code, padX, y);
  ctx.restore();
  // 主色
  ctx.fillStyle = theme;
  ctx.fillText(code, padX, y);

  // ═══ 人格名 ═══
  y += 90;
  ctx.font = `700 italic 68px ${FF_DISPLAY}`;
  ctx.fillStyle = THEME.ink;
  ctx.fillText(primary.cn, padX, y);

  // ═══ Emoji 贴纸 ═══
  y += 84;
  const emojis = primary.emoji || ["🍽️"];
  ctx.font = `64px ${FF_SANS}`;
  let ex = padX;
  for (const em of emojis) {
    ctx.save();
    ctx.translate(ex + 30, y - 20);
    ctx.rotate(Math.random() * 0.3 - 0.15);
    ctx.textAlign = "center";
    ctx.fillText(em, 0, 30);
    ctx.restore();
    ex += 80;
  }

  // ═══ 印章式匹配度 ═══
  y += 56;
  const totalDims = dimOrder.length;
  const stampText =
    primary.exact != null
      ? `匹配度 ${primary.similarity}% · 精准 ${primary.exact}/${totalDims}`
      : `匹配度 ${primary.similarity}%`;
  ctx.font = `700 22px ${FF_MONO}`;
  const stampPadH = 16;
  const stampPadV = 12;
  const stampW = ctx.measureText(stampText).width + stampPadH * 2;
  const stampH = 44;
  ctx.save();
  ctx.translate(padX + stampW / 2, y + stampH / 2);
  ctx.rotate(-0.035);
  ctx.fillStyle = THEME.ink;
  ctx.fillRect(-stampW / 2 + 4, -stampH / 2 + 4, stampW, stampH);
  ctx.fillStyle = theme;
  ctx.fillRect(-stampW / 2, -stampH / 2, stampW, stampH);
  ctx.fillStyle = THEME.card;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(stampText, 0, 2);
  ctx.restore();
  ctx.textBaseline = "alphabetic";

  // ═══ Intro 金句 ═══
  y += 84;
  ctx.textAlign = "left";
  ctx.font = `italic 600 34px ${FF_SERIF}`;
  ctx.fillStyle = THEME.ink;
  // 上下装饰线
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(padX, y - 8);
  ctx.lineTo(padR, y - 8);
  ctx.stroke();

  // 引号
  ctx.font = `italic 700 80px ${FF_SERIF}`;
  ctx.fillStyle = theme;
  ctx.fillText("\u201C", padX - 4, y + 50);

  ctx.font = `italic 600 36px ${FF_SERIF}`;
  ctx.fillStyle = THEME.ink;
  const introLines = wrapText(ctx, primary.intro || "", card.w - 112 - 50);
  let introY = y + 50;
  for (const line of introLines.slice(0, 2)) {
    ctx.fillText(line, padX + 48, introY);
    introY += 52;
  }
  y = introY + 18;
  ctx.beginPath();
  ctx.moveTo(padX, y);
  ctx.lineTo(padR, y);
  ctx.stroke();

  // ═══ 雷达图 ═══
  y += 56;
  const radarCx = W / 2;
  const radarCy = y + 250;
  const radarR = 220;
  drawShareRadar(
    ctx,
    radarCx,
    radarCy,
    radarR,
    userLevels,
    userScores,
    dimOrder,
    dimDefs,
    theme,
  );
  y = radarCy + radarR + 140;

  // 雷达图副标题
  ctx.textAlign = "center";
  ctx.font = `700 22px ${FF_MONO}`;
  ctx.fillStyle = THEME.inkSoft;
  ctx.fillText("SIX-SENSE RADAR · 六感食格", W / 2, y);
  y += 52;

  // ═══ 底部分隔 ═══
  y = H - 360;
  ctx.strokeStyle = THEME.ink;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(padX, y);
  ctx.lineTo(padR, y);
  ctx.stroke();
  ctx.setLineDash([]);

  // ═══ 底部：二维码 + 文字 ═══
  y += 32;
  const qrSize = 200;
  const qrX = padR - qrSize;
  const qrY = y;
  let qrDataUrl = null;
  try {
    qrDataUrl = await QRCode.toDataURL(SITE_URL, {
      width: qrSize * 2,
      margin: 1,
      color: { dark: THEME.ink, light: THEME.card },
      errorCorrectionLevel: "M",
    });
  } catch (e) {
    console.warn("QR code generation failed", e);
  }
  if (qrDataUrl) {
    const qrImg = await loadImage(qrDataUrl);
    // 墨黑描边
    ctx.strokeStyle = THEME.ink;
    ctx.lineWidth = 3;
    ctx.strokeRect(qrX, qrY, qrSize, qrSize);
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
  }

  // 左侧文字
  ctx.textAlign = "left";
  ctx.fillStyle = THEME.ink;
  ctx.font = `800 italic 52px ${FF_DISPLAY}`;
  ctx.fillText("来测你的", padX, y + 56);
  ctx.fillText("食格档案", padX, y + 116);
  ctx.font = `700 16px ${FF_MONO}`;
  ctx.fillStyle = THEME.inkSoft;
  ctx.fillText("niuniu-869.github.io/EATI", padX, y + 168);
  ctx.font = `400 13px ${FF_MONO}`;
  ctx.fillStyle = THEME.inkFaint;
  ctx.fillText("扫码 · 25 题 · 3 分钟", padX, y + 195);

  // ═══ 底部水印 ═══
  ctx.textAlign = "center";
  ctx.font = `700 15px ${FF_MONO}`;
  ctx.fillStyle = THEME.ink;
  ctx.fillText("EATI · 食格档案 · 厦门大学美食协会出品", W / 2, H - 76);
  ctx.font = `400 12px ${FF_MONO}`;
  ctx.fillStyle = THEME.inkSoft;
  ctx.fillText("致敬 UP 主 @蛆肉儿串儿 · 本测试仅供娱乐", W / 2, H - 56);

  // ═══ 导出 ═══
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png", 0.95),
  );
  if (!blob) throw new Error("canvas.toBlob failed");

  const filename = `EATI-${primary.code}-食格档案.png`;
  const shared = await trySystemShare(blob, filename, primary);
  if (!shared) {
    downloadBlob(blob, filename);
  }
}

/* ─────────────────────────────────────────
   雷达图（海报版，与页面版视觉一致）
   ───────────────────────────────────────── */
function drawShareRadar(
  ctx,
  cx,
  cy,
  maxR,
  userLevels,
  userScores,
  dimOrder,
  dimDefs,
  theme,
) {
  const n = dimOrder.length;
  const step = (Math.PI * 2) / n;
  const start = -Math.PI / 2;

  // 3 层同心六边形
  const drawRing = (ratio, opts = {}) => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = start + i * step;
      const x = cx + Math.cos(a) * maxR * ratio;
      const y = cy + Math.sin(a) * maxR * ratio;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    if (opts.fill) {
      ctx.fillStyle = opts.fill;
      ctx.fill();
    }
    ctx.setLineDash(opts.dash || []);
    ctx.strokeStyle = opts.stroke || "rgba(26,22,19,0.2)";
    ctx.lineWidth = opts.lw || 1;
    ctx.globalAlpha = opts.alpha || 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  };

  drawRing(1, { fill: THEME.card, stroke: THEME.ink, lw: 2.2 });
  drawRing(0.68, { stroke: THEME.ink, lw: 1.2, dash: [3, 5], alpha: 0.4 });
  drawRing(0.35, { stroke: THEME.ink, lw: 1, dash: [3, 5], alpha: 0.3 });

  // 轴线
  for (let i = 0; i < n; i++) {
    const a = start + i * step;
    const x = cx + Math.cos(a) * maxR;
    const y = cy + Math.sin(a) * maxR;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "rgba(26,22,19,0.18)";
    ctx.lineWidth = 0.8;
    ctx.setLineDash([2, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 数据多边形 —— 用原始分数 4-12 的连续值
  const ratios = dimOrder.map((d) => scoreToRatio(userScores?.[d]));
  const drawDataPoly = (offsetX, offsetY, fillAlpha, strokeColor, strokeW) => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = start + i * step;
      const r = ratios[i] * maxR;
      const x = cx + Math.cos(a) * r + offsetX;
      const y = cy + Math.sin(a) * r + offsetY;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    if (fillAlpha > 0) {
      ctx.fillStyle = hexToRgba(theme, fillAlpha);
      ctx.fill();
    }
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeW;
    ctx.lineJoin = "round";
    ctx.stroke();
  };
  // 错版副描边
  drawDataPoly(5, 5, 0, "rgba(26,22,19,0.5)", 2.5);
  // 主数据区
  drawDataPoly(0, 0, 0.3, theme, 3.5);

  // 数据点
  for (let i = 0; i < n; i++) {
    const a = start + i * step;
    const r = ratios[i] * maxR;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = theme;
    ctx.fill();
    ctx.strokeStyle = THEME.ink;
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }

  // 顶点标签
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < n; i++) {
    const a = start + i * step;
    const labelR = maxR + 60;
    const lx = cx + Math.cos(a) * labelR;
    const ly = cy + Math.sin(a) * labelR;
    const dim = dimOrder[i];
    const def = dimDefs[dim] || { name: dim };
    const shortName =
      (def.name || dim)
        .replace(/^[A-Za-z0-9\s]+/, "")
        .trim()
        .charAt(0) || dim;
    const em = DIM_EMOJI[dim] || "●";
    const level = userLevels[dim] || "M";
    const stars = { L: "★", M: "★★", H: "★★★" }[level];
    const lvColor =
      level === "H" ? theme : level === "M" ? THEME.mustard : THEME.inkSoft;

    ctx.font = `34px ${FF_SANS}`;
    ctx.fillStyle = THEME.ink;
    ctx.fillText(em, lx, ly - 16);

    ctx.font = `700 22px ${FF_SERIF}`;
    ctx.fillStyle = THEME.ink;
    ctx.fillText(shortName, lx, ly + 14);

    ctx.font = `700 14px ${FF_MONO}`;
    ctx.fillStyle = lvColor;
    ctx.fillText(stars, lx, ly + 38);
  }
  ctx.textBaseline = "alphabetic";
}

/* ─────────────────────────────────────────
   工具函数
   ───────────────────────────────────────── */

function drawNoise(ctx, w, h, alpha) {
  // 轻量噪点：随机画一堆小点
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const g = Math.floor(Math.random() * 60);
    ctx.fillStyle = `rgb(${g},${g - 10},${g - 20})`;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();
}

function hexToRgba(hex, alpha) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(255,91,62,${alpha})`;
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 0xff;
  const g = (int >> 8) & 0xff;
  const b = int & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

function darken(hex, amount = 0.2) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const int = parseInt(m[1], 16);
  const r = Math.max(0, Math.round(((int >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.round(((int >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.round((int & 0xff) * (1 - amount)));
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

function wrapText(ctx, text, maxWidth) {
  if (!text) return [];
  const lines = [];
  let line = "";
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line);
      line = ch;
    } else {
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function trySystemShare(blob, filename, primary) {
  if (!navigator.canShare || !navigator.share) return false;
  try {
    const file = new File([blob], filename, { type: "image/png" });
    if (!navigator.canShare({ files: [file] })) return false;
    await navigator.share({
      files: [file],
      title: `我是 ${primary.code} ${primary.cn}`,
      text: `来 EATI 测测你是哪种吃货 · ${SITE_URL}`,
    });
    return true;
  } catch (e) {
    // 用户取消或其他错误 —— 降级为下载
    return false;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
