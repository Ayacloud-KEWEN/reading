'use strict';
// 远征手账：视图与交互

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $('#app');
const h = esc;

// ---------- 通用组件 ----------
function toast(msg, ms = 1800) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}
function stampPop(text) {
  const d = document.createElement('div');
  d.className = 'stamp-pop';
  d.innerHTML = `<div>${text}</div>`;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 1400);
}
function openModal(html) {
  closeModal();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">${html}</div>`;
  bg.addEventListener('click', e => { if (e.target === bg) closeModal(); });
  $('#modal-root').appendChild(bg);
  return bg.firstElementChild;
}
function closeModal() { $('#modal-root').innerHTML = ''; }

// 单选 / 多选 chips
function bindChips(root, onChange, multi = false) {
  root.addEventListener('click', e => {
    const c = e.target.closest('.chip');
    if (!c || !root.contains(c)) return;
    if (multi) c.classList.toggle('on');
    else {
      const was = c.classList.contains('on');
      $$('.chip', root).forEach(x => x.classList.remove('on'));
      if (!was || !root.dataset.allowNone) c.classList.add('on');
    }
    onChange && onChange(c.classList.contains('on') ? c.dataset.v : null);
  });
}
const chipVal = root => { const c = $('.chip.on', root); return c ? c.dataset.v : null; };

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const file = new File([blob], filename, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
    navigator.share({ files: [file], title: filename }).catch(() => {});
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function compressImage(file, max = 1280) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

function progressBar(pct) { return `<div class="bar"><i style="width:${clamp(pct, 0, 100).toFixed(1)}%"></i></div>`; }
function daysAgo(t) {
  if (!t) return '还没开始';
  const d = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / DAY);
  return d <= 0 ? '今天读过' : d === 1 ? '昨天' : `${d} 天前`;
}
function workUnitVerb(w) { return isScreen(w) ? '观看' : '阅读'; }

// ---------- 路由 ----------
const routes = [
  [/^\/?$/, viewHome],
  [/^\/shelf(?:\/(\w+))?$/, viewShelf],
  [/^\/new$/, () => viewWorkForm(null)],
  [/^\/edit\/(\w+)$/, viewWorkForm],
  [/^\/work\/(\w+)(?:\/(\w+))?$/, viewWork],
  [/^\/recap\/(\w+)$/, viewRecap],
  [/^\/log\/(\w+)$/, viewLog],
  [/^\/finish\/(\w+)$/, viewFinish],
  [/^\/memorial\/(\w+)$/, viewMemorial],
  [/^\/stats(?:\/(\d+))?$/, viewStats],
  [/^\/settings$/, viewSettings]
];
const NAV_OF = { '': 'home', recap: 'shelf', shelf: 'shelf', new: 'shelf', edit: 'shelf', work: 'shelf', log: 'shelf', finish: 'shelf', memorial: 'shelf', stats: 'stats', settings: 'settings' };

function render() {
  closeModal();
  const path = location.hash.replace(/^#/, '') || '/';
  const seg = path.split('/')[1] || '';
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === NAV_OF[seg]));
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) { fn(...m.slice(1)); window.scrollTo(0, 0); return; }
  }
  location.hash = '#/';
}
const go = p => { location.hash = '#' + p; };

// ---------- 首页 ----------
function stampStrip() {
  const info = streakInfo();
  const days = readDaySet();
  let html = '';
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY);
    const k = dayKey(d);
    const cls = days.has(k) ? '' : info.restDays.has(k) ? 'rest' : 'off';
    html += `<span class="stamp ${cls}">${days.has(k) ? pad2(d.getDate()) : info.restDays.has(k) ? '休' : pad2(d.getDate())}</span>`;
  }
  return { html, info };
}

function viewHome() {
  const now = new Date();
  const { html: strip, info } = stampStrip();
  const reading = S.works.filter(w => w.status === 'reading')
    .sort((a, b) => (lastReadAt(b) || b.createdAt) - (lastReadAt(a) || a.createdAt));
  const needBackup = S.sessions.length > 0 && Date.now() - (S.settings.lastBackup || 0) > 7 * DAY;

  app.innerHTML = `
    <div class="row between"><h1>远征手账</h1><span class="muted">${now.getMonth() + 1}月${now.getDate()}日</span></div>
    <div class="muted">${info.n ? `连续远征 ${info.n} 天` : '今天开始第一天'} · 本周剩余休息 ${info.restLeft} 天${info.readToday ? ' · 今日已盖章' : ''}</div>
    <div class="stamp-strip">${strip}</div>
    ${needBackup ? `<div class="banner" data-go="/settings">已经一周多没有备份了，点此导出备份，防止数据丢失 →</div>` : ''}
    <h2>进行中的远征</h2>
    ${reading.length ? reading.map(workCardHTML).join('') : `<div class="empty">还没有进行中的作品<br><br><button class="btn-seal" data-go="/new">添加一部书或影视</button></div>`}
    ${reading.length ? `<button class="btn-main" data-go="/log/${reading[0].id}">记一笔 · ${h(reading[0].title)}</button>` : ''}
  `;

}

function workCardHTML(w) {
  const e = eta(w);
  const kindLabel = isScreen(w) ? '影视' : w.editions.map(x => EDITION_LABEL[x.kind]).join(' / ');
  return `<div class="card tap" data-go="/work/${w.id}">
    <div class="row between"><b class="grow" style="font-family:var(--serif)">${h(w.title)}</b><span class="kind">${kindLabel}</span></div>
    <div class="muted">${w.progress ? progressLabel(w) : '未开始'} · ${daysAgo(lastReadAt(w))}</div>
    ${progressBar(workPct(w))}
    ${e ? `<div class="muted small" style="margin-top:4px">按最近的节奏，预计 ${fmtDate(e)} 抵达终点</div>` : ''}
  </div>`;
}

// 外部链接不触发卡片的点击编辑
document.addEventListener('click', e => { if (e.target.closest('a.ext')) e.stopPropagation(); }, true);
// data-go 导航：全局委托，只绑定一次
document.addEventListener('click', e => {
  const t = e.target.closest('[data-go]');
  if (t) go(t.dataset.go);
});

// ---------- 书架 ----------
function viewShelf(tab = 'reading') {
  const tabs = [['reading', '进行中'], ['want', '想读想看'], ['done', '已完成']];
  const list = S.works.filter(w => w.status === tab).sort((a, b) => (b.finishedAt || b.createdAt) - (a.finishedAt || a.createdAt));
  app.innerHTML = `
    <div class="row between"><h1>书架</h1><button class="btn-seal btn-sm" data-go="/new">+ 新作品</button></div>
    <div class="tabs">${tabs.map(([k, n]) => `<a href="#/shelf/${k}" class="${k === tab ? 'on' : ''}">${n} ${S.works.filter(w => w.status === k).length}</a>`).join('')}</div>
    ${list.length ? list.map(w => tab === 'done' ? doneCardHTML(w) : workCardHTML(w)).join('') : `<div class="empty">这里还空着</div>`}
  `;

}
function doneCardHTML(w) {
  const r = w.review || {};
  return `<div class="card tap" data-go="/memorial/${w.id}">
    <div class="row between"><b style="font-family:var(--serif)">${h(w.title)}</b><span class="stamp">完</span></div>
    <div class="muted">${w.finishedAt ? fmtFullDate(w.finishedAt) + ' 抵达' : ''} ${r.rating ? ' · ' + '★'.repeat(r.rating) : ''}</div>
    ${r.oneLine ? `<div class="quote small">${h(r.oneLine)}</div>` : ''}
  </div>`;
}

// ---------- 新建 / 编辑作品 ----------
function viewWorkForm(id) {
  const w = id ? getWork(id) : null;
  if (id && !w) return go('/shelf');
  const type = w ? w.type : 'book';
  const paper = w && w.editions.find(e => e.kind === 'paper');
  const ebook = w && w.editions.find(e => e.kind === 'ebook');
  const screen = w && w.editions.find(e => e.kind === 'screen');
  app.innerHTML = `
    <h1>${w ? '编辑作品' : '新的远征'}</h1>
    <form id="f">
      <label>类型</label>
      <div class="chips" id="type">
        <span class="chip ${type === 'book' ? 'on' : ''}" data-v="book">书</span>
        <span class="chip ${type === 'screen' ? 'on' : ''}" data-v="screen">影视</span>
      </div>
      <label>名称</label><input name="title" required value="${h(w ? w.title : '')}" placeholder="海伯利安">
      <label id="authorLabel">${type === 'screen' ? '导演 / 出品' : '作者'}</label><input name="author" value="${h(w ? w.author : '')}" placeholder="丹·西蒙斯">
      <div class="grid2">
        <div><label>所属系列（可选）</label><input name="series" value="${h(w ? w.series : '')}" placeholder="海伯利安四部曲"></div>
        <div><label>系列中第几部</label><input name="seriesNo" type="number" min="1" value="${w && w.seriesNo ? w.seriesNo : ''}"></div>
      </div>
      <div id="bookFields" class="${type === 'screen' ? 'hidden' : ''}">
        <label>版本（可以都选）</label>
        <div class="card">
          <div class="row"><input type="checkbox" name="hasPaper" style="width:auto" ${!w || paper ? 'checked' : ''}> 纸质书，总页数
            <input name="pages" type="number" min="1" style="width:100px" value="${paper ? paper.total : ''}" placeholder="480"></div>
          <div class="row" style="margin-top:8px"><input type="checkbox" name="hasEbook" style="width:auto" ${ebook ? 'checked' : ''}> 电子书（按百分比记录）</div>
        </div>
        <label>章节目录（可选，一行一章，以后也可以补）</label>
        <textarea name="chapters" placeholder="序章&#10;牧师的故事&#10;上校的故事">${h(w && w.chapters ? w.chapters.join('\n') : '')}</textarea>
      </div>
      <div id="screenFields" class="${type === 'screen' ? '' : 'hidden'}">
        <label>总集数</label><input name="episodes" type="number" min="1" value="${screen ? screen.total : ''}" placeholder="24">
      </div>
      <label>状态</label>
      <select name="status">
        <option value="reading" ${!w || w.status === 'reading' ? 'selected' : ''}>进行中</option>
        <option value="want" ${w && w.status === 'want' ? 'selected' : ''}>想读想看</option>
        <option value="done" ${w && w.status === 'done' ? 'selected' : ''}>已完成</option>
      </select>
      <div style="margin-top:20px"><button class="btn-main" type="submit">${w ? '保存' : '启程'}</button></div>
      ${w ? `<div class="center" style="margin-top:20px"><button type="button" class="btn-ghost" id="del">删除这部作品</button></div>` : ''}
    </form>`;
  const typeEl = $('#type');
  bindChips(typeEl, v => {
    $('#bookFields').classList.toggle('hidden', v === 'screen');
    $('#screenFields').classList.toggle('hidden', v !== 'screen');
    $('#authorLabel').textContent = v === 'screen' ? '导演 / 出品' : '作者';
  });
  $('#f').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    const t = chipVal(typeEl) || 'book';
    const editions = [];
    if (t === 'screen') {
      const n = parseInt(f.episodes.value, 10);
      if (!n) return toast('请填写总集数');
      editions.push({ id: 'screen', kind: 'screen', total: n });
    } else {
      if (f.hasPaper.checked) {
        const n = parseInt(f.pages.value, 10);
        if (!n) return toast('请填写纸质书总页数');
        editions.push({ id: 'paper', kind: 'paper', total: n });
      }
      if (f.hasEbook.checked) editions.push({ id: 'ebook', kind: 'ebook', total: 100 });
      if (!editions.length) return toast('至少选择一个版本');
    }
    const data = {
      type: t,
      title: f.title.value.trim(),
      author: f.author.value.trim(),
      series: f.series.value.trim(),
      seriesNo: parseInt(f.seriesNo.value, 10) || null,
      editions,
      chapters: t === 'screen' ? [] : f.chapters.value.split('\n').map(s => s.trim()).filter(Boolean),
      status: f.status.value
    };
    let target = w;
    if (w) {
      Object.assign(w, data);
      if (w.progress && !w.editions.find(x => x.id === w.progress.editionId)) w.progress.editionId = w.editions[0].id;
    } else {
      target = { id: uid(), createdAt: Date.now(), progress: null, world: newWorld(), review: null, ...data };
      S.works.push(target);
    }
    if (target.status === 'done' && !target.finishedAt) target.finishedAt = Date.now();
    save();
    go('/work/' + target.id);
  });
  if (w) $('#del').addEventListener('click', () => {
    if (!confirm(`删除《${w.title}》以及它的所有记录和卡片？此操作无法撤销。`)) return;
    S.works = S.works.filter(x => x !== w);
    S.sessions = S.sessions.filter(s => s.workId !== w.id);
    S.cards = S.cards.filter(c => c.workId !== w.id);
    save();
    go('/shelf');
  });
}

// ---------- 作品详情 ----------
function viewWork(id, tab = 'route') {
  const w = getWork(id);
  if (!w) return go('/shelf');
  const tabs = [['route', '路线'], ['world', '世界'], ['timeline', '时间轴'], ['cards', '卡片'], ['info', '资料'], ['log', '日志']];
  const e = eta(w);
  const done = w.status === 'done';
  app.innerHTML = `
    <div class="row between"><a href="#/shelf/${w.status}" class="muted" style="text-decoration:none">← 书架</a>
      <a href="#/edit/${w.id}" class="muted" style="text-decoration:none">编辑</a></div>
    <h1 style="margin-top:6px">${h(w.title)}</h1>
    <div class="muted">${h(w.author || '')}${w.series ? ` · ${h(w.series)}${w.seriesNo ? ' 第' + w.seriesNo + '部' : ''}` : ''}</div>
    <div class="card">
      <div class="row between"><span>${w.progress ? progressLabel(w) : '尚未启程'}</span><b style="font-family:var(--serif)">${Math.round(workPct(w))}%</b></div>
      ${progressBar(workPct(w))}
      ${e ? `<div class="muted small" style="margin-top:4px">预计 ${fmtDate(e)} 抵达</div>` : ''}
      <div class="row" style="margin-top:10px">
        ${done ? `<button class="btn-main" data-go="/memorial/${w.id}">打开纪念册</button>` : `<button class="btn-main" data-go="/log/${w.id}">记录进度</button>`}
      </div>
      <div class="grid2" style="margin-top:8px">
        <button id="qn">随手记</button><button data-go="/recap/${w.id}">读前回顾</button>
      </div>
      <div class="row between" style="margin-top:6px">
        ${done ? `<button class="btn-ghost btn-sm" data-go="/log/${w.id}">再记一笔</button>` : ''}
        ${done ? '' : `<button class="btn-ghost btn-sm" data-go="/memorial/${w.id}">预览纪念册</button>`}
        ${!done && workPct(w) >= 100 ? `<button class="btn-seal btn-sm" data-go="/finish/${w.id}">完成远征</button>` : ''}
      </div>
    </div>
    <div class="tabs">${tabs.map(([k, n]) => `<a href="#/work/${w.id}/${k}" class="${k === tab ? 'on' : ''}">${n}</a>`).join('')}</div>
    <div id="tab"></div>`;

  $('#qn').onclick = () => pickKind(w, () => viewWork(id, tab));
  const el = $('#tab');
  ({ route: tabRoute, world: tabWorld, timeline: tabTimeline, cards: tabCards, info: tabInfo, log: tabLog }[tab] || tabRoute)(w, el);
}

function tabRoute(w, el) {
  const nodes = routeNodes(w);
  el.innerHTML = `
    <div class="muted small">${chapterList(w).length ? '' : '没有章节目录，按 10% 一站显示。可以在“编辑”里补充章节。'}点站点查看在那里记下的内容。</div>
    <div class="card" id="route">${routeSVG(w, { counts: true })}</div>`;
  $('#route').addEventListener('click', e => {
    const g = e.target.closest('[data-node]');
    if (!g) return;
    const idx = Number(g.dataset.node);
    const cards = cardsAtNode(w, idx, nodes.length).sort((a, b) => (a.pct || 0) - (b.pct || 0));
    const m = openModal(`<h3>${h(nodes[idx].label)}</h3>
      ${cards.length ? cards.map(cardHTML).join('') : `<div class="empty">这一站还没有记录</div>`}
      <button class="btn-main" id="cl">关闭</button>`);
    $('#cl', m).onclick = closeModal;
    m.addEventListener('click', ev => { const c = ev.target.closest('[data-card]'); if (c) { const card = S.cards.find(x => x.id === c.dataset.card); openCardForm(w, card.kind, { card, after: () => render() }); } });
  });
}

// ----- 世界地图 -----
const worldUI = { mode: 'view', brush: 'plain', R: 18, pinCard: null };
function tabWorld(w, el) {
  if (!w.world) w.world = newWorld();
  const pending = workCards(w, 'place').filter(c => !w.world.pins.some(p => p.cardId === c.id));
  const brushes = Object.entries(TERRAIN).map(([k, t]) => `<span class="chip ${worldUI.brush === k ? 'on' : ''}" data-v="${k}">${t.glyph ? t.glyph + ' ' : ''}${t.name}</span>`).join('') +
    `<span class="chip ${worldUI.brush === 'erase' ? 'on' : ''}" data-v="erase">擦除</span>`;
  el.innerHTML = `
    <div class="row between wrap">
      <div class="chips" id="mode">
        <span class="chip ${worldUI.mode === 'view' ? 'on' : ''}" data-v="view">探索</span>
        <span class="chip ${worldUI.mode === 'paint' ? 'on' : ''}" data-v="paint">绘制</span>
        <span class="chip ${worldUI.mode === 'pin' ? 'on' : ''}" data-v="pin">放置地点</span>
      </div>
      <span class="muted small">已揭开 ${revealPct(w)}%</span>
    </div>
    <div class="chips ${worldUI.mode === 'paint' ? '' : 'hidden'}" id="brush" style="margin-top:8px">${brushes}</div>
    <div class="${worldUI.mode === 'pin' ? '' : 'hidden'}" style="margin-top:8px">
      ${pending.length ? `<div class="muted small">选一个地点，再点地图上的格子：</div><div class="chips" id="pend" style="margin-top:4px">${pending.map(c => `<span class="chip ${worldUI.pinCard === c.id ? 'on' : ''}" data-v="${c.id}">${h(c.title)}</span>`).join('')}</div>`
        : `<div class="muted small">没有待放置的地点。读书时用“随手记 → 地点”记下新地点，它们会出现在这里。已放置的地点钉可以在这个模式下点选后移动。</div>`}
    </div>
    <div class="map-wrap ${worldUI.mode === 'paint' ? '' : 'scroll'}" id="map" style="margin-top:8px">${worldSVG(w, { fog: worldUI.mode === 'view', R: worldUI.R, selected: worldUI.pinCard })}</div>
    <div class="row" style="margin-top:8px">
      <span class="muted small">缩放</span><input type="range" id="zoom" min="10" max="34" step="1" value="${worldUI.R}" class="grow">
      <button class="btn-sm" id="size">画布大小</button>
    </div>
    <div class="muted small" style="margin-top:6px">${worldUI.mode === 'view' ? '灰色是迷雾：地点钉周围两圈会被揭开。虚线是按书中顺序连起来的足迹。' : worldUI.mode === 'paint' ? '选择地形后在格子上点按或拖动涂抹。绘制时不显示迷雾。' : ''}</div>
    <button class="btn-sm" id="addPlace" style="margin-top:8px">+ 记一个地点</button>`;

  const rerender = () => tabWorld(w, el);
  bindChips($('#mode', el), v => { worldUI.mode = v || 'view'; rerender(); });
  bindChips($('#brush', el), v => { worldUI.brush = v || 'plain'; });
  if ($('#pend', el)) bindChips($('#pend', el), v => { worldUI.pinCard = v; });
  $('#zoom', el).addEventListener('change', e => { worldUI.R = Number(e.target.value); rerender(); });
  $('#addPlace', el).onclick = () => openCardForm(w, 'place', { after: rerender });
  $('#size', el).onclick = () => {
    const m = openModal(`<h3>画布大小</h3><div class="muted small">缩小画布会丢掉超出范围的地形和地点钉。</div>
      <div class="grid2"><div><label>列数</label><input id="cols" type="number" min="6" max="60" value="${w.world.cols}"></div>
      <div><label>行数</label><input id="rows" type="number" min="6" max="80" value="${w.world.rows}"></div></div>
      <div style="margin-top:16px"><button class="btn-main" id="ok">确定</button></div>`);
    $('#ok', m).onclick = () => {
      const cols = clamp(parseInt($('#cols', m).value, 10) || 16, 6, 60);
      const rows = clamp(parseInt($('#rows', m).value, 10) || 20, 6, 80);
      w.world.cols = cols; w.world.rows = rows;
      for (const k of Object.keys(w.world.cells)) { const [c, r] = k.split(',').map(Number); if (c >= cols || r >= rows) delete w.world.cells[k]; }
      w.world.pins = w.world.pins.filter(p => p.c < cols && p.r < rows);
      save(); closeModal(); rerender();
    };
  };

  const map = $('#map', el);
  const cellOf = (x, y) => { const t = document.elementFromPoint(x, y); return t && t.matches && t.matches('polygon[data-c]') ? t : null; };
  let painting = false, dirty = false;
  const paint = poly => {
    const k = `${poly.dataset.c},${poly.dataset.r}`;
    if (worldUI.brush === 'erase') { if (!w.world.cells[k]) return; delete w.world.cells[k]; poly.setAttribute('fill', 'var(--card)'); }
    else { if (w.world.cells[k] === worldUI.brush) return; w.world.cells[k] = worldUI.brush; poly.setAttribute('fill', TERRAIN[worldUI.brush].fill); }
    dirty = true;
  };
  map.addEventListener('pointerdown', e => {
    if (worldUI.mode !== 'paint') return;
    const p = cellOf(e.clientX, e.clientY);
    if (!p) return;
    painting = true; map.setPointerCapture(e.pointerId); paint(p); e.preventDefault();
  });
  map.addEventListener('pointermove', e => { if (painting) { const p = cellOf(e.clientX, e.clientY); if (p) paint(p); } });
  const stop = () => { if (painting) { painting = false; if (dirty) { save(); const sl = map.scrollLeft, st = map.scrollTop; map.innerHTML = worldSVG(w, { fog: false, R: worldUI.R }); map.scrollLeft = sl; map.scrollTop = st; dirty = false; } } };
  map.addEventListener('pointerup', stop);
  map.addEventListener('pointercancel', stop);

  map.addEventListener('click', e => {
    const pin = e.target.closest('[data-pin]');
    if (worldUI.mode === 'pin') {
      if (pin) { worldUI.pinCard = pin.dataset.pin; rerender(); toast('已选中，点一个格子移动它'); return; }
      const poly = e.target.closest('polygon[data-c]');
      if (!poly) return;
      if (!worldUI.pinCard) return toast('先在上面选一个地点');
      const c = Number(poly.dataset.c), r = Number(poly.dataset.r);
      const ex = w.world.pins.find(p => p.cardId === worldUI.pinCard);
      if (ex) { ex.c = c; ex.r = r; } else w.world.pins.push({ cardId: worldUI.pinCard, c, r });
      if (!w.world.cells[`${c},${r}`]) w.world.cells[`${c},${r}`] = 'plain';
      worldUI.pinCard = null;
      save(); rerender();
      return;
    }
    if (worldUI.mode === 'view' && pin) {
      const card = S.cards.find(c => c.id === pin.dataset.pin);
      const m = openModal(`${cardHTML(card)}<div class="row" style="margin-top:12px">
        <button class="grow" id="ed">编辑</button><button class="grow" id="rm">移除地点钉</button></div>`);
      $('#ed', m).onclick = () => openCardForm(w, 'place', { card, after: rerender });
      $('#rm', m).onclick = () => { w.world.pins = w.world.pins.filter(p => p.cardId !== card.id); save(); closeModal(); rerender(); };
    }
  });
}

// ----- 时间轴 -----
function tabTimeline(w, el) {
  const events = workCards(w, 'event').sort((a, b) => (a.pct || 0) - (b.pct || 0));
  const pct = workPct(w);
  let nowShown = false;
  const items = [];
  for (const c of events) {
    if (!nowShown && (c.pct || 0) > pct) { items.push(nowMarker(pct)); nowShown = true; }
    items.push(`<div style="position:relative;padding:0 0 14px 22px;cursor:pointer" data-card="${c.id}">
      <span style="position:absolute;left:-6px;top:4px;width:11px;height:11px;border-radius:50%;background:var(--ink)"></span>
      ${c.when ? `<div style="font-family:var(--serif);color:var(--seal)">${h(c.when)}</div>` : ''}
      <b>${h(c.title)}</b><div class="anchor">${h(c.anchor || '')}</div>
      ${c.body ? `<div class="small">${h(c.body)}</div>` : ''}</div>`);
  }
  if (!nowShown) items.push(nowMarker(pct));
  el.innerHTML = `
    <div class="muted small">书中发生的大事。可以填“书中时间”（比如 2061 年、第三纪元），按阅读位置排列。</div>
    <div style="border-left:2px solid var(--line);margin:14px 0 0 8px;padding-top:4px" id="tl">${items.join('')}</div>
    <button class="btn-sm" id="add">+ 记一个事件</button>`;
  $('#add', el).onclick = () => openCardForm(w, 'event', { after: () => tabTimeline(w, el) });
  $('#tl', el).addEventListener('click', e => {
    const c = e.target.closest('[data-card]');
    if (c) openCardForm(w, 'event', { card: S.cards.find(x => x.id === c.dataset.card), after: () => tabTimeline(w, el) });
  });
}
function nowMarker(pct) {
  return `<div style="position:relative;padding:0 0 14px 22px"><span style="position:absolute;left:-9px;top:2px" class="stamp">今</span>
    <span class="muted" style="margin-left:14px">你现在在这里 · ${Math.round(pct)}%</span></div>`;
}

// ----- 卡片 -----
const cardsUI = { kind: '' };
function tabCards(w, el) {
  const list = workCards(w, cardsUI.kind || null).sort((a, b) => (a.pct || 0) - (b.pct || 0));
  const kinds = [['', '全部'], ...Object.entries(CARD_KINDS).filter(([k]) => k !== 'photo')];
  el.innerHTML = `
    <div class="chips" id="kf">${kinds.map(([k, n]) => `<span class="chip ${cardsUI.kind === k ? 'on' : ''}" data-v="${k}">${n} ${workCards(w, k || null).length + (k === 'quote' ? workCards(w, 'photo').length : 0)}</span>`).join('')}</div>
    <div id="list">${list.length || cardsUI.kind === 'quote' ? '' : `<div class="empty">还没有卡片。读书时点“随手记”就能收录。</div>`}
      ${(cardsUI.kind === 'quote' ? [...list, ...workCards(w, 'photo')].sort((a, b) => (a.pct || 0) - (b.pct || 0)) : list).map(cardHTML).join('')}</div>
    <button class="btn-sm" id="add">+ 新卡片</button>`;
  bindChips($('#kf', el), v => { cardsUI.kind = v || ''; tabCards(w, el); });
  $('#add', el).onclick = () => pickKind(w, () => tabCards(w, el));
  $('#list', el).addEventListener('click', e => {
    const c = e.target.closest('[data-card]');
    if (!c) return;
    const card = S.cards.find(x => x.id === c.dataset.card);
    openCardForm(w, card.kind, { card, after: () => tabCards(w, el) });
  });
}

function cardHTML(c) {
  const kind = `<span class="kind">${CARD_KINDS[c.kind]}</span>`;
  const verdict = c.kind === 'guess' ? (c.result ? `<span class="stamp" style="margin-left:6px">${{ right: '猜对', wrong: '猜错', partial: '半对' }[c.result]}</span>` : `<span class="stamp off" style="margin-left:6px;font-size:11px">待揭晓</span>`) : '';
  let body = '';
  if (c.kind === 'quote') body = `<div class="quote">${h(c.body)}</div>${c.note ? `<div class="small">${h(c.note)}</div>` : ''}`;
  else if (c.kind === 'photo') body = `${c.photo ? `<img class="photo" src="${c.photo}" alt="书页照片">` : ''}${c.body ? `<div class="small">${h(c.body)}</div>` : ''}`;
  else body = c.body ? `<div class="small" style="white-space:pre-wrap">${h(c.body)}</div>` : '';
  const extra = [c.faction && `阵营：${h(c.faction)}`, c.when && `书中时间：${h(c.when)}`].filter(Boolean).join(' · ');
  return `<div class="card tap" data-card="${c.id}">
    <div class="row">${kind}<b class="grow">${h(c.title || (c.kind === 'quote' ? '摘抄' : c.kind === 'photo' ? '书页' : ''))}</b>${verdict}</div>
    ${extra ? `<div class="muted small">${extra}</div>` : ''}${body}${c.url ? `<div>${linkHTML(c.url)}</div>` : ''}${addSummary(c)}
    <div class="anchor">${h(c.anchor || '')}</div></div>`;
}

// ----- 资料 -----
const INFO_PRESETS = ['作者背景', '创作背景', '世界观设定', '科学知识', '历史与现实原型', '延伸阅读', '影视改编'];
const safeUrl = u => (/^https?:\/\//i.test(u) ? u : 'https://' + u);
const shortUrl = u => u.replace(/^https?:\/\//i, '').slice(0, 40);
const linkHTML = (url, title) => `<a class="ext small" href="${h(safeUrl(url))}" target="_blank" rel="noopener">${h(title || shortUrl(url))} ↗</a>`;
const linksHTML = links => ((links || []).length ? `<div style="margin-top:4px">${links.map(l => `<div>${linkHTML(l.url, l.title)}</div>`).join('')}</div>` : '');

// 一行一个链接，网址前面的文字作为标题
function parseLinks(text) {
  return text.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
    const m = line.match(/(https?:\/\/\S+|www\.\S+)/i);
    return m ? { title: line.replace(m[0], '').trim(), url: m[0] } : null;
  }).filter(Boolean);
}

function tabInfo(w, el) {
  const list = w.info || [];
  el.innerHTML = `
    <div class="muted small">关于这部作品的背景知识：作者、创作背景、世界观、书里涉及的科学和历史。随时整理补充。</div>
    <div id="infoList">${list.length ? list.map(x => `<div class="card tap" data-info="${x.id}">
      <h3>${h(x.title)}</h3>${x.body ? `<div class="small" style="white-space:pre-wrap;margin-top:4px">${h(x.body)}</div>` : ''}
      ${x.photo ? `<img class="photo" src="${x.photo}" alt="">` : ''}${linksHTML(x.links)}
      <div class="anchor">更新于 ${fmtDate(x.updatedAt || x.createdAt)}</div></div>`).join('')
      : `<div class="empty">还没有资料。可以从作者背景、世界观设定开始。</div>`}</div>
    <button class="btn-sm" id="add">+ 添加资料</button>`;
  const re = () => tabInfo(w, el);
  $('#add', el).onclick = () => openInfoForm(w, null, re);
  $('#infoList', el).addEventListener('click', e => {
    const c = e.target.closest('[data-info]');
    if (c) openInfoForm(w, w.info.find(x => x.id === c.dataset.info), re);
  });
}

function openInfoForm(w, sec, after) {
  const m = openModal(`<h3>${sec ? '编辑' : '添加'}资料</h3>
    <label>主题</label><div class="chips" id="ip">${INFO_PRESETS.map(t => `<span class="chip" data-v="${t}">${t}</span>`).join('')}</div>
    <input id="it" style="margin-top:6px" value="${h(sec ? sec.title : '')}" placeholder="或者自己写一个主题">
    <label>内容</label><textarea id="ib" style="min-height:140px">${h(sec ? sec.body : '')}</textarea>
    <label>链接（一行一个，网址前可以写标题）</label>
    <textarea id="il" style="min-height:60px" placeholder="维基百科 https://zh.wikipedia.org/...">${h(sec ? (sec.links || []).map(l => (l.title ? l.title + ' ' : '') + l.url).join('\n') : '')}</textarea>
    <label>图片（可选）</label><input id="iph" type="file" accept="image/*">
    ${sec && sec.photo ? `<img class="photo" src="${sec.photo}" alt=""><div class="row"><input type="checkbox" id="irm" style="width:auto"> 移除图片</div>` : ''}
    <div class="row" style="margin-top:18px">${sec ? '<button id="idel" class="btn-ghost">删除</button>' : ''}<button class="btn-main grow" id="iok">保存</button></div>`);
  bindChips($('#ip', m), v => { if (v) $('#it', m).value = v; });
  $('#iok', m).onclick = async () => {
    const title = $('#it', m).value.trim();
    if (!title) return toast('写个主题');
    let photo = sec ? sec.photo : null;
    if ($('#irm', m) && $('#irm', m).checked) photo = null;
    const f = $('#iph', m).files[0];
    if (f) { try { photo = await compressImage(f); } catch { return toast('图片读取失败'); } }
    const data = { title, body: $('#ib', m).value.trim(), links: parseLinks($('#il', m).value), photo, updatedAt: Date.now() };
    if (sec) Object.assign(sec, data);
    else (w.info = w.info || []).push({ id: uid(), createdAt: Date.now(), ...data });
    save(); closeModal(); after && after();
  };
  if (sec) $('#idel', m).onclick = () => {
    if (!confirm('删除这条资料？')) return;
    w.info = w.info.filter(x => x !== sec);
    save(); closeModal(); after && after();
  };
}

// ----- 卡片补充：随阅读不断加深的认识 -----
function addSummary(c) {
  const a = c.addenda || [];
  if (!a.length) return '';
  return `<div class="small" style="margin-top:4px;color:var(--sub)">补充 ${a.length} 条 · 最新：${h(a[a.length - 1].body.slice(0, 40))}</div>`;
}
const addendaList = c => (c.addenda || []).map(a => `<div class="small" style="margin-top:2px">→ <span class="anchor">${h(a.anchor || '')}</span> ${h(a.body)}${a.url ? ' ' + linkHTML(a.url) : ''}</div>`).join('');

function addendaItems(card) {
  const a = card.addenda || [];
  return a.length ? a.map(x => `<div class="card" style="margin:6px 0;padding:8px 10px">
      <div class="small" style="white-space:pre-wrap">${h(x.body)}</div>${x.url ? linkHTML(x.url) : ''}
      <div class="row between"><span class="anchor">${h(x.anchor || '')} · ${fmtDate(x.createdAt)}</span>
      <button class="btn-ghost btn-sm" data-deladd="${x.id}" aria-label="删除补充">×</button></div></div>`).join('')
    : '<div class="muted small">还没有补充。读到后面对它有了新认识，就在这里追加一条。</div>';
}
function addendaHTML(card) {
  return `<label>补充（随阅读追加，记录认识的变化）</label><div id="adds">${addendaItems(card)}</div>
    <textarea id="addBody" placeholder="新的认识、后来的变化……" style="min-height:56px"></textarea>
    <div class="row" style="margin-top:6px"><input id="addUrl" class="grow" placeholder="相关链接（可选）"><button id="addOk" class="btn-sm">追加</button></div>`;
}
function bindAddenda(m, w, card) {
  $('#addOk', m).onclick = () => {
    const body = $('#addBody', m).value.trim();
    if (!body) return toast('写点什么再追加');
    const p = w.progress || {};
    const ed = editionOf(w, p.editionId);
    const v = p.editionId === ed.id ? p.value || 0 : pctToValue(ed, workPct(w));
    const anc = anchorFor(w, ed.id, v, p.chapterIdx);
    (card.addenda = card.addenda || []).push({ id: uid(), body, url: $('#addUrl', m).value.trim(), pct: anc.pct, anchor: anc.label, createdAt: Date.now() });
    save();
    $('#addBody', m).value = '';
    $('#addUrl', m).value = '';
    $('#adds', m).innerHTML = addendaItems(card);
    toast('已追加');
  };
  $('#adds', m).addEventListener('click', e => {
    const b = e.target.closest('[data-deladd]');
    if (!b || !confirm('删除这条补充？')) return;
    card.addenda = card.addenda.filter(x => x.id !== b.dataset.deladd);
    save();
    $('#adds', m).innerHTML = addendaItems(card);
  });
}

// ----- 日志 -----
function tabLog(w, el) {
  const ss = workSessions(w).slice().reverse();
  const notes = workCards(w, 'note');
  const items = [
    ...ss.map(s => ({ t: s.end, html: sessionHTML(w, s) })),
    ...notes.map(c => ({ t: c.createdAt, html: cardHTML(c) }))
  ].sort((a, b) => b.t - a.t);
  const total = ss.reduce((a, s) => a + (s.duration || 0), 0);
  el.innerHTML = `
    ${moodSVG(w) ? `<div class="card"><div class="muted small">情绪曲线</div>${moodSVG(w)}</div>` : ''}
    <div class="muted small">共 ${ss.length} 次 · ${fmtDur(total)}</div>
    <div id="list">${items.length ? items.map(i => i.html).join('') : `<div class="empty">还没有记录</div>`}</div>
    <button class="btn-sm" id="add">+ 写一段随笔</button>`;
  $('#add', el).onclick = () => openCardForm(w, 'note', { after: () => tabLog(w, el) });
  $('#list', el).addEventListener('click', e => {
    const del = e.target.closest('[data-delsession]');
    if (del) {
      if (!confirm('删除这次记录？作品的当前进度不会改变。')) return;
      S.sessions = S.sessions.filter(s => s.id !== del.dataset.delsession);
      save(); tabLog(w, el); return;
    }
    const c = e.target.closest('[data-card]');
    if (c) openCardForm(w, 'note', { card: S.cards.find(x => x.id === c.dataset.card), after: () => tabLog(w, el) });
  });
}
function sessionHTML(w, s) {
  const ed = editionOf(w, s.editionId);
  return `<div class="card">
    <div class="row between"><b style="font-family:var(--serif)">${fmtDate(s.end)}</b>
      <span class="row">${s.mood ? `<span class="stamp">${s.mood}</span>` : ''}<button class="btn-ghost btn-sm" data-delsession="${s.id}" aria-label="删除">×</button></span></div>
    <div class="muted small">${EDITION_LABEL[ed.kind]} · ${valueLabel(ed, s.fromValue)} → ${valueLabel(ed, s.toValue)}${s.duration ? ' · ' + fmtDur(s.duration) : ''}</div>
    ${s.giveUp ? `<div class="small" style="color:var(--seal)">差点放弃${s.giveUpWhy ? '：' + h(s.giveUpWhy) : ''}</div>` : ''}
  </div>`;
}

// ---------- 卡片表单 ----------
function pickKind(w, after) {
  const m = openModal(`<h3>记点什么？</h3><div class="grid4" style="margin-top:12px">
    ${Object.entries(CARD_KINDS).map(([k, n]) => `<button class="quick" data-k="${k}">${n === '书页' ? '拍书页' : n}</button>`).join('')}</div>`);
  m.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) openCardForm(w, b.dataset.k, { after }); });
}

const CARD_FIELDS = {
  knowledge: { title: '知识点', body: '说明', ph: '书里提到的真实知识：一首诗、一个物理概念、一段历史……' },
  person: { title: '名字', body: '一句话印象', ph: '性格、身份、和谁有关……' },
  place: { title: '地名', body: '描述', ph: '这是个什么地方' },
  term: { title: '名词', body: '解释', ph: '书里是怎么说的' },
  event: { title: '发生了什么', body: '详情', ph: '' },
  quote: { title: null, body: '摘抄原文', ph: '' },
  photo: { title: null, body: '说明（可选）', ph: '' },
  guess: { title: '我的猜测', body: '理由', ph: '为什么这样想' },
  note: { title: null, body: '随笔', ph: '此刻的想法……' }
};

function openCardForm(w, kind, { card = null, anchor = null, after = null } = {}) {
  const F = CARD_FIELDS[kind];
  const p = w.progress || {};
  const edId = card ? card.editionId || p.editionId : (anchor ? anchor.editionId : p.editionId);
  const ed = editionOf(w, edId);
  const value = card ? (card.value ?? pctToValue(ed, card.pct || 0)) : anchor ? anchor.value : (p.editionId === ed.id ? p.value || 0 : pctToValue(ed, workPct(w)));
  const chIdx = card ? card.chapterIdx : (anchor ? anchor.chapterIdx : p.chapterIdx);
  const ch = isScreen(w) ? [] : chapterList(w);
  const m = openModal(`
    <h3>${card ? '编辑' : '新'}${CARD_KINDS[kind]}</h3>
    ${F.title ? `<label>${F.title}</label><input id="ct" value="${h(card ? card.title : '')}">` : ''}
    ${kind === 'photo' ? `<label>书页照片</label><input id="cp" type="file" accept="image/*" capture="environment">
      ${card && card.photo ? `<img class="photo" src="${card.photo}" alt="">` : ''}` : ''}
    <label>${F.body}</label><textarea id="cb" placeholder="${F.ph}">${h(card ? card.body : '')}</textarea>
    ${kind === 'quote' ? `<label>我的批注（可选）</label><input id="cn" value="${h(card ? card.note || '' : '')}">` : ''}
    ${kind === 'person' ? `<label>阵营 / 身份（可选）</label><input id="cf" value="${h(card ? card.faction || '' : '')}">` : ''}
    ${kind === 'event' ? `<label>书中时间（可选）</label><input id="cw" value="${h(card ? card.when || '' : '')}" placeholder="2061 年">` : ''}
    ${kind === 'knowledge' ? `<label>参考链接（可选）</label><input id="cu" value="${h(card ? card.url || '' : '')}" placeholder="https://">` : ''}
    ${card ? addendaHTML(card) : ''}
    ${kind === 'guess' && card ? `<label>揭晓了吗？</label><div class="chips" id="cr" data-allow-none="1">
      ${[['right', '猜对'], ['partial', '半对'], ['wrong', '猜错']].map(([k, n]) => `<span class="chip ${card.result === k ? 'on' : ''}" data-v="${k}">${n}</span>`).join('')}</div>` : ''}
    <label>位置（${EDITION_LABEL[ed.kind]}）</label>
    <div class="row"><input id="cv" type="number" step="${ed.kind === 'ebook' ? '0.1' : '1'}" value="${value}" style="width:110px">
      <span class="muted">${ed.kind === 'ebook' ? '%' : ed.kind === 'screen' ? '集' : '页'}</span>
      ${ch.length ? `<select id="cc" class="grow"><option value="">章节</option>${ch.map((c, i) => `<option value="${i}" ${chIdx === i ? 'selected' : ''}>${h(c)}</option>`).join('')}</select>` : ''}
    </div>
    <div class="row" style="margin-top:18px">
      ${card ? `<button id="cdel" class="btn-ghost">删除</button>` : ''}
      <button class="btn-main grow" id="cok">保存</button>
    </div>`);
  if ($('#cr', m)) bindChips($('#cr', m));
  if (card) bindAddenda(m, w, card);
  setTimeout(() => { const f = $('#ct', m) || $('#cb', m); if (f && !card) f.focus(); }, 50);
  $('#cok', m).onclick = async () => {
    const title = $('#ct', m) ? $('#ct', m).value.trim() : '';
    const body = $('#cb', m).value.trim();
    if (F.title && !title) return toast(`请填写${F.title}`);
    if (!F.title && kind !== 'photo' && !body) return toast(`请填写${F.body}`);
    let photo = card ? card.photo : null;
    const file = $('#cp', m) && $('#cp', m).files[0];
    if (file) { try { photo = await compressImage(file); } catch { return toast('图片读取失败'); } }
    if (kind === 'photo' && !photo) return toast('请拍一张书页');
    const v = Number($('#cv', m).value) || 0;
    const ci = $('#cc', m) && $('#cc', m).value !== '' ? Number($('#cc', m).value) : null;
    const anc = anchorFor(w, ed.id, v, ci);
    const data = {
      title, body, photo,
      note: $('#cn', m) ? $('#cn', m).value.trim() : undefined,
      faction: $('#cf', m) ? $('#cf', m).value.trim() : undefined,
      when: $('#cw', m) ? $('#cw', m).value.trim() : undefined,
      url: $('#cu', m) ? $('#cu', m).value.trim() : undefined,
      result: $('#cr', m) ? chipVal($('#cr', m)) : (card ? card.result : null),
      editionId: ed.id, value: v, pct: anc.pct, chapterIdx: ci, anchor: anc.label
    };
    if (card) Object.assign(card, data);
    else S.cards.push({ id: uid(), workId: w.id, kind, createdAt: Date.now(), ...data });
    save(); closeModal();
    toast(card ? '已更新' : `已收录${CARD_KINDS[kind]}`);
    after && after();
  };
  if (card) $('#cdel', m).onclick = () => {
    if (!confirm('删除这张卡片？')) return;
    S.cards = S.cards.filter(c => c !== card);
    if (w.world) w.world.pins = w.world.pins.filter(p => p.cardId !== card.id);
    save(); closeModal(); after && after();
  };
}

// ---------- 读前回顾（可选，不计时） ----------
function viewRecap(id) {
  const w = getWork(id);
  if (!w) return go('/');
  const last = lastReadAt(w);
  const gap = last ? Math.floor((Date.now() - last) / DAY) : 0;
  const pool = S.cards.filter(c => c.workId === w.id && ['person', 'place', 'term', 'event', 'knowledge'].includes(c.kind));
  const picks = pool.sort(() => Math.random() - 0.5).slice(0, 3);
  const recent = [...workCards(w, 'event'), ...workCards(w, 'note')].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3);
  app.innerHTML = `
    <a href="#/work/${w.id}" class="muted" style="text-decoration:none">← ${h(w.title)}</a>
    <h1 style="margin-top:6px">读前回顾</h1>
    <div class="muted">${w.progress ? '上次到 ' + progressLabel(w) : '第一次启程'}${last ? ' · ' + daysAgo(last) : ''}</div>
    ${recent.length ? `<h2>前情提要</h2><div class="card">${gap >= 2 ? `<div class="muted small">已经 ${gap} 天没${workUnitVerb(w)}了。上次说到：</div>` : ''}
      ${recent.map(c => `<div style="margin-top:6px">· ${h(c.title || c.body)}${c.title && c.body ? `：<span class="muted">${h(c.body.slice(0, 60))}</span>` : ''}</div>`).join('')}</div>` : ''}
    ${picks.length ? `<h2>还记得吗？</h2><div class="muted small">点卡片翻面</div>
      ${picks.map(c => `<div class="flip"><div class="face front"><span class="kind">${CARD_KINDS[c.kind]}</span><b style="font-family:var(--serif);font-size:17px">${h(c.title)}</b><div class="muted small">${h(c.anchor || '')}</div></div>
        <div class="face back"><b>${h(c.title)}</b>${c.faction ? ` <span class="muted">· ${h(c.faction)}</span>` : ''}<div style="white-space:pre-wrap">${h(c.body || '（没写描述）')}</div>
        ${(c.addenda || []).map(a => `<div class="small" style="margin-top:4px">+ ${h(a.body)} <span class="anchor">${h(a.anchor)}</span></div>`).join('')}</div></div>`).join('')}` : ''}
    ${!recent.length && !picks.length ? `<div class="empty">还没有卡片可以回顾。读的时候想到什么，随时用“随手记”收录。</div>` : ''}
    <div style="margin-top:22px"><button class="btn-main" data-go="/work/${w.id}">去读吧</button></div>
    <div class="center" style="margin-top:10px"><button class="btn-ghost btn-sm" data-go="/log/${w.id}">读完了？记录进度</button></div>`;
  $$('.flip').forEach(f => f.addEventListener('click', () => f.classList.toggle('open')));
}

// 记录进度表单：读完后记一笔，不需要计时
function endFormHTML(w, edId) {
  const ed = editionOf(w, edId);
  const cur = w.progress && w.progress.editionId === ed.id ? w.progress.value : pctToValue(ed, workPct(w));
  const ch = isScreen(w) ? [] : chapterList(w);
  const ci = w.progress ? w.progress.chapterIdx : null;
  const unit = ed.kind === 'ebook' ? '读到百分之几？' : ed.kind === 'screen' ? '看到第几集？' : '读到第几页？';
  return `
    ${w.editions.length > 1 ? `<label>版本</label><div class="chips" id="eEd">${w.editions.map(e => `<span class="chip ${e.id === ed.id ? 'on' : ''}" data-v="${e.id}">${EDITION_LABEL[e.kind]}</span>`).join('')}</div>` : ''}
    <label id="eUnit">${unit}</label>
    <input id="eVal" class="big-num" type="number" inputmode="decimal" step="${ed.kind === 'ebook' ? '0.1' : '1'}" min="0" max="${ed.kind === 'ebook' ? 100 : ed.total}" value="${cur || ''}">
    <div class="muted small center" id="eTotal">共 ${totalLabel(ed)}</div>
    ${ch.length ? `<label>当前章节</label><select id="eCh"><option value="">不选</option>${ch.map((c, i) => `<option value="${i}" ${ci === i ? 'selected' : ''}>${h(c)}</option>`).join('')}</select>` : ''}
    <label>此刻的心情（可选）</label>
    <div class="chips" id="eMood" data-allow-none="1">${MOODS.map(m => `<span class="chip" data-v="${m}">${m}</span>`).join('')}</div>
    <div class="row" style="margin-top:12px"><input type="checkbox" id="eGive" style="width:auto"> <span>有点读不下去了</span></div>
    <input id="eGiveWhy" class="hidden" placeholder="为什么？（以后回看会很有意思）" style="margin-top:6px">
    <label>一句话（可选，会存为随笔）</label>
    <textarea id="eNote" style="min-height:56px"></textarea>
    <details style="margin-top:10px"><summary class="muted small">不是今天读的？</summary>
      <div class="grid2"><div><label>日期</label><input id="eDate" type="date" value="${dayKey(Date.now())}" max="${dayKey(Date.now())}"></div>
      <div><label>大约几分钟（可不填）</label><input id="eMin" type="number" min="1" placeholder="不填"></div></div></details>
    <div style="margin-top:16px"><button class="btn-main" id="eOk">记下并盖章</button></div>`;
}

function bindEndForm(root, w, base) {
  let edId = base.editionId;
  const edEl = $('#eEd', root);
  if (edEl) bindChips(edEl, v => {
    if (!v) return;
    edId = v;
    const ed = editionOf(w, v);
    const inp = $('#eVal', root);
    inp.value = pctToValue(ed, workPct(w)) || '';
    inp.step = ed.kind === 'ebook' ? '0.1' : '1';
    inp.max = ed.kind === 'ebook' ? 100 : ed.total;
    $('#eTotal', root).textContent = '共 ' + totalLabel(ed);
    $('#eUnit', root).textContent = ed.kind === 'ebook' ? '读到百分之几？' : ed.kind === 'screen' ? '看到第几集？' : '读到第几页？';
  });
  bindChips($('#eMood', root));
  $('#eGive', root).onchange = e => $('#eGiveWhy', root).classList.toggle('hidden', !e.target.checked);
  setTimeout(() => { const i = $('#eVal', root); i.focus(); i.select && i.select(); }, 80);
  $('#eOk', root).onclick = () => {
    const ed = editionOf(w, edId);
    const raw = $('#eVal', root).value;
    if (raw === '') return toast('填一下读到哪里');
    const v = Number(raw);
    const max = ed.kind === 'ebook' ? 100 : ed.total;
    if (v < 0 || v > max) return toast(`进度应在 0 到 ${max} 之间`);
    const chEl = $('#eCh', root);
    const ci = chEl && chEl.value !== '' ? Number(chEl.value) : (w.progress ? w.progress.chapterIdx : null);
    const d = $('#eDate', root).value;
    const end = d && d !== dayKey(Date.now()) ? new Date(d + 'T21:00').getTime() : Date.now();
    const duration = (Number($('#eMin', root).value) || 0) * 60;
    const fromValue = ed.id === base.editionId ? base.fromValue : pctToValue(ed, base.fromPct);
    const toPct = valueToPct(ed, v);
    S.sessions.push({
      id: uid(), workId: w.id, editionId: ed.id, start: end - duration * 1000, end, duration,
      fromValue, toValue: v, fromPct: base.fromPct, toPct, chapterIdx: ci,
      mood: chipVal($('#eMood', root)), giveUp: $('#eGive', root).checked,
      giveUpWhy: $('#eGiveWhy', root).value.trim()
    });
    const isLatest = !w.progress || end >= (w.progress.updatedAt || 0);
    if (isLatest) w.progress = { pct: toPct, value: v, editionId: ed.id, chapterIdx: ci, updatedAt: end };
    if (w.status === 'want') w.status = 'reading';
    const note = $('#eNote', root).value.trim();
    if (note) {
      const anc = anchorFor(w, ed.id, v, ci);
      S.cards.push({ id: uid(), workId: w.id, kind: 'note', title: '', body: note, createdAt: end, editionId: ed.id, value: v, pct: anc.pct, chapterIdx: ci, anchor: anc.label });
    }
    save();
    const st = streakInfo();
    stampPop(`已盖章<br><span style="font-size:15px">连续 ${st.n} 天</span>`);
    setTimeout(() => {
      if (toPct >= 100 && w.status !== 'done' && confirm(`《${w.title}》已到达终点！现在完成远征，写下心得吗？`)) go('/finish/' + w.id);
      else go('/work/' + w.id);
    }, 900);
  };
}

function viewLog(id) {
  const w = getWork(id);
  if (!w) return go('/');
  const edId = (w.progress && w.progress.editionId) || w.editions[0].id;
  const ed = editionOf(w, edId);
  app.innerHTML = `<a href="#/work/${w.id}" class="muted" style="text-decoration:none">← ${h(w.title)}</a>
    <h1 style="margin-top:6px">记录进度</h1>
    <div class="muted">${workUnitVerb(w)}完一段，记下到了哪里就好。</div>
    <div id="form">${endFormHTML(w, edId)}</div>`;
  const fromValue = w.progress && w.progress.editionId === ed.id ? w.progress.value : pctToValue(ed, workPct(w));
  bindEndForm($('#form'), w, { editionId: edId, fromValue, fromPct: workPct(w) });
}

// ---------- 完成远征（心得） ----------
function viewFinish(id) {
  const w = getWork(id);
  if (!w) return go('/');
  const r = w.review || {};
  const persons = workCards(w, 'person');
  const quotes = workCards(w, 'quote');
  app.innerHTML = `
    <a href="#/work/${w.id}" class="muted" style="text-decoration:none">← ${h(w.title)}</a>
    <h1 style="margin-top:6px">抵达终点</h1>
    <div class="muted">在把这次远征装订成册之前，写下几句话。都可以留空。</div>
    <label>一句话概括这部作品</label><input id="r1" value="${h(r.oneLine || '')}">
    <label>最喜欢的人物</label>
    ${persons.length ? `<select id="rfSel"><option value="">自己填写</option>${persons.map(p => `<option ${r.favorite === p.title ? 'selected' : ''}>${h(p.title)}</option>`).join('')}</select>` : ''}
    <input id="rf" value="${h(r.favorite || '')}" placeholder="名字" style="margin-top:6px">
    <textarea id="rfWhy" placeholder="为什么" style="margin-top:6px;min-height:60px">${h(r.favoriteWhy || '')}</textarea>
    <label>最难忘的一幕</label><textarea id="rScene">${h(r.scene || '')}</textarea>
    <label>它改变了我什么想法</label><textarea id="rChange">${h(r.changed || '')}</textarea>
    <label>最想留下的一句话</label>
    ${quotes.length ? `<select id="rqSel"><option value="">自己填写</option>${quotes.map(q => `<option ${r.bestQuote === q.body ? 'selected' : ''}>${h(q.body.slice(0, 80))}</option>`).join('')}</select>` : ''}
    <textarea id="rq" style="margin-top:6px;min-height:60px">${h(r.bestQuote || '')}</textarea>
    <label>想对未来重读的自己说</label><textarea id="rFuture" style="min-height:60px">${h(r.future || '')}</textarea>
    <label>评分</label>
    <div class="chips" id="rate">${[1, 2, 3, 4, 5].map(n => `<span class="chip ${r.rating === n ? 'on' : ''}" data-v="${n}">${'★'.repeat(n)}</span>`).join('')}</div>
    <label>完成日期</label><input id="rDate" type="date" value="${dayKey(w.finishedAt || Date.now())}">
    <div style="margin-top:20px"><button class="btn-main" id="ok">装订纪念册</button></div>`;
  bindChips($('#rate'));
  if ($('#rfSel')) $('#rfSel').onchange = e => { if (e.target.value) $('#rf').value = e.target.value; };
  if ($('#rqSel')) $('#rqSel').onchange = e => { const q = quotes[e.target.selectedIndex - 1]; if (q) $('#rq').value = q.body; };
  $('#ok').onclick = () => {
    w.review = {
      oneLine: $('#r1').value.trim(), favorite: $('#rf').value.trim(), favoriteWhy: $('#rfWhy').value.trim(),
      scene: $('#rScene').value.trim(), changed: $('#rChange').value.trim(), bestQuote: $('#rq').value.trim(),
      future: $('#rFuture').value.trim(), rating: Number(chipVal($('#rate'))) || null
    };
    const d = $('#rDate').value;
    w.finishedAt = d ? new Date(d + 'T21:00').getTime() : Date.now();
    w.status = 'done';
    save();
    stampPop('远征完成');
    setTimeout(() => go('/memorial/' + w.id), 900);
  };
}

// ---------- 纪念册 ----------
function memorialData(w) {
  const ss = workSessions(w);
  const start = ss.length ? ss[0].start : w.createdAt;
  const end = w.finishedAt || (ss.length ? ss[ss.length - 1].end : Date.now());
  const secs = ss.reduce((a, s) => a + (s.duration || 0), 0);
  const guesses = workCards(w, 'guess');
  return {
    ss, start, end, secs,
    days: Math.max(1, Math.round((new Date(end).setHours(0, 0, 0, 0) - new Date(start).setHours(0, 0, 0, 0)) / DAY) + 1),
    readDays: new Set(ss.map(s => dayKey(s.end))).size,
    persons: workCards(w, 'person'), places: workCards(w, 'place'), terms: workCards(w, 'term'),
    events: workCards(w, 'event').sort((a, b) => (a.pct || 0) - (b.pct || 0)),
    knowledge: workCards(w, 'knowledge').sort((a, b) => (a.pct || 0) - (b.pct || 0)),
    quotes: [...workCards(w, 'quote'), ...workCards(w, 'photo')].sort((a, b) => (a.pct || 0) - (b.pct || 0)),
    notes: workCards(w, 'note').sort((a, b) => a.createdAt - b.createdAt),
    guesses, right: guesses.filter(g => g.result === 'right').length, wrong: guesses.filter(g => g.result === 'wrong').length,
    giveUps: ss.filter(s => s.giveUp)
  };
}

function viewMemorial(id) {
  const w = getWork(id);
  if (!w) return go('/');
  const d = memorialData(w);
  const r = w.review || {};
  const done = w.status === 'done';
  const hasWorld = Object.keys((w.world || {}).cells || {}).length > 0;
  const R = 12;
  app.innerHTML = `
    <div class="row between no-print"><a href="#/work/${w.id}" class="muted" style="text-decoration:none">← 返回</a>
      <span class="row"><button class="btn-sm" id="md">导出 Markdown</button><button class="btn-sm" id="pr">存为 PDF</button></span></div>
    <div class="memorial">
      <div class="cover">
        <div class="muted">远征手账 · 纪念册</div>
        <h1>${h(w.title)}</h1>
        <div class="muted">${h(w.author || '')}${w.series ? ' · ' + h(w.series) : ''}</div>
        <div style="margin:18px 0">${done ? '<span class="seal-big">远征完成</span>' : `<span class="seal-big" style="opacity:.5">进行中 ${Math.round(workPct(w))}%</span>`}</div>
        <div>${fmtFullDate(d.start)} — ${done ? fmtFullDate(d.end) : '至今'}</div>
        <div class="muted">历时 ${d.days} 天 · ${workUnitVerb(w)} ${d.readDays} 天 · ${d.ss.length} 次 · ${fmtDur(d.secs)}</div>
        ${r.rating ? `<div style="color:var(--seal);font-size:20px;margin-top:6px">${'★'.repeat(r.rating)}</div>` : ''}
        ${r.oneLine ? `<div class="quote" style="border:0;margin-top:12px;font-size:17px">“${h(r.oneLine)}”</div>` : ''}
      </div>

      <section><h2>远征路线</h2>${routeSVG(w)}</section>

      ${hasWorld ? `<section><h2>世界地图</h2><div class="map-wrap scroll">${worldSVG(w, { fog: false, R })}</div>
        <div class="muted small">${placedPinsCount(w)} 个地点 · 虚线为足迹</div></section>` : ''}

      ${d.events.length ? `<section><h2>时间线</h2>${d.events.map(c => `<div style="margin:8px 0"><b style="font-family:var(--serif)">${c.when ? h(c.when) + ' · ' : ''}${h(c.title)}</b>
        ${c.body ? `<div class="small">${h(c.body)}</div>` : ''}<div class="anchor">${h(c.anchor || '')}</div></div>`).join('')}</section>` : ''}

      ${d.persons.length ? `<section><h2>人物图鉴 · ${d.persons.length}</h2><div class="people">${d.persons.map(p => `<div class="card" style="margin:0">
        <b style="font-family:var(--serif)">${h(p.title)}</b>${r.favorite === p.title ? ' <span class="stamp" style="font-size:10px;height:20px">最爱</span>' : ''}
        ${p.faction ? `<div class="muted small">${h(p.faction)}</div>` : ''}<div class="small">${h(p.body || '')}</div>${addendaList(p)}
        <div class="anchor">首次登场 ${h(p.anchor || '')}</div></div>`).join('')}</div></section>` : ''}

      ${d.places.length + d.terms.length ? `<section><h2>地点与名词</h2>${[...d.places, ...d.terms].map(c => `<div style="margin:6px 0"><span class="kind">${CARD_KINDS[c.kind]}</span><b>${h(c.title)}</b>
        ${c.body ? `<span class="small"> — ${h(c.body)}</span>` : ''}</div>`).join('')}</section>` : ''}

      ${moodSVG(w) ? `<section><h2>情绪曲线</h2>${moodSVG(w)}
        ${d.giveUps.length ? `<div class="small">你曾 ${d.giveUps.length} 次差点放弃，但最后还是${done ? '走到了终点' : '继续走了下去'}。${d.giveUps.filter(s => s.giveUpWhy).map(s => `<div class="muted">· ${fmtDate(s.end)}：${h(s.giveUpWhy)}</div>`).join('')}</div>` : ''}</section>` : ''}

      ${d.guesses.length ? `<section><h2>预言回顾</h2><div class="muted small">猜对 ${d.right} · 猜错 ${d.wrong} · 共 ${d.guesses.length}</div>
        ${d.guesses.map(g => `<div style="margin:6px 0">${g.result ? `<span class="stamp" style="font-size:10px;height:22px">${{ right: '对', wrong: '错', partial: '半' }[g.result]}</span>` : '<span class="stamp off" style="font-size:10px;height:22px">?</span>'}
          ${h(g.title)} <span class="anchor">${h(g.anchor || '')}</span></div>`).join('')}</section>` : ''}

      ${(w.info || []).length ? `<section><h2>作品资料</h2>${w.info.map(x => `<h3 style="margin-top:12px">${h(x.title)}</h3><div style="white-space:pre-wrap">${h(x.body)}</div>${x.photo ? `<img class="photo" src="${x.photo}" alt="">` : ''}${linksHTML(x.links)}`).join('')}</section>` : ''}

      ${d.knowledge.length ? `<section><h2>知识清单 · ${d.knowledge.length}</h2>${d.knowledge.map(k => `<div style="margin:10px 0"><b>${h(k.title)}</b>${k.body ? `<div class="small">${h(k.body)}</div>` : ''}${k.url ? linkHTML(k.url) : ''}${addendaList(k)}<div class="anchor">${h(k.anchor || '')}</div></div>`).join('')}</section>` : ''}

      ${d.quotes.length ? `<section><h2>摘抄</h2>${d.quotes.map(q => q.kind === 'photo'
        ? `<div style="margin:10px 0">${q.photo ? `<img class="photo" src="${q.photo}" alt="书页">` : ''}<div class="small">${h(q.body || '')}</div><div class="anchor">${h(q.anchor || '')}</div></div>`
        : `<div class="quote">${h(q.body)}<div class="anchor">${h(q.anchor || '')}</div>${q.note ? `<div class="small">${h(q.note)}</div>` : ''}</div>`).join('')}</section>` : ''}

      ${r.favorite || r.scene || r.changed || r.bestQuote || r.future ? `<section><h2>我的心得</h2>
        ${r.favorite ? `<h3>最喜欢的人物：${h(r.favorite)}</h3><p>${h(r.favoriteWhy || '')}</p>` : ''}
        ${r.scene ? `<h3>最难忘的一幕</h3><p>${h(r.scene)}</p>` : ''}
        ${r.changed ? `<h3>它改变了我</h3><p>${h(r.changed)}</p>` : ''}
        ${r.bestQuote ? `<h3>想留下的一句话</h3><div class="quote">${h(r.bestQuote)}</div>` : ''}
        ${r.future ? `<h3>给未来重读的自己</h3><p>${h(r.future)}</p>` : ''}</section>` : ''}

      ${d.notes.length ? `<section><h2>心路历程</h2>${d.notes.map(n => `<div style="margin:8px 0"><span class="muted small">${fmtDate(n.createdAt)} · ${h(n.anchor || '')}</span><div style="white-space:pre-wrap">${h(n.body)}</div></div>`).join('')}</section>` : ''}

      <div class="center no-print" style="margin:24px 0">${done ? `<button class="btn-sm" data-go="/finish/${w.id}">修改心得</button>` : `<span class="muted small">完成远征后，这里会加上你的心得。</span>`}</div>
    </div>`;

  $('#pr').onclick = () => window.print();
  $('#md').onclick = () => download(`${w.title}-远征纪念册.md`, memorialMarkdown(w), 'text/markdown');
}
const placedPinsCount = w => placedPins(w).length;

function memorialMarkdown(w) {
  const d = memorialData(w);
  const r = w.review || {};
  const L = [];
  L.push(`# ${w.title}`, '', `> 远征手账 · 纪念册`, '');
  if (w.author) L.push(`- 作者：${w.author}`);
  if (w.series) L.push(`- 系列：${w.series}${w.seriesNo ? ' 第' + w.seriesNo + '部' : ''}`);
  L.push(`- 时间：${fmtFullDate(d.start)} — ${w.status === 'done' ? fmtFullDate(d.end) : '至今'}（历时 ${d.days} 天）`);
  L.push(`- ${workUnitVerb(w)}：${d.readDays} 天，${d.ss.length} 次，${fmtDur(d.secs)}`);
  if (r.rating) L.push(`- 评分：${'★'.repeat(r.rating)}`);
  if (r.oneLine) L.push('', `**一句话：** ${r.oneLine}`);
  if (d.events.length) { L.push('', '## 时间线', ''); d.events.forEach(c => L.push(`- ${c.when ? `**${c.when}** ` : ''}${c.title}${c.body ? '：' + c.body : ''}（${c.anchor || ''}）`)); }
  if (d.persons.length) { L.push('', '## 人物', ''); d.persons.forEach(p => { L.push(`- **${p.title}**${p.faction ? `（${p.faction}）` : ''}：${p.body || ''} — 首次登场 ${p.anchor || ''}`); (p.addenda || []).forEach(a => L.push(`  - ${a.anchor || ''}：${a.body}`)); }); }
  if (d.knowledge.length) { L.push('', '## 知识清单', ''); d.knowledge.forEach(k => { L.push(`- **${k.title}**：${k.body || ''}${k.url ? ` (${k.url})` : ''}`); (k.addenda || []).forEach(a => L.push(`  - ${a.body}`)); }); }
  (w.info || []).forEach(x => { L.push('', `## 资料：${x.title}`, '', x.body || ''); (x.links || []).forEach(l => L.push(`- [${l.title || l.url}](${l.url})`)); });
  if (d.places.length) { L.push('', '## 地点', ''); d.places.forEach(p => L.push(`- **${p.title}**：${p.body || ''}`)); }
  if (d.terms.length) { L.push('', '## 名词', ''); d.terms.forEach(p => L.push(`- **${p.title}**：${p.body || ''}`)); }
  if (d.guesses.length) {
    L.push('', `## 预言回顾（猜对 ${d.right} / 共 ${d.guesses.length}）`, '');
    d.guesses.forEach(g => L.push(`- [${{ right: '对', wrong: '错', partial: '半' }[g.result] || '?'}] ${g.title}${g.body ? '：' + g.body : ''}`));
  }
  const qs = d.quotes.filter(q => q.kind === 'quote');
  if (qs.length) { L.push('', '## 摘抄', ''); qs.forEach(q => L.push(`> ${q.body.replace(/\n/g, '\n> ')}`, `> — ${q.anchor || ''}${q.note ? '  \n> 批注：' + q.note : ''}`, '')); }
  const rv = [['最喜欢的人物：' + (r.favorite || ''), r.favoriteWhy], ['最难忘的一幕', r.scene], ['它改变了我', r.changed], ['想留下的一句话', r.bestQuote], ['给未来重读的自己', r.future]].filter(x => x[1] || (x[0].startsWith('最喜欢') && r.favorite));
  if (rv.length) { L.push('', '## 我的心得', ''); rv.forEach(([t, v]) => L.push(`### ${t}`, '', v || '', '')); }
  if (d.giveUps.length) { L.push('', '## 差点放弃的时刻', ''); d.giveUps.forEach(s => L.push(`- ${fmtDate(s.end)}（${Math.round(s.toPct)}%）${s.giveUpWhy || ''}`)); }
  if (d.notes.length) { L.push('', '## 心路历程', ''); d.notes.forEach(n => L.push(`- ${fmtDate(n.createdAt)} · ${n.anchor || ''}：${n.body}`)); }
  return L.join('\n') + '\n';
}

// ---------- 统计 ----------
const statsUI = { metric: 'pages' };
function viewStats(yearStr) {
  const year = Number(yearStr) || new Date().getFullYear();
  const st = yearStats(year);
  const streak = streakInfo();
  const vals = st.months.map(m => statsUI.metric === 'pages' ? m.pages : m.minutes / 60);
  const max = Math.max(1, ...vals);
  const bars = vals.map((v, i) => {
    const hgt = v / max * 90;
    return `<rect x="${10 + i * 27}" y="${100 - hgt}" width="18" height="${hgt}" fill="${i === new Date().getMonth() && year === new Date().getFullYear() ? 'var(--btn)' : 'var(--line)'}" rx="2"><title>${Math.round(v)}</title></rect>
      <text x="${19 + i * 27}" y="114" font-size="9" text-anchor="middle" fill="var(--sub)">${i + 1}</text>`;
  }).join('');
  const years = [...new Set([new Date().getFullYear(), ...S.sessions.map(s => new Date(s.end).getFullYear())])].sort();
  app.innerHTML = `
    <div class="row between"><h1>远征统计</h1>
      <select id="yr" style="width:auto">${years.map(y => `<option ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
    <div class="grid2" style="margin-top:12px">
      <div class="metric"><span class="muted">读完</span><b>${st.books} 本</b></div>
      <div class="metric"><span class="muted">看完</span><b>${st.screens} 部</b></div>
      <div class="metric"><span class="muted">纸质页数</span><b>${st.pages.toLocaleString()}</b></div>
      <div class="metric"><span class="muted">总时长</span><b>${Math.round(st.secs / 3600)} h</b></div>
      <div class="metric"><span class="muted">远征天数</span><b>${st.days}</b></div>
      <div class="metric"><span class="muted">当前连续</span><b>${streak.n} 天</b></div>
    </div>
    <h2>每月</h2>
    <div class="chips" id="metric">
      <span class="chip ${statsUI.metric === 'pages' ? 'on' : ''}" data-v="pages">页数</span>
      <span class="chip ${statsUI.metric === 'hours' ? 'on' : ''}" data-v="hours">小时</span></div>
    <div class="card"><svg viewBox="0 0 340 120" width="100%">${bars}</svg></div>
    <h2>收录</h2>
    <div class="card">人物 ${st.persons} · 地点 ${st.places} · 名词 ${st.terms} · 知识 ${st.knowledge} · 事件 ${st.events} · 摘抄 ${st.quotes} · 猜测 ${st.guesses}</div>
    ${st.peakHour >= 0 ? `<div class="muted">最常在 ${st.peakHour}:00 – ${st.peakHour + 1}:00 开始${st.sessions ? '阅读' : ''}，${year} 年共 ${st.sessions} 次${st.episodes ? `，看了 ${st.episodes} 集` : ''}</div>` : ''}
    <h2>${year} 年完成的远征</h2>
    ${st.doneWorks.length ? st.doneWorks.sort((a, b) => a.finishedAt - b.finishedAt).map(doneCardHTML).join('') : `<div class="empty">今年的第一枚完成印章还在等你</div>`}
    <div class="muted small" style="margin-top:10px">页数只统计有纸质版页数的书：电子书的百分比会按纸质页数折算。</div>`;

  $('#yr').onchange = e => go('/stats/' + e.target.value);
  bindChips($('#metric'), v => { statsUI.metric = v || 'pages'; viewStats(String(year)); });
}

// ---------- 备份与设置 ----------
function viewSettings() {
  const size = new Blob([JSON.stringify(S)]).size;
  const theme = localStorageGet('theme') || 'auto';
  app.innerHTML = `
    <h1>备份与设置</h1>
    <div class="muted">所有数据只存在这台手机的浏览器里。清除浏览器数据或换手机前，请先导出备份。</div>
    <div class="card">
      <div>作品 ${S.works.length} · 记录 ${S.sessions.length} · 卡片 ${S.cards.length}</div>
      <div class="muted small">数据大小约 ${(size / 1024).toFixed(0)} KB · 上次备份：${S.settings.lastBackup ? fmtFullDate(S.settings.lastBackup) : '从未'}</div>
      <div class="row" style="margin-top:10px"><button class="grow btn-seal" id="exp">导出备份</button><button class="grow" id="imp">导入备份</button></div>
      <input type="file" id="file" accept=".json,application/json" class="hidden">
    </div>
    <h2>外观</h2>
    <div class="chips" id="theme">
      ${[['auto', '跟随系统'], ['light', '白天纸张'], ['dark', '夜读牛皮纸']].map(([k, n]) => `<span class="chip ${theme === k ? 'on' : ''}" data-v="${k}">${n}</span>`).join('')}</div>
    <h2>添加到桌面</h2>
    <div class="card small">
      iPhone：用 Safari 打开，点分享按钮 →“添加到主屏幕”。<br>
      安卓：用 Chrome 打开，点菜单 →“添加到主屏幕”或“安装应用”。<br>
      添加后可以离线使用，像普通 App 一样打开。
    </div>
    <h2>打卡规则</h2>
    <div class="card small">当天有一次阅读或观看记录就算打卡。每周（周一起）有 ${REST_PER_WEEK} 天休息日，休息不会中断连续天数。</div>
    <div class="muted small center" style="margin:20px 0">远征手账 V1</div>`;
  $('#exp').onclick = () => {
    S.settings.lastBackup = Date.now();
    save();
    download(`远征手账备份-${dayKey(Date.now())}.json`, JSON.stringify(S), 'application/json');
    setTimeout(viewSettings, 300);
  };
  $('#imp').onclick = () => $('#file').click();
  $('#file').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.works) || !Array.isArray(data.sessions) || !Array.isArray(data.cards)) throw new Error('格式不对');
      if (!confirm(`备份里有 ${data.works.length} 部作品、${data.cards.length} 张卡片。导入会替换手机上现有的全部数据，确定吗？`)) return;
      S = Object.assign(blankState(), data);
      await store.set('state', S);
      toast('导入完成');
      go('/');
    } catch (err) {
      toast('导入失败：' + err.message);
    }
  };
  bindChips($('#theme'), v => { localStorageSet('theme', v || 'auto'); applyTheme(); });
}

function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* 隐私模式 */ } }
function applyTheme() {
  const t = localStorageGet('theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

// ---------- 启动 ----------
(async function boot() {
  applyTheme();
  try {
    await loadState();
  } catch (e) {
    app.innerHTML = `<div class="banner">无法打开本地存储：${h(e.message)}。如果在无痕模式下，请换成普通模式。</div>`;
    return;
  }
  window.addEventListener('hashchange', render);
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
