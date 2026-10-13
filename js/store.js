'use strict';
// 数据层：IndexedDB 持久化 + 领域计算（进度、打卡、预计完成、统计）

const DAY = 86400000;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pad2 = n => String(n).padStart(2, '0');
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const weekKey = t => { const d = new Date(t); d.setHours(12, 0, 0, 0); return dayKey(d - ((d.getDay() + 6) % 7) * DAY); };
const fmtDate = t => { const d = new Date(t); return `${d.getMonth() + 1}月${d.getDate()}日`; };
const fmtFullDate = t => { const d = new Date(t); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; };
const fmtDur = sec => {
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} 分钟` : `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
};

const REST_PER_WEEK = 2;
const MOODS = ['震撼', '上头', '感动', '心痛', '好笑', '平静', '困惑', '无聊'];
const MOOD_VALUE = { 震撼: 3, 上头: 3, 感动: 2, 心痛: 2, 好笑: 1, 平静: 0, 困惑: -1, 无聊: -2 };
const CARD_KINDS = {
  person: '人物', place: '地点', term: '名词', knowledge: '知识', event: '事件',
  quote: '摘抄', photo: '书页', guess: '猜测', note: '随笔'
};

const store = {
  db: null,
  async open() {
    this.db = await new Promise((res, rej) => {
      const r = indexedDB.open('expedition-journal', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  },
  get(k) {
    return new Promise((res, rej) => {
      const r = this.db.transaction('kv').objectStore('kv').get(k);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  set(k, v) {
    return new Promise((res, rej) => {
      const t = this.db.transaction('kv', 'readwrite');
      t.objectStore('kv').put(v, k);
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  }
};

const blankState = () => ({
  version: 1,
  works: [],
  sessions: [],
  cards: [],
  active: null,
  settings: { lastBackup: 0, createdAt: Date.now() }
});

let S = blankState();
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    store.set('state', S).catch(e => typeof toast === 'function' && toast('保存失败：' + e.message));
  }, 150);
}
async function loadState() {
  await store.open();
  const s = await store.get('state');
  if (s) S = Object.assign(blankState(), s);
}

// ---------- 作品与进度 ----------
const getWork = id => S.works.find(w => w.id === id);
const editionOf = (w, id) => w.editions.find(e => e.id === id) || w.editions[0];
const isScreen = w => w.type === 'screen';
const workCards = (w, kind) => S.cards.filter(c => c.workId === w.id && (!kind || c.kind === kind));
const workSessions = w => S.sessions.filter(s => s.workId === w.id).sort((a, b) => a.end - b.end);

const EDITION_LABEL = { paper: '纸质书', ebook: '电子书', screen: '影视' };

function valueToPct(ed, v) {
  v = Number(v) || 0;
  if (ed.kind === 'ebook') return clamp(v, 0, 100);
  return clamp(v / (ed.total || 1) * 100, 0, 100);
}
function pctToValue(ed, p) {
  if (ed.kind === 'ebook') return Math.round(p * 10) / 10;
  return Math.round(p / 100 * (ed.total || 0));
}
function valueLabel(ed, v) {
  if (ed.kind === 'ebook') return `${v}%`;
  if (ed.kind === 'screen') return `第 ${v} 集`;
  return `p.${v}`;
}
function totalLabel(ed) {
  if (ed.kind === 'ebook') return '100%';
  if (ed.kind === 'screen') return `${ed.total} 集`;
  return `${ed.total} 页`;
}
const workPct = w => (w.progress && w.progress.pct) || 0;

// 章节锚点：影视作品以集为章
function chapterList(w) {
  if (isScreen(w)) {
    const n = (w.editions[0] && w.editions[0].total) || 0;
    return Array.from({ length: n }, (_, i) => `第 ${i + 1} 集`);
  }
  return w.chapters || [];
}
function progressLabel(w) {
  const p = w.progress || {};
  const ed = editionOf(w, p.editionId);
  if (!ed) return '';
  const parts = [valueLabel(ed, p.value || 0)];
  const ch = chapterList(w);
  if (!isScreen(w) && p.chapterIdx != null && ch[p.chapterIdx]) parts.push(ch[p.chapterIdx]);
  if (ed.kind === 'paper') parts.push(`${Math.round(workPct(w))}%`);
  return parts.join(' · ');
}
function anchorFor(w, edId, value, chapterIdx) {
  const ed = editionOf(w, edId);
  const pct = valueToPct(ed, value);
  const ch = chapterList(w);
  let label = valueLabel(ed, value);
  if (!isScreen(w) && chapterIdx != null && ch[chapterIdx]) label += ' · ' + ch[chapterIdx];
  return { pct, chapterIdx, label };
}

function lastReadAt(w) {
  const ss = workSessions(w);
  return ss.length ? ss[ss.length - 1].end : null;
}

// 预计完成：最近 21 天的速度
function eta(w) {
  const pct = workPct(w);
  if (pct >= 100) return null;
  const since = Date.now() - 21 * DAY;
  const ss = workSessions(w).filter(s => s.end > since);
  if (!ss.length) return null;
  const gained = ss.reduce((a, s) => a + Math.max(0, s.toPct - s.fromPct), 0);
  const days = Math.max(3, (Date.now() - ss[0].start) / DAY);
  const pace = gained / days;
  if (pace <= 0.05) return null;
  return Date.now() + (100 - pct) / pace * DAY;
}

// ---------- 打卡 ----------
function readDaySet() {
  return new Set(S.sessions.map(s => dayKey(s.end)));
}
// 连续天数：每周（周一起）最多 2 个休息日，不会中断连续
function streakInfo() {
  const days = readDaySet();
  const restDays = new Set();
  const used = {};
  let n = 0;
  let d = new Date(); d.setHours(12, 0, 0, 0);
  const today = dayKey(d);
  if (!days.has(today)) d = new Date(d - DAY);
  if (!days.size) return { n: 0, restDays, restLeft: REST_PER_WEEK, readToday: false };
  const first = Math.min(...S.sessions.map(s => s.end));
  for (let i = 0; i < 5000 && d.getTime() >= first - DAY; i++) {
    const k = dayKey(d);
    if (days.has(k)) n++;
    else {
      const wk = weekKey(d);
      used[wk] = (used[wk] || 0) + 1;
      if (used[wk] > REST_PER_WEEK) break;
      restDays.add(k);
    }
    d = new Date(d - DAY);
  }
  // 只保留夹在阅读日之间的休息日（最早阅读日之前的不算）
  const firstKey = dayKey(first);
  for (const k of [...restDays]) if (k < firstKey) restDays.delete(k);
  const thisWeek = weekKey(Date.now());
  const restLeft = Math.max(0, REST_PER_WEEK - [...restDays].filter(k => weekKey(new Date(k + 'T12:00')) === thisWeek).length);
  return { n, restDays, restLeft, readToday: days.has(today) };
}

// ---------- 统计 ----------
function sessionPages(s) {
  const w = getWork(s.workId);
  if (!w || isScreen(w)) return 0;
  const paper = w.editions.find(e => e.kind === 'paper' && e.total);
  if (!paper) return 0;
  return Math.max(0, (s.toPct - s.fromPct) / 100 * paper.total);
}

function yearStats(year) {
  const inYear = t => new Date(t).getFullYear() === year;
  const ss = S.sessions.filter(s => inYear(s.end));
  const done = S.works.filter(w => w.status === 'done' && w.finishedAt && inYear(w.finishedAt));
  const months = Array.from({ length: 12 }, () => ({ pages: 0, minutes: 0 }));
  const hours = new Array(24).fill(0);
  let pages = 0, secs = 0, episodes = 0;
  for (const s of ss) {
    const m = new Date(s.end).getMonth();
    const p = sessionPages(s);
    pages += p; secs += s.duration || 0;
    months[m].pages += p; months[m].minutes += (s.duration || 0) / 60;
    hours[new Date(s.start).getHours()] += s.duration || 1;
    const w = getWork(s.workId);
    if (w && isScreen(w)) episodes += Math.max(0, (s.toValue || 0) - (s.fromValue || 0));
  }
  const yearCards = S.cards.filter(c => inYear(c.createdAt));
  const count = k => yearCards.filter(c => c.kind === k).length;
  let peak = -1, peakV = 0;
  hours.forEach((v, h) => { if (v > peakV) { peakV = v; peak = h; } });
  const days = new Set(ss.map(s => dayKey(s.end))).size;
  return {
    books: done.filter(w => !isScreen(w)).length,
    screens: done.filter(isScreen).length,
    doneWorks: done,
    pages: Math.round(pages), secs, episodes, days,
    sessions: ss.length, months, peakHour: peak,
    persons: count('person'), places: count('place'), terms: count('term'),
    quotes: count('quote') + count('photo'), knowledge: count('knowledge'), events: count('event'), guesses: count('guess')
  };
}
