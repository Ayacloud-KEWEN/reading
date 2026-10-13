'use strict';
// 地图绘制：路线、世界（六边形）、情绪曲线。全部输出 SVG 字符串。

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// ---------- 路线 ----------
// 节点：有章节用章节，影视用集数，否则用 10 个里程碑
function routeNodes(w) {
  const pct = workPct(w);
  const ch = chapterList(w);
  if (ch.length) {
    let reached = -1;
    if (isScreen(w)) reached = ((w.progress && w.progress.value) || 0) - 1;
    else {
      const ci = w.progress && w.progress.chapterIdx;
      reached = Math.max(ci != null ? ci : -1, Math.floor(pct / 100 * ch.length) - 1);
    }
    if (pct >= 100 || w.status === 'done') reached = ch.length - 1;
    return ch.map((label, i) => ({ i, label, lit: i <= reached, current: i === reached + 1 && pct < 100 }));
  }
  const nodes = [];
  const full = w.status === 'done';
  for (let i = 1; i <= 10; i++) nodes.push({ i: i - 1, label: `${i * 10}%`, lit: full || pct >= i * 10, current: false });
  const cur = nodes.find(n => !n.lit);
  if (cur) cur.current = true;
  return nodes;
}

// 某节点覆盖的卡片（用于剧情索引）
function cardsAtNode(w, nodeIdx, nodeCount) {
  const useChapter = chapterList(w).length > 0 && !isScreen(w);
  return workCards(w).filter(c => {
    if (useChapter && c.chapterIdx != null) return c.chapterIdx === nodeIdx;
    const seg = Math.min(nodeCount - 1, Math.floor((c.pct || 0) / 100 * nodeCount - 1e-9));
    return Math.max(0, seg) === nodeIdx;
  });
}

function routeSVG(w, opts = {}) {
  const nodes = routeNodes(w);
  const n = nodes.length;
  const per = n > 24 ? 5 : 4;
  const W = 340, padX = 34, rowH = 86, top = 52;
  const step = (W - padX * 2) / (per - 1);
  const pts = nodes.map((nd, k) => {
    const row = Math.floor(k / per), col = k % per;
    const x = padX + (row % 2 ? per - 1 - col : col) * step;
    return { x, y: top + row * rowH, ...nd };
  });
  const rows = Math.ceil(n / per);
  const H = top + (rows - 1) * rowH + 70;
  const start = { x: padX, y: 18 };
  let segs = '';
  const all = [start, ...pts];
  for (let k = 1; k < all.length; k++) {
    const a = all[k - 1], b = all[k];
    const lit = b.lit;
    let d;
    if (k === 1) d = `M${a.x} ${a.y} L${b.x} ${b.y}`;
    else if (Math.abs(a.y - b.y) < 1) {
      const mx = (a.x + b.x) / 2;
      d = `M${a.x} ${a.y} Q${mx} ${a.y + (k % 2 ? -14 : 14)} ${b.x} ${b.y}`;
    } else {
      const dir = a.x > W / 2 ? 1 : -1;
      d = `M${a.x} ${a.y} C${a.x + dir * 40} ${a.y} ${b.x + dir * 40} ${b.y} ${b.x} ${b.y}`;
    }
    segs += `<path d="${d}" fill="none" stroke="var(--ink)" stroke-width="${lit ? 2.6 : 1.4}" ${lit ? '' : 'stroke-dasharray="3 6" opacity=".55"'} stroke-linecap="round"/>`;
  }
  const counts = opts.counts ? pts.map(p => cardsAtNode(w, p.i, n).length) : [];
  const label = n > 24 ? 4 : 6;
  const dots = pts.map((p, k) => {
    const r = p.current ? 8 : 6.5;
    const fill = p.lit ? 'var(--ink)' : 'var(--card)';
    const ring = p.current ? `<circle cx="${p.x}" cy="${p.y}" r="14" fill="none" stroke="var(--seal)" stroke-width="1.6"/>` : '';
    const badge = counts[k] ? `<circle cx="${p.x + 9}" cy="${p.y - 9}" r="7" fill="var(--seal)"/><text x="${p.x + 9}" y="${p.y - 5.5}" font-size="9" text-anchor="middle" fill="var(--paper)">${counts[k]}</text>` : '';
    return `<g data-node="${p.i}" style="cursor:pointer">${ring}<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${fill}" stroke="var(--ink)" stroke-width="1.6"/>
      <text x="${p.x}" y="${p.y + 24}" font-size="10.5" text-anchor="middle" fill="${p.lit || p.current ? 'var(--ink)' : 'var(--sub)'}">${esc(trunc(p.label, label))}</text>${badge}<circle cx="${p.x}" cy="${p.y}" r="18" fill="transparent"/></g>`;
  }).join('');
  const last = pts[pts.length - 1];
  const done = workPct(w) >= 100 || w.status === 'done';
  const goal = last ? `<g transform="translate(${last.x},${last.y + 46})"><path d="M-7 -7 L7 7 M7 -7 L-7 7" stroke="var(--seal)" stroke-width="2.6"/></g>
    <text x="${last.x}" y="${last.y + 66}" font-size="11" text-anchor="middle" fill="var(--seal)">${done ? '已抵达' : '终点'}</text>` : '';
  return `<svg viewBox="0 0 ${W} ${H + 20}" width="100%" role="img" aria-label="路线地图">
    <text x="${start.x + 8}" y="${start.y + 4}" font-size="11" fill="var(--sub)">启程</text>
    ${segs}${dots}${goal}</svg>`;
}

// ---------- 世界地图（六边形，奇数行右移） ----------
const TERRAIN = {
  sea: { name: '海', fill: 'var(--sea)', glyph: '≈' },
  plain: { name: '平原', fill: 'var(--plain)', glyph: '' },
  forest: { name: '森林', fill: 'var(--forest)', glyph: '♣' },
  mountain: { name: '山脉', fill: 'var(--mountain)', glyph: '∧' },
  desert: { name: '荒漠', fill: 'var(--desert)', glyph: '∴' },
  city: { name: '城镇', fill: 'var(--city)', glyph: '▣' }
};
const SQ3 = Math.sqrt(3);

function hexCenter(c, r, R) {
  return { x: R * SQ3 * (c + 0.5 * (r & 1)) + R + 2, y: R * 1.5 * r + R + 2 };
}
function hexPoints(x, y, R) {
  let p = '';
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 3 * i + Math.PI / 6;
    p += `${(x + R * Math.cos(a)).toFixed(1)},${(y + R * Math.sin(a)).toFixed(1)} `;
  }
  return p;
}
function hexDist(c1, r1, c2, r2) {
  const cube = (c, r) => { const x = c - (r - (r & 1)) / 2; return [x, -x - r, r]; };
  const a = cube(c1, r1), b = cube(c2, r2);
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

function newWorld() { return { cols: 16, rows: 20, cells: {}, pins: [] }; }

// 已放置的地点钉，按书中出现顺序（足迹）
function placedPins(w) {
  const world = w.world || newWorld();
  return world.pins
    .map(p => ({ ...p, card: S.cards.find(c => c.id === p.cardId) }))
    .filter(p => p.card)
    .sort((a, b) => (a.card.pct || 0) - (b.card.pct || 0));
}
function isRevealed(world, pins, c, r) {
  return pins.some(p => hexDist(p.c, p.r, c, r) <= 2);
}
function revealPct(w) {
  const world = w.world || newWorld();
  const pins = placedPins(w);
  const keys = Object.keys(world.cells);
  if (!keys.length) return 0;
  const shown = keys.filter(k => { const [c, r] = k.split(',').map(Number); return isRevealed(world, pins, c, r); }).length;
  return Math.round(shown / keys.length * 100);
}

function worldSVG(w, { fog = true, R = 16, selected = null } = {}) {
  const world = w.world || newWorld();
  const pins = placedPins(w);
  const Wd = R * SQ3 * (world.cols + 0.5) + 4;
  const Ht = R * 1.5 * (world.rows - 1) + R * 2 + 4;
  let cells = '';
  for (let r = 0; r < world.rows; r++) {
    for (let c = 0; c < world.cols; c++) {
      const { x, y } = hexCenter(c, r, R);
      const t = world.cells[`${c},${r}`];
      const hidden = fog && !isRevealed(world, pins, c, r);
      const fill = hidden ? 'var(--fog)' : t ? TERRAIN[t].fill : 'var(--card)';
      cells += `<polygon class="hex" data-c="${c}" data-r="${r}" points="${hexPoints(x, y, R)}" fill="${fill}"/>`;
      if (!hidden && t && TERRAIN[t].glyph) {
        cells += `<text x="${x}" y="${y + R * 0.3}" font-size="${R * 0.8}" text-anchor="middle" fill="var(--ink)" opacity=".45" pointer-events="none">${TERRAIN[t].glyph}</text>`;
      }
    }
  }
  let trail = '';
  if (pins.length > 1) {
    const d = pins.map((p, i) => { const { x, y } = hexCenter(p.c, p.r, R); return `${i ? 'L' : 'M'}${x} ${y}`; }).join(' ');
    trail = `<path d="${d}" fill="none" stroke="var(--ink)" stroke-width="1.8" stroke-dasharray="2 5" stroke-linecap="round" pointer-events="none"/>`;
  }
  const marks = pins.map(p => {
    const { x, y } = hexCenter(p.c, p.r, R);
    const sel = selected === p.cardId;
    return `<g data-pin="${p.cardId}" style="cursor:pointer">
      <circle cx="${x}" cy="${y}" r="${R * 0.38}" fill="var(--seal)" stroke="var(--paper)" stroke-width="1.5"/>
      ${sel ? `<circle cx="${x}" cy="${y}" r="${R * 0.75}" fill="none" stroke="var(--seal)" stroke-width="1.5"/>` : ''}
      <text x="${x}" y="${y - R * 0.6}" font-size="${Math.max(10, R * 0.72)}" text-anchor="middle" fill="var(--ink)" stroke="var(--paper)" stroke-width="3" paint-order="stroke">${esc(trunc(p.card.title, 8))}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${Wd.toFixed(0)} ${Ht.toFixed(0)}" width="${Wd.toFixed(0)}" height="${Ht.toFixed(0)}" role="img" aria-label="世界地图">${cells}${trail}${marks}</svg>`;
}

// ---------- 情绪曲线 ----------
function moodSVG(w) {
  const ss = workSessions(w).filter(s => s.mood || s.giveUp);
  if (!ss.length) return '';
  const W = 340, H = 140, l = 30, r = 12, t = 14, b = 26;
  const x = p => l + (W - l - r) * p / 100;
  const y = v => t + (H - t - b) * (3 - v) / 5;
  const pts = ss.filter(s => s.mood).map(s => ({ x: x(s.toPct), y: y(MOOD_VALUE[s.mood] ?? 0), m: s.mood }));
  const line = pts.length > 1 ? `<path d="${pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="var(--ink)" stroke-width="1.8"/>` : '';
  const dots = pts.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="var(--ink)"><title>${p.m}</title></circle>`).join('');
  const lab = pts.length <= 14 ? pts.map(p => `<text x="${p.x}" y="${p.y - 7}" font-size="9" text-anchor="middle" fill="var(--sub)">${p.m}</text>`).join('') : '';
  const gives = ss.filter(s => s.giveUp).map(s => `<g><line x1="${x(s.toPct)}" x2="${x(s.toPct)}" y1="${t}" y2="${H - b}" stroke="var(--seal)" stroke-dasharray="3 3"/><text x="${x(s.toPct)}" y="${H - b + 22}" font-size="9" text-anchor="middle" fill="var(--seal)">差点放弃</text></g>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="情绪曲线">
    <line x1="${l}" x2="${W - r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)" stroke-dasharray="2 4"/>
    <text x="4" y="${y(3) + 4}" font-size="9" fill="var(--sub)">高涨</text>
    <text x="4" y="${y(-2) + 4}" font-size="9" fill="var(--sub)">低落</text>
    <text x="${l}" y="${H - b + 12}" font-size="9" fill="var(--sub)">0%</text>
    <text x="${W - r}" y="${H - b + 12}" font-size="9" text-anchor="end" fill="var(--sub)">100%</text>
    ${gives}${line}${dots}${lab}</svg>`;
}
