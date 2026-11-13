/* 말로 가계부 — 메인 앱 */
(function () {
  'use strict';
  const P = window.VoiceParser;
  const { ymd, pad, addDays, daysInMonth } = P;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const won = (n) => (Math.round(n || 0)).toLocaleString('ko-KR') + '원';
  const shortWon = (n) => {
    n = Math.round(n || 0);
    if (n >= 100000000) return (n / 100000000).toFixed(n % 100000000 ? 1 : 0) + '억';
    if (n >= 10000) { const v = n / 10000; return (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10) + '만'; }
    if (n >= 1000) return (Math.round(n / 100) / 10) + '천';
    return String(n);
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const parseD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const KINDS = {
    card: { name: '카드 결제일', icon: '💳' },
    loan: { name: '대출 이자', icon: '🏦' },
    rent: { name: '월세', icon: '🏠' },
    bill: { name: '공과금·관리비', icon: '🧾' },
    insurance: { name: '보험', icon: '🛡️' },
    sub: { name: '구독', icon: '🔁' },
    etc: { name: '기타 고정지출', icon: '📌' },
  };
  const catIcon = (name) => (P.CATEGORIES.find((c) => c.name === name) || { icon: '📝' }).icon;

  // ---------- 저장소 ----------
  const KEY = 'malro-gagyebu-v1';
  const blank = () => ({
    entries: [], schedules: [], cards: P.DEFAULT_CARDS.map((c) => ({ ...c, payDay: null })),
    settings: { defaultCardId: null, theme: 'auto', notify: false, planRemind: [1, 0] },
    notified: {},
  });
  let S;
  try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || 'null') || {}); } catch (e) { S = blank(); }
  S.settings = Object.assign(blank().settings, S.settings);
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('저장 공간이 부족해요'); }
    syncReminderCache();
  }
  const cardById = (id) => S.cards.find((c) => c.id === id);
  const cardName = (id) => (cardById(id) || { name: '미지정' }).name;

  // ---------- 상태 ----------
  const today = () => ymd(new Date());
  const ui = { tab: 'diary', month: today().slice(0, 7), sel: today(), period: 'month', anchor: today() };

  // ---------- 고정지출 발생일 계산 ----------
  function occDate(s, y, m) { // m: 0-based
    const d = Math.min(s.day || 1, daysInMonth(y, m));
    return `${y}-${pad(m + 1)}-${pad(d)}`;
  }
  function paidEntry(s, date) { return S.entries.find((e) => e.scheduleId === s.id && e.schedDate === date); }
  function estimateCard(s, date) {
    // 카드 결제일 금액을 비워두면: 전월 해당 카드 사용액으로 추정
    if (!s.cardId) return 0;
    const d = parseD(date);
    const pm = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const key = `${pm.getFullYear()}-${pad(pm.getMonth() + 1)}`;
    return S.entries.filter((e) => e.type === 'expense' && e.cardId === s.cardId && e.date.startsWith(key)).reduce((a, e) => a + e.amount, 0);
  }
  function occurrences(from, to) { // 'YYYY-MM-DD' inclusive
    const out = [];
    const a = parseD(from), b = parseD(to);
    for (const s of S.schedules) {
      if (s.active === false) continue;
      let y = a.getFullYear(), m = a.getMonth();
      while (y < b.getFullYear() || (y === b.getFullYear() && m <= b.getMonth())) {
        const date = occDate(s, y, m);
        if (date >= from && date <= to && (!s.start || date >= s.start)) {
          const paid = paidEntry(s, date);
          const est = !s.amount && s.kind === 'card';
          out.push({ key: `${s.id}|${date}`, s, date, amount: paid ? paid.amount : (s.amount || (est ? estimateCard(s, date) : 0)), estimated: est && !paid, paid });
        }
        m++; if (m > 11) { m = 0; y++; }
      }
    }
    return out.sort((x, y) => x.date.localeCompare(y.date));
  }
  function plannedEntries(from, to) {
    return S.entries.filter((e) => e.type === 'planned' && e.date >= from && e.date <= to);
  }

  // ---------- 탭 ----------
  $$('.tabbar button').forEach((b) => b.addEventListener('click', () => { ui.tab = b.dataset.tab; render(); window.scrollTo(0, 0); }));
  function render() {
    $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.tab));
    applyTheme();
    ({ diary: renderDiary, report: renderReport, schedule: renderSchedule, settings: renderSettings })[ui.tab]();
  }

  // ---------- 다이어리 ----------
  function upcomingAlerts() {
    const t = today();
    const end = ymd(addDays(new Date(), 10));
    const items = [];
    for (const o of occurrences(ymd(addDays(new Date(), -3)), end)) {
      if (o.paid) continue;
      items.push({ date: o.date, name: o.s.name, amount: o.amount, icon: KINDS[o.s.kind]?.icon || '📌', est: o.estimated });
    }
    for (const e of plannedEntries(ymd(addDays(new Date(), -3)), end)) items.push({ date: e.date, name: e.title, amount: e.amount, icon: catIcon(e.category) });
    return items.sort((a, b) => a.date.localeCompare(b.date)).map((x) => ({ ...x, dd: Math.round((parseD(x.date) - parseD(t)) / 864e5) }));
  }
  const ddLabel = (dd) => dd === 0 ? '오늘' : dd > 0 ? `D-${dd}` : `${-dd}일 지남`;

  function renderDiary() {
    setTitle('다이어리', '말로 쓰는 하루 가계부');
    const [Y, M] = ui.month.split('-').map(Number);
    const first = new Date(Y, M - 1, 1);
    const startIdx = first.getDay();
    const gridStart = addDays(first, -startIdx);
    const monthFrom = `${ui.month}-01`, monthTo = `${ui.month}-${pad(daysInMonth(Y, M - 1))}`;
    const byDay = {};
    for (const e of S.entries) {
      const d = byDay[e.date] || (byDay[e.date] = { exp: 0, inc: 0, plan: 0, sch: 0 });
      if (e.type === 'expense') d.exp += e.amount; else if (e.type === 'income') d.inc += e.amount; else if (e.type === 'planned') d.plan++;
    }
    for (const o of occurrences(ymd(gridStart), ymd(addDays(gridStart, 41)))) if (!o.paid) (byDay[o.date] || (byDay[o.date] = { exp: 0, inc: 0, plan: 0, sch: 0 })).sch++;
    let mExp = 0, mInc = 0;
    for (const e of S.entries) if (e.date >= monthFrom && e.date <= monthTo) { if (e.type === 'expense') mExp += e.amount; if (e.type === 'income') mInc += e.amount; }
    const mPlan = plannedEntries(monthFrom, monthTo).reduce((a, e) => a + e.amount, 0) + occurrences(monthFrom, monthTo).filter((o) => !o.paid).reduce((a, o) => a + o.amount, 0);

    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = addDays(gridStart, i); const ds = ymd(d); const info = byDay[ds];
      if (i === 35 && d.getMonth() !== M - 1) break;
      const cls = ['cal-day', d.getMonth() !== M - 1 && 'other', d.getDay() === 0 && 'sun', d.getDay() === 6 && 'sat', ds === today() && 'today', ds === ui.sel && 'sel'].filter(Boolean).join(' ');
      cells += `<button class="${cls}" data-day="${ds}"><span class="dn">${d.getDate()}</span>`
        + (info && info.exp ? `<span class="amt num">-${shortWon(info.exp)}</span>` : '')
        + (info && info.inc ? `<span class="inc num">+${shortWon(info.inc)}</span>` : '')
        + `<span class="dots">${info && info.plan ? '<i class="dot"></i>' : ''}${info && info.sch ? '<i class="dot sch"></i>' : ''}</span></button>`;
    }
    const alerts = upcomingAlerts();
    const alertHTML = alerts.length ? `<div class="section-title">곧 나갈 돈 <span style="font-weight:500;font-size:12px">10일 이내</span></div>
      <div class="alert-strip">${alerts.map((a) => `<div class="alert-pill ${a.dd <= 1 ? 'due' : ''}"><span class="d">${ddLabel(a.dd)} · ${+a.date.slice(5, 7)}/${+a.date.slice(8)}</span><span class="n">${a.icon} ${esc(a.name)}</span><span class="a num">${a.est ? '약 ' : ''}${won(a.amount)}</span></div>`).join('')}</div>` : '';

    $('#view').innerHTML = `
      ${alertHTML}
      <div class="paper cal section">
        <div class="cal-head"><strong>${Y}년 ${M}월</strong>
          <div class="nav"><button class="icon-btn" data-mnav="-1" aria-label="이전 달">‹</button><button class="chip" data-mnav="0">오늘</button><button class="icon-btn" data-mnav="1" aria-label="다음 달">›</button></div></div>
        <div class="cal-grid">${DOW.map((d, i) => `<div class="cal-dow ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${d}</div>`).join('')}${cells}</div>
        <div class="cal-sum"><div>지출<b class="num" style="color:var(--accent)">${won(mExp)}</b></div><div>수입<b class="num" style="color:var(--income)">${won(mInc)}</b></div><div>남은 예정<b class="num" style="color:var(--plan)">${won(mPlan)}</b></div></div>
      </div>
      <div class="paper diary section">${diaryPage(ui.sel)}</div>`;
    $$('[data-mnav]').forEach((b) => b.onclick = () => {
      const v = +b.dataset.mnav;
      if (v === 0) { ui.month = today().slice(0, 7); ui.sel = today(); }
      else { const d = new Date(Y, M - 1 + v, 1); ui.month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
      renderDiary();
    });
    $$('[data-day]').forEach((b) => b.onclick = () => { ui.sel = b.dataset.day; if (!ui.sel.startsWith(ui.month)) ui.month = ui.sel.slice(0, 7); renderDiary(); });
    bindEntryClicks();
  }

  function diaryPage(ds) {
    const d = parseD(ds);
    const list = S.entries.filter((e) => e.date === ds).sort((a, b) => a.time.localeCompare(b.time));
    const occ = occurrences(ds, ds).filter((o) => !o.paid);
    const exp = list.filter((e) => e.type === 'expense').reduce((a, e) => a + e.amount, 0);
    const rows = [
      ...occ.map((o) => ({ time: o.s.time || '09:00', html: `<button class="entry sched" data-occ="${esc(o.key)}"><span class="t">${esc(o.s.time || '')}</span><span class="ic">${KINDS[o.s.kind]?.icon || '📌'}</span><span class="body"><div class="ti">${esc(o.s.name)}</div><div class="meta"><span class="tag warn">고정지출 예정</span>${o.s.cardId ? cardTag(o.s.cardId) : ''}</div></span><span class="am num">${o.estimated ? '약 ' : ''}${won(o.amount)}</span></button>` })),
      ...list.map((e) => ({ time: e.time, html: entryRow(e) })),
    ].sort((a, b) => a.time.localeCompare(b.time));
    return `<div class="diary-head"><div class="diary-date">${d.getMonth() + 1}월 ${d.getDate()}일<small>${DOW[d.getDay()]}요일${ds === today() ? ' · 오늘' : ''}</small></div>
      <div class="diary-total">이날 지출<b class="num">${won(exp)}</b></div></div>
      ${rows.length ? rows.map((r) => r.html).join('') : `<div class="empty">아직 기록이 없어요.<br>아래 <b>🎤 버튼</b>을 누르고 말해 보세요.</div>`}`;
  }
  function cardTag(id) { const c = cardById(id); return c ? `<span class="tag"><i class="sw" style="background:${esc(c.color)}"></i>${esc(c.name)}</span>` : ''; }
  function entryRow(e) {
    const typeTag = e.type === 'planned' ? '<span class="tag plan">예정</span>' : e.type === 'income' ? '<span class="tag inc">수입</span>' : e.type === 'paid' ? '<span class="tag inc">납부완료</span>' : '';
    const sign = e.type === 'income' ? '+' : e.type === 'expense' ? '-' : '';
    return `<button class="entry ${e.type}" data-entry="${e.id}"><span class="t">${esc(e.time)}</span><span class="ic">${catIcon(e.category)}</span>
      <span class="body"><div class="ti">${esc(e.title || e.category)}</div><div class="meta">${typeTag}<span class="tag">${esc(e.category)}</span>${e.cardId ? cardTag(e.cardId) : ''}</div></span>
      <span class="am num">${sign}${won(e.amount)}</span></button>`;
  }
  function bindEntryClicks() {
    $$('[data-entry]').forEach((b) => b.onclick = () => openEntryEditor(S.entries.find((e) => e.id === b.dataset.entry)));
    $$('[data-occ]').forEach((b) => b.onclick = () => openOccurrence(b.dataset.occ));
  }

  // ---------- 결산 ----------
  const PERIODS = [['day', '일간'], ['week', '주간'], ['month', '월간'], ['quarter', '분기'], ['half', '6개월'], ['year', '1년']];
  function periodRange(kind, anchorStr, shift = 0) {
    const a = parseD(anchorStr);
    let from, to, label;
    if (kind === 'day') { from = addDays(a, shift); to = from; label = `${from.getFullYear()}.${from.getMonth() + 1}.${from.getDate()} (${DOW[from.getDay()]})`; }
    else if (kind === 'week') {
      const mon = addDays(a, -((a.getDay() + 6) % 7) + shift * 7); from = mon; to = addDays(mon, 6);
      label = `${from.getMonth() + 1}.${from.getDate()} ~ ${to.getMonth() + 1}.${to.getDate()}`;
    } else if (kind === 'month') { from = new Date(a.getFullYear(), a.getMonth() + shift, 1); to = new Date(from.getFullYear(), from.getMonth() + 1, 0); label = `${from.getFullYear()}년 ${from.getMonth() + 1}월`; }
    else if (kind === 'quarter') { const q = Math.floor(a.getMonth() / 3) + shift; from = new Date(a.getFullYear(), q * 3, 1); to = new Date(from.getFullYear(), from.getMonth() + 3, 0); label = `${from.getFullYear()}년 ${Math.floor(from.getMonth() / 3) + 1}분기`; }
    else if (kind === 'half') { const h = Math.floor(a.getMonth() / 6) + shift; from = new Date(a.getFullYear(), h * 6, 1); to = new Date(from.getFullYear(), from.getMonth() + 6, 0); label = `${from.getFullYear()}년 ${from.getMonth() < 6 ? '상반기 (1~6월)' : '하반기 (7~12월)'}`; }
    else { from = new Date(a.getFullYear() + shift, 0, 1); to = new Date(from.getFullYear(), 11, 31); label = `${from.getFullYear()}년`; }
    return { from: ymd(from), to: ymd(to), label, days: Math.round((to - from) / 864e5) + 1 };
  }
  function sumRange(r) {
    const es = S.entries.filter((e) => e.date >= r.from && e.date <= r.to);
    const exp = es.filter((e) => e.type === 'expense');
    return {
      es, exp,
      total: exp.reduce((a, e) => a + e.amount, 0),
      income: es.filter((e) => e.type === 'income').reduce((a, e) => a + e.amount, 0),
      planned: es.filter((e) => e.type === 'planned').reduce((a, e) => a + e.amount, 0) + occurrences(r.from, r.to).filter((o) => !o.paid).reduce((a, o) => a + o.amount, 0),
    };
  }
  function groupBars(list, keyFn, labelFn, colorFn) {
    const g = {};
    for (const e of list) { const k = keyFn(e) || '_'; g[k] = (g[k] || 0) + e.amount; }
    const tot = Object.values(g).reduce((a, b) => a + b, 0) || 1;
    const rows = Object.entries(g).sort((a, b) => b[1] - a[1]);
    const max = rows.length ? rows[0][1] : 1;
    return rows.map(([k, v]) => `<div class="bar-row"><span class="nm">${labelFn(k)}</span><span class="bar-track"><span class="bar-fill" style="display:block;width:${Math.max(2, v / max * 100)}%;background:${colorFn ? colorFn(k) : 'var(--accent)'}"></span></span><span class="vv num">${shortWon(v)}<span class="pc">${Math.round(v / tot * 100)}%</span></span></div>`).join('');
  }
  function renderReport() {
    setTitle('결산', '기간별 지출 정리');
    const r = periodRange(ui.period, ui.anchor);
    const prev = periodRange(ui.period, ui.anchor, -1);
    const cur = sumRange(r), pv = sumRange(prev);
    const diff = pv.total ? Math.round((cur.total - pv.total) / pv.total * 100) : null;
    const elapsed = Math.max(1, Math.min(r.days, Math.round((parseD(today()) - parseD(r.from)) / 864e5) + 1));
    const avgDays = today() > r.to ? r.days : today() < r.from ? r.days : elapsed;

    // 추이
    let buckets = [];
    if (ui.period === 'week' || ui.period === 'month') {
      for (let d = parseD(r.from); ymd(d) <= r.to; d = addDays(d, 1)) { const k = ymd(d); buckets.push({ k, lb: ui.period === 'week' ? DOW[d.getDay()] : (d.getDate() % 5 === 1 ? String(d.getDate()) : ''), v: 0 }); }
      for (const e of cur.exp) { const b = buckets.find((x) => x.k === e.date); if (b) b.v += e.amount; }
    } else if (ui.period !== 'day') {
      for (let d = parseD(r.from); ymd(d) <= r.to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) buckets.push({ k: ymd(d).slice(0, 7), lb: `${d.getMonth() + 1}월`, v: 0 });
      for (const e of cur.exp) { const b = buckets.find((x) => x.k === e.date.slice(0, 7)); if (b) b.v += e.amount; }
    }
    const bmax = Math.max(1, ...buckets.map((b) => b.v));
    const trend = buckets.length ? `<div class="section-title">추이</div><div class="paper trend"><div class="trend-max num">최대 ${won(bmax === 1 ? 0 : bmax)}</div><div class="trend-chart">${buckets.map((b) => `<div class="trend-col" title="${b.k} ${won(b.v)}"><div class="b ${b.v ? '' : 'zero'}" style="height:${b.v ? Math.max(3, b.v / bmax * 100) : 2}%"></div><div class="lb">${b.lb}</div></div>`).join('')}</div></div>` : '';

    const top = cur.exp.slice().sort((a, b) => b.amount - a.amount).slice(0, ui.period === 'day' ? 50 : 5);
    $('#view').innerHTML = `
      <div class="seg">${PERIODS.map(([k, n]) => `<button class="chip ${ui.period === k ? 'on' : ''}" data-period="${k}">${n}</button>`).join('')}</div>
      <div class="period-nav"><button class="icon-btn" data-pnav="-1" aria-label="이전">‹</button><strong>${r.label}</strong><button class="icon-btn" data-pnav="1" aria-label="다음">›</button></div>
      <div class="kpis section">
        <div class="paper kpi big"><div class="l">총 지출</div><div class="v">${won(cur.total)}</div>
          <div class="s">${diff === null ? '이전 기간 기록 없음' : `이전 기간보다 <b class="${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)}%</b> (${won(pv.total)})`}</div></div>
        <div class="paper kpi"><div class="l">수입</div><div class="v" style="color:var(--income)">${won(cur.income)}</div><div class="s">남은 돈 ${won(cur.income - cur.total)}</div></div>
        <div class="paper kpi"><div class="l">하루 평균</div><div class="v">${won(cur.total / avgDays)}</div><div class="s">${cur.exp.length}건 지출</div></div>
        <div class="paper kpi big" style="grid-column:1/-1"><div class="l">이 기간 남은 예정 지출 (고정지출 포함)</div><div class="v" style="color:var(--plan);font-size:20px">${won(cur.planned)}</div><div class="s">예정까지 합치면 ${won(cur.total + cur.planned)}</div></div>
      </div>
      ${trend}
      <div class="section-title">사용내역별</div>
      <div class="paper bars">${cur.exp.length ? groupBars(cur.exp, (e) => e.category, (k) => `${catIcon(k)} ${esc(k)}`) : '<div class="empty">지출 기록이 없어요</div>'}</div>
      <div class="section-title">카드·결제수단별</div>
      <div class="paper bars">${cur.exp.length ? groupBars(cur.exp, (e) => e.cardId, (k) => k === '_' ? '미지정' : esc(cardName(k)), (k) => (cardById(k) || {}).color || 'var(--ink-3)') : '<div class="empty">지출 기록이 없어요</div>'}</div>
      ${top.length ? `<div class="section-title">${ui.period === 'day' ? '이날 지출' : '큰 지출 TOP 5'}</div><div class="paper diary" style="padding-top:6px">${top.map(entryRow).join('')}</div>` : ''}
    `;
    $$('[data-period]').forEach((b) => b.onclick = () => { ui.period = b.dataset.period; renderReport(); });
    $$('[data-pnav]').forEach((b) => b.onclick = () => { ui.anchor = periodRange(ui.period, ui.anchor, +b.dataset.pnav).from; renderReport(); });
    bindEntryClicks();
  }

  // ---------- 일정·알림 ----------
  function renderSchedule() {
    setTitle('일정·알림', '카드결제일 · 대출이자 · 월세 · 지출할 것');
    const from = ymd(addDays(new Date(), -7)), to = ymd(addDays(new Date(), 45));
    const items = [
      ...occurrences(from, to).map((o) => ({ date: o.date, kind: 'occ', o })),
      ...plannedEntries(from, to).map((e) => ({ date: e.date, kind: 'plan', e })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    const t = parseD(today());
    const rows = items.map((it) => {
      const dd = Math.round((parseD(it.date) - t) / 864e5);
      const d = parseD(it.date);
      const paid = it.kind === 'occ' && it.o.paid;
      if (paid && dd < -3) return '';
      const cls = paid ? 'done' : dd < 0 ? 'over' : dd <= 1 ? 'due' : '';
      const ddText = paid ? '완료' : dd === 0 ? '오늘' : dd > 0 ? `D-${dd}` : `+${-dd}`;
      const name = it.kind === 'occ' ? `${KINDS[it.o.s.kind]?.icon || '📌'} ${esc(it.o.s.name)}` : `${catIcon(it.e.category)} ${esc(it.e.title)}`;
      const card = it.kind === 'occ' ? it.o.s.cardId : it.e.cardId;
      const amount = it.kind === 'occ' ? it.o.amount : it.e.amount;
      const est = it.kind === 'occ' && it.o.estimated;
      const attr = it.kind === 'occ' ? `data-occ="${esc(it.o.key)}"` : `data-entry="${it.e.id}"`;
      return `<div class="sched-item"><div class="dday ${cls}">${ddText}<small>${d.getMonth() + 1}/${d.getDate()} ${DOW[d.getDay()]}</small></div>
        <div><div class="nm">${name}</div><div class="mt">${it.kind === 'occ' ? (KINDS[it.o.s.kind]?.name || '') : '지출할 것'}${card ? ' · ' + esc(cardName(card)) : ''}</div></div>
        <div class="rt"><b class="num">${est ? '약 ' : ''}${won(amount)}</b>${paid ? '' : `<button class="btn small" ${attr}>${dd <= 0 ? '처리' : '보기'}</button>`}</div></div>`;
    }).join('');
    const monthly = S.schedules.reduce((a, s) => a + (s.active === false ? 0 : (s.amount || 0)), 0);
    $('#view').innerHTML = `
      ${notifyBanner()}
      <div class="section-title">다가오는 지출 <span style="font-weight:500;font-size:12px">45일</span></div>
      <div class="paper list">${rows || '<div class="empty">예정된 지출이 없어요.<br>“25일 카드값 120만원 나갈 예정”처럼 말해 보세요.</div>'}</div>
      <div class="section-title">매달 고정지출 <span class="num" style="font-size:13px">월 ${won(monthly)}</span></div>
      <div class="paper list">${S.schedules.length ? S.schedules.slice().sort((a, b) => a.day - b.day).map((s) => `<button class="fixed-item" data-sched="${s.id}">
          <span><b>${KINDS[s.kind]?.icon || '📌'} ${esc(s.name)}</b><br><span class="mt" style="font-size:12px;color:var(--ink-2)">매달 ${s.day >= 31 ? '말일' : s.day + '일'} · ${s.cardId ? esc(cardName(s.cardId)) + ' · ' : ''}${s.remind.map((n) => n === 0 ? '당일' : n + '일 전').join(', ')} 알림${s.active === false ? ' · <b>꺼짐</b>' : ''}</span></span>
          <b class="num">${s.amount ? won(s.amount) : (s.kind === 'card' ? '자동 추정' : '-')}</b></button>`).join('') : '<div class="empty">“매달 25일 월세 50만원”처럼 말하거나<br>아래 버튼으로 추가하세요.</div>'}</div>
      <div class="sheet-actions"><button class="btn" id="addSched">＋ 고정지출 추가</button><button class="btn" id="addPlan">＋ 지출할 것 추가</button></div>
      <p class="note">💳 카드 결제일 금액을 비워 두면 지난달 그 카드로 쓴 금액으로 자동 추정해요.</p>`;
    bindEntryClicks();
    $$('[data-sched]').forEach((b) => b.onclick = () => openScheduleEditor(S.schedules.find((s) => s.id === b.dataset.sched)));
    $('#addSched').onclick = () => openScheduleEditor(null);
    $('#addPlan').onclick = () => openEntryEditor({ id: null, type: 'planned', amount: 0, date: ymd(addDays(new Date(), 1)), time: '09:00', cardId: S.settings.defaultCardId, category: '기타', title: '' });
    const nb = $('#notifyBtn'); if (nb) nb.onclick = enableNotifications;
  }
  function notifyBanner() {
    if (!('Notification' in window)) return `<div class="paper set-row"><div>🔔 이 브라우저는 알림을 지원하지 않아요.<div class="d">설정 → 캘린더로 내보내기를 쓰면 휴대폰 캘린더가 알려줘요.</div></div></div>`;
    if (Notification.permission === 'granted' && S.settings.notify) return '';
    return `<div class="paper set-row"><div>🔔 알림을 켜면 결제일 전에 알려드려요<div class="d">홈 화면에 추가한 뒤 켜는 걸 추천해요</div></div><button class="btn small primary" id="notifyBtn">알림 켜기</button></div>`;
  }

  // ---------- 설정 ----------
  function renderSettings() {
    setTitle('설정', '카드 · 알림 · 백업');
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    $('#view').innerHTML = `
      <div class="section-title">카드·결제수단 <span style="font-weight:500;font-size:12px">말할 때 쓰는 이름 포함</span></div>
      <div class="paper list">${S.cards.map((c) => `<button class="fixed-item" data-card="${c.id}"><span><i class="card-swatch" style="background:${esc(c.color)}"></i><b>${esc(c.name)}</b>${S.settings.defaultCardId === c.id ? ' <span class="tag plan">기본</span>' : ''}<br><span style="font-size:12px;color:var(--ink-2)">부르는 말: ${esc((c.aliases || []).join(', ') || '-')}${c.payDay ? ` · 결제일 ${c.payDay}일` : ''}</span></span><span>›</span></button>`).join('')}</div>
      <div class="sheet-actions"><button class="btn" id="addCard">＋ 카드 추가</button></div>
      <div class="section-title">알림</div>
      <div class="paper">
        <div class="set-row"><div>휴대폰 알림<div class="d">${perm === 'granted' ? (S.settings.notify ? '켜짐' : '허용됨 · 꺼짐') : perm === 'denied' ? '차단됨 – 브라우저 설정에서 허용해 주세요' : perm === 'unsupported' ? '지원 안 함' : '꺼짐'}</div></div>
          ${perm === 'granted' && S.settings.notify ? '<button class="btn small" id="testNoti">테스트</button>' : '<button class="btn small primary" id="notifyBtn">켜기</button>'}</div>
        <div class="set-row"><div>휴대폰 캘린더로 내보내기 (.ics)<div class="d">고정지출·지출할 것을 캘린더 일정+알람으로 저장. 앱을 안 열어도 확실하게 울려요.</div></div><button class="btn small" id="icsBtn">내보내기</button></div>
      </div>
      <div class="section-title">화면</div>
      <div class="paper"><div class="set-row"><div>테마</div><select id="themeSel" style="width:auto"><option value="auto">자동</option><option value="light">밝게</option><option value="dark">어둡게</option></select></div></div>
      <div class="section-title">데이터</div>
      <div class="paper">
        <div class="set-row"><div>백업 파일 저장<div class="d">모든 기록을 파일로 저장 (휴대폰 바꿀 때)</div></div><button class="btn small" id="backupBtn">저장</button></div>
        <div class="set-row"><div>백업 불러오기</div><label class="btn small">불러오기<input type="file" id="restoreFile" accept=".json,application/json" hidden></label></div>
        <div class="set-row"><div>엑셀용 CSV 내보내기</div><button class="btn small" id="csvBtn">CSV</button></div>
        <div class="set-row"><div>예시 데이터 넣어보기</div><button class="btn small" id="demoBtn">넣기</button></div>
        <div class="set-row"><div style="color:#c0392b">모든 기록 지우기</div><button class="btn small danger" id="resetBtn">지우기</button></div>
      </div>
      <p class="note">기록은 이 휴대폰 안에만 저장돼요(서버로 보내지 않아요). 가끔 백업 파일을 저장해 두세요.</p>`;
    $('#themeSel').value = S.settings.theme;
    $('#themeSel').onchange = (e) => { S.settings.theme = e.target.value; save(); applyTheme(); };
    $$('[data-card]').forEach((b) => b.onclick = () => openCardEditor(cardById(b.dataset.card)));
    $('#addCard').onclick = () => openCardEditor(null);
    const nb = $('#notifyBtn'); if (nb) nb.onclick = enableNotifications;
    const tb = $('#testNoti'); if (tb) tb.onclick = () => notify('🔔 알림 테스트', '결제일이 다가오면 이렇게 알려드려요.', 'test');
    $('#icsBtn').onclick = exportICS;
    $('#backupBtn').onclick = () => download(`가계부_백업_${today()}.json`, JSON.stringify(S, null, 1), 'application/json');
    $('#restoreFile').onchange = restore;
    $('#csvBtn').onclick = exportCSV;
    $('#demoBtn').onclick = loadDemo;
    $('#resetBtn').onclick = () => { if (confirm('정말 모든 기록을 지울까요? 되돌릴 수 없어요.')) { const cards = S.cards; S = blank(); S.cards = cards; save(); toast('지웠어요'); render(); } };
  }
  function applyTheme() {
    const t = S.settings.theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  }
  function setTitle(t, s) { $('#pageTitle').textContent = t; $('#pageSub').textContent = s; }

  // ---------- 폼 ----------
  const cardOptions = (sel) => `<option value="">미지정</option>` + S.cards.map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const catOptions = (sel) => P.CATEGORIES.map((c) => `<option ${c.name === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  const kindOptions = (sel) => Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v.icon} ${v.name}</option>`).join('');
  const REMIND_CHOICES = [7, 3, 2, 1, 0];

  function itemForm(it, withSchedule) {
    const types = [['expense', '지출'], ['planned', '지출할 것'], ['income', '수입']];
    if (withSchedule) types.push(['schedule', '매달 고정']);
    const isS = it.type === 'schedule';
    return `<div class="type-seg">${types.map(([v, n]) => `<button type="button" data-v="${v}" class="${it.type === v ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="form-grid" style="margin-top:8px">
        <label class="full">금액<input type="number" inputmode="numeric" name="amount" value="${it.amount || ''}" placeholder="0"></label>
        <label class="full">내용<input type="text" name="title" value="${esc(it.title)}"></label>
        ${isS ? `<label>매달 며칠<select name="day">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${(it.recurring?.day || 1) === i + 1 ? 'selected' : ''}>${i === 30 ? '31일(말일)' : i + 1 + '일'}</option>`).join('')}</select></label>
                <label>종류<select name="kind">${kindOptions(it.recurring?.kind || 'etc')}</select></label>`
              : `<label>날짜<input type="date" name="date" value="${it.date}"></label><label>시간<input type="time" name="time" value="${it.time}"></label>`}
        <label>결제수단<select name="cardId">${cardOptions(it.cardId)}</select></label>
        <label>분류<select name="category">${catOptions(it.category)}</select></label>
      </div>`;
  }
  function bindTypeSeg(root, it, rerender) {
    $$('.type-seg button', root).forEach((b) => b.onclick = () => { readForm(root, it); it.type = b.dataset.v; if (it.type === 'schedule' && !it.recurring) it.recurring = { day: parseD(it.date).getDate(), kind: 'etc' }; if (it.type === 'income') it.category = '수입'; rerender(); });
  }
  function readForm(root, it) {
    const g = (n) => { const el = root.querySelector(`[name="${n}"]`); return el ? el.value : undefined; };
    if (g('amount') !== undefined) it.amount = Math.max(0, Math.round(+g('amount') || 0));
    if (g('title') !== undefined) it.title = g('title').trim();
    if (g('date')) it.date = g('date');
    if (g('time')) it.time = g('time');
    if (g('cardId') !== undefined) it.cardId = g('cardId') || null;
    if (g('category')) it.category = g('category');
    if (g('day')) it.recurring = { day: +g('day'), kind: g('kind') || 'etc' };
    return it;
  }

  // ---------- 음성 입력 ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let parsedItems = [];
  $('#micFab').onclick = openVoice;
  function openVoice() {
    showSheet('#voiceSheet');
    parsedItems = []; renderParsed();
    $('#textInput').value = '';
    startListening();
  }
  // 최대 20초 동안 듣기: 브라우저가 중간에 끊어도 자동으로 다시 이어서 들어요
  const LISTEN_MS = 20000;
  let session = null;
  function startListening() {
    $('#listenBox').hidden = false;
    const tr = $('#transcript'), pulse = $('#pulse'), cd = $('#countdown'), stopBtn = $('#stopVoice');
    if (!SR) {
      pulse.className = 'pulse off'; stopBtn.hidden = true; cd.textContent = '';
      tr.textContent = '이 브라우저는 음성 인식을 지원하지 않아요. 키보드의 🎤 마이크로 아래 칸에 말해 주세요.';
      setTimeout(() => $('#textInput').focus(), 200);
      return;
    }
    stopListening(false);
    const ss = session = { text: '', interim: '', stopped: false, until: Date.now() + LISTEN_MS, fatal: false };
    tr.textContent = '듣고 있어요… 천천히 말씀하세요';
    pulse.className = 'pulse on'; stopBtn.hidden = false;
    const tick = () => {
      if (ss.stopped) return;
      const left = Math.max(0, Math.ceil((ss.until - Date.now()) / 1000));
      cd.textContent = `${left}초 남음`;
      if (left <= 0) stopListening(true);
    };
    ss.timer = setInterval(tick, 250); tick();
    const run = () => {
      if (ss.stopped) return;
      const r = ss.rec = new SR();
      r.lang = 'ko-KR'; r.interimResults = true; r.continuous = true; r.maxAlternatives = 1;
      let part = '';
      r.onresult = (ev) => {
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          if (ev.results[i].isFinal) part += ev.results[i][0].transcript + ' '; else interim += ev.results[i][0].transcript;
        }
        ss.interim = interim; ss.part = part;
        tr.textContent = (ss.text + part + interim).trim() || '…';
      };
      r.onerror = (ev) => {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed' || ev.error === 'audio-capture') {
          ss.fatal = true;
          tr.textContent = '마이크 권한을 허용해 주세요. (또는 아래 칸에 입력)';
        }
      };
      r.onend = () => {
        // 끊기기 직전의 미확정 문장도 버리지 않음
        ss.text += part + (ss.interim ? ss.interim + ' ' : ''); ss.interim = ''; ss.part = '';
        if (ss.done) return;
        if (ss.fatal) { finishListening(ss, false); return; }
        if (ss.stopped) { finishListening(ss, true); return; }
        if (Date.now() < ss.until) setTimeout(run, 150); // 시간이 남았으면 다시 듣기
        else finishListening(ss, true);
      };
      try { r.start(); } catch (e) { tr.textContent = '음성 인식을 시작할 수 없어요'; finishListening(ss, false); }
    };
    run();
  }
  // 듣기 끝내기 (useResult=true면 들은 말을 해석)
  function stopListening(useResult) {
    const ss = session; if (!ss || ss.stopped) return;
    ss.stopped = true;
    if (useResult) {
      // stop()은 마지막 말까지 확정한 뒤 onend 호출 → finishListening
      try { ss.rec.stop(); } catch (e) { finishListening(ss, true); }
      setTimeout(() => finishListening(ss, true), 1500); // onend가 안 오면 대비
    } else {
      ss.done = true; clearInterval(ss.timer);
      try { ss.rec && ss.rec.abort(); } catch (e) { /* */ }
      resetListenUI();
    }
  }
  function resetListenUI() { $('#pulse').className = 'pulse off'; $('#stopVoice').hidden = true; $('#countdown').textContent = ''; }
  function finishListening(ss, useResult) {
    if (ss.done) return; ss.done = true; ss.stopped = true;
    clearInterval(ss.timer);
    resetListenUI();
    if (!useResult) return;
    const text = (ss.text + (ss.part || '') + (ss.interim || '')).replace(/\s+/g, ' ').trim();
    if (text) { $('#textInput').value = text; interpret(text); }
    else $('#transcript').textContent = '말소리가 안 들렸어요. 다시 말하기를 눌러 주세요.';
  }
  $('#stopVoice').onclick = () => stopListening(true);
  $('#textForm').onsubmit = (e) => { e.preventDefault(); stopListening(false); const v = $('#textInput').value; if (v.trim()) interpret(v); $('#textInput').blur(); };
  $('#retryVoice').onclick = () => { parsedItems = []; renderParsed(); startListening(); };
  function interpret(text) {
    parsedItems = P.parse(text, { now: new Date(), cards: S.cards, defaultCardId: S.settings.defaultCardId });
    $('#transcript').textContent = '“' + text.trim() + '”';
    $('#pulse').className = 'pulse off';
    renderParsed();
  }
  function renderParsed() {
    const box = $('#parsedList');
    if (!parsedItems.length) { box.innerHTML = ''; $('#parsedActions').hidden = !SR ? true : true; return; }
    box.innerHTML = parsedItems.map((it, i) => `<div class="parsed" data-pi="${i}"><div class="raw">“${esc(it.raw)}” ${it.amount ? '' : '<b style="color:var(--accent)">· 금액을 못 들었어요</b>'}</div>${itemForm(it, true)}</div>`).join('');
    $$('.parsed', box).forEach((el) => { const it = parsedItems[+el.dataset.pi]; bindTypeSeg(el, it, renderParsed); });
    $('#parsedActions').hidden = false;
  }
  $('#saveParsed').onclick = () => {
    $$('.parsed').forEach((el) => readForm(el, parsedItems[+el.dataset.pi]));
    const valid = parsedItems.filter((it) => it.amount > 0 || it.type === 'schedule');
    if (!valid.length) { toast('금액을 입력해 주세요'); return; }
    for (const it of valid) {
      if (it.type === 'schedule') {
        S.schedules.push({ id: uid(), name: it.title || KINDS[it.recurring.kind].name, kind: it.recurring.kind, amount: it.amount, day: it.recurring.day, cardId: it.cardId, category: it.category, remind: [3, 1, 0], time: '09:00', active: true });
      } else {
        S.entries.push({ id: uid(), type: it.type, amount: it.amount, date: it.date, time: it.time, cardId: it.cardId, category: it.category, title: it.title, memo: it.raw, createdAt: Date.now() });
      }
    }
    save();
    const f = valid[0];
    if (f.type !== 'schedule') { ui.sel = f.date; ui.month = f.date.slice(0, 7); }
    closeSheets();
    toast(valid.length > 1 ? `${valid.length}건 저장했어요` : f.type === 'schedule' ? '매달 고정지출로 등록했어요' : f.type === 'planned' ? '지출할 것으로 저장했어요 (알림 예정)' : '저장했어요');
    render();
  };

  // ---------- 편집 ----------
  function openEntryEditor(e) {
    if (!e) return;
    const it = { ...e };
    const card = $('#editCard');
    const draw = () => {
      card.innerHTML = `<div class="sheet-head"><strong>${e.id ? '기록 수정' : '지출할 것 추가'}</strong><button class="x" data-close>✕</button></div>
        <div id="ef">${itemForm(it, false)}</div>
        ${e.memo ? `<p class="note">🎤 “${esc(e.memo)}”</p>` : ''}
        <div class="sheet-actions">${e.id ? '<button class="btn danger" id="delE">삭제</button>' : ''}${it.type === 'planned' && e.id ? '<button class="btn" id="doneE">지출 완료</button>' : ''}<button class="btn primary" id="saveE">저장</button></div>`;
      bindTypeSeg($('#ef'), it, draw);
      bindClose();
      $('#saveE').onclick = () => {
        readForm($('#ef'), it);
        if (!it.amount) { toast('금액을 입력해 주세요'); return; }
        if (e.id) Object.assign(S.entries.find((x) => x.id === e.id), it);
        else S.entries.push({ ...it, id: uid(), createdAt: Date.now() });
        save(); closeSheets(); toast('저장했어요'); render();
      };
      const del = $('#delE'); if (del) del.onclick = () => { if (confirm('이 기록을 지울까요?')) { S.entries = S.entries.filter((x) => x.id !== e.id); save(); closeSheets(); render(); } };
      const done = $('#doneE'); if (done) done.onclick = () => {
        readForm($('#ef'), it);
        const n = new Date();
        Object.assign(S.entries.find((x) => x.id === e.id), it, { type: 'expense', date: ymd(n), time: P.hm(n) });
        save(); closeSheets(); toast('지출로 기록했어요'); render();
      };
    };
    draw(); showSheet('#editSheet');
  }

  function openOccurrence(key) {
    const [sid, date] = key.split('|');
    const s = S.schedules.find((x) => x.id === sid); if (!s) return;
    const o = occurrences(date, date).find((x) => x.s.id === sid);
    const card = $('#editCard');
    const d = parseD(date);
    card.innerHTML = `<div class="sheet-head"><strong>${KINDS[s.kind]?.icon || ''} ${esc(s.name)}</strong><button class="x" data-close>✕</button></div>
      <p style="margin:4px 0 12px;color:var(--ink-2)">${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]}) · ${KINDS[s.kind]?.name}${s.cardId ? ' · ' + esc(cardName(s.cardId)) : ''}</p>
      <div class="form-grid"><label class="full">이번 달 실제 금액${o && o.estimated ? ' (지난달 카드 사용액으로 추정)' : ''}<input type="number" inputmode="numeric" id="occAmt" value="${o ? o.amount : s.amount}"></label></div>
      <div class="sheet-actions"><button class="btn" id="editS">고정지출 설정</button><button class="btn primary" id="payS">납부 완료로 기록</button></div>`;
    bindClose();
    $('#editS').onclick = () => openScheduleEditor(s);
    $('#payS').onclick = () => {
      const amt = Math.round(+$('#occAmt').value || 0);
      if (!amt) { toast('금액을 입력해 주세요'); return; }
      // 카드 결제일: 카드값은 이미 사용 시점에 지출로 잡혀 있으므로, 별도 '이체' 기록은 결산에서 중복되지 않게 표시만
      S.entries.push({ id: uid(), type: s.kind === 'card' ? 'paid' : 'expense', amount: amt, date, time: s.time || '09:00', cardId: s.kind === 'card' ? 'transfer' : s.cardId, category: s.category || '금융·대출', title: s.name, scheduleId: s.id, schedDate: date, createdAt: Date.now() });
      save(); closeSheets(); toast('납부 완료!'); render();
    };
    showSheet('#editSheet');
  }

  function openScheduleEditor(s) {
    const it = s ? { ...s, remind: [...s.remind] } : { id: null, name: '', kind: 'card', amount: 0, day: 15, cardId: null, category: '금융·대출', remind: [3, 1, 0], time: '09:00', active: true };
    const card = $('#editCard');
    card.innerHTML = `<div class="sheet-head"><strong>${s ? '고정지출 수정' : '고정지출 추가'}</strong><button class="x" data-close>✕</button></div>
      <div class="form-grid" id="sf">
        <label class="full">이름<input type="text" name="name" value="${esc(it.name)}" placeholder="예) 신한카드 결제, 주택담보대출 이자, 월세"></label>
        <label>종류<select name="kind">${kindOptions(it.kind)}</select></label>
        <label>매달 며칠<select name="day">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${it.day === i + 1 ? 'selected' : ''}>${i === 30 ? '31일(말일)' : i + 1 + '일'}</option>`).join('')}</select></label>
        <label class="full">금액 <span style="font-size:11px">(카드 결제일은 비워두면 자동 추정)</span><input type="number" inputmode="numeric" name="amount" value="${it.amount || ''}" placeholder="0"></label>
        <label>결제 카드/계좌<select name="cardId">${cardOptions(it.cardId)}</select></label>
        <label>분류<select name="category">${catOptions(it.category)}</select></label>
        <label class="full">알림 받을 때<div class="remind-days">${REMIND_CHOICES.map((n) => `<button type="button" class="chip ${it.remind.includes(n) ? 'on' : ''}" data-rd="${n}">${n === 0 ? '당일' : n + '일 전'}</button>`).join('')}</div></label>
        <label>알림 시각<input type="time" name="time" value="${it.time}"></label>
        <label>사용<select name="active"><option value="1" ${it.active !== false ? 'selected' : ''}>켜기</option><option value="0" ${it.active === false ? 'selected' : ''}>끄기</option></select></label>
      </div>
      <div class="sheet-actions">${s ? '<button class="btn danger" id="delS">삭제</button>' : ''}<button class="btn primary" id="saveS">저장</button></div>`;
    bindClose();
    $$('[data-rd]').forEach((b) => b.onclick = () => { const n = +b.dataset.rd; it.remind = it.remind.includes(n) ? it.remind.filter((x) => x !== n) : [...it.remind, n].sort((a, b) => b - a); b.classList.toggle('on'); });
    $('[name=kind]').onchange = (e) => { const k = e.target.value; if (!$('[name=name]').value) $('[name=name]').value = KINDS[k].name; $('[name=category]').value = { card: '금융·대출', loan: '금융·대출', rent: '주거·관리비', bill: '주거·관리비', insurance: '금융·대출', sub: '문화·여가' }[k] || '기타'; };
    $('#saveS').onclick = () => {
      const f = $('#sf'); const g = (n) => f.querySelector(`[name=${n}]`).value;
      Object.assign(it, { name: g('name').trim() || KINDS[g('kind')].name, kind: g('kind'), day: +g('day'), amount: Math.round(+g('amount') || 0), cardId: g('cardId') || null, category: g('category'), time: g('time') || '09:00', active: g('active') === '1' });
      if (!it.amount && it.kind !== 'card') { toast('금액을 입력해 주세요'); return; }
      if (s) Object.assign(S.schedules.find((x) => x.id === s.id), it); else S.schedules.push({ ...it, id: uid() });
      save(); closeSheets(); toast('저장했어요'); render();
    };
    const del = $('#delS'); if (del) del.onclick = () => { if (confirm('이 고정지출을 지울까요?')) { S.schedules = S.schedules.filter((x) => x.id !== s.id); save(); closeSheets(); render(); } };
    showSheet('#editSheet');
  }

  function openCardEditor(c) {
    const it = c ? { ...c } : { id: null, name: '', aliases: [], color: '#8d6e63', payDay: null };
    const card = $('#editCard');
    const linked = c && S.schedules.find((s) => s.kind === 'card' && s.cardId === c.id);
    card.innerHTML = `<div class="sheet-head"><strong>${c ? '카드 수정' : '카드 추가'}</strong><button class="x" data-close>✕</button></div>
      <div class="form-grid" id="cf">
        <label class="full">이름<input type="text" name="name" value="${esc(it.name)}" placeholder="예) 신한 딥드림"></label>
        <label class="full">말할 때 부르는 이름 (쉼표로 구분)<input type="text" name="aliases" value="${esc((it.aliases || []).join(', '))}" placeholder="예) 딥드림, 신한"></label>
        <label>색<input type="color" name="color" value="${esc(it.color)}" style="min-height:44px;padding:4px"></label>
        <label>결제일 (알림)<select name="payDay"><option value="">없음</option>${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${(linked ? linked.day : it.payDay) === i + 1 ? 'selected' : ''}>${i + 1}일</option>`).join('')}</select></label>
        <label class="full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="def" ${S.settings.defaultCardId === it.id && it.id ? 'checked' : ''} style="width:22px;height:22px;min-height:0"> 카드를 말 안 하면 이 카드로 기록</label>
      </div>
      <div class="sheet-actions">${c ? '<button class="btn danger" id="delC">삭제</button>' : ''}<button class="btn primary" id="saveC">저장</button></div>`;
    bindClose();
    $('#saveC').onclick = () => {
      const f = $('#cf'); const g = (n) => f.querySelector(`[name=${n}]`);
      it.name = g('name').value.trim(); if (!it.name) { toast('이름을 입력해 주세요'); return; }
      it.aliases = g('aliases').value.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
      it.color = g('color').value; it.payDay = +g('payDay').value || null;
      if (!c) { it.id = uid(); S.cards.push(it); } else Object.assign(cardById(c.id), it);
      if (g('def').checked) S.settings.defaultCardId = it.id; else if (S.settings.defaultCardId === it.id) S.settings.defaultCardId = null;
      // 결제일 → 고정지출(카드 결제일) 자동 연결
      const ls = S.schedules.find((s) => s.kind === 'card' && s.cardId === it.id);
      if (it.payDay && !ls) S.schedules.push({ id: uid(), name: `${it.name} 결제`, kind: 'card', amount: 0, day: it.payDay, cardId: it.id, category: '금융·대출', remind: [3, 1, 0], time: '09:00', active: true });
      else if (it.payDay && ls) ls.day = it.payDay;
      else if (!it.payDay && ls) S.schedules = S.schedules.filter((s) => s !== ls);
      save(); closeSheets(); toast('저장했어요'); render();
    };
    const del = $('#delC'); if (del) del.onclick = () => { if (confirm('이 카드를 지울까요? (기록은 남아요)')) { S.cards = S.cards.filter((x) => x.id !== c.id); S.schedules = S.schedules.filter((s) => !(s.kind === 'card' && s.cardId === c.id)); save(); closeSheets(); render(); } };
    showSheet('#editSheet');
  }

  // ---------- 시트/토스트 ----------
  function showSheet(sel) { $$('.sheet').forEach((s) => s.hidden = true); $(sel).hidden = false; bindClose(); }
  function closeSheets() { $$('.sheet').forEach((s) => s.hidden = true); stopListening(false); }
  function bindClose() { $$('[data-close]').forEach((b) => b.onclick = closeSheets); }
  $$('.sheet').forEach((s) => s.addEventListener('click', (e) => { if (e.target === s) closeSheets(); }));
  let tt;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 2200); }

  // ---------- 알림 ----------
  async function enableNotifications() {
    if (!('Notification' in window)) { toast('이 브라우저는 알림을 지원하지 않아요'); return; }
    const p = await Notification.requestPermission();
    if (p === 'granted') {
      S.settings.notify = true; save();
      registerPeriodic();
      notify('🔔 알림이 켜졌어요', '카드결제일·대출이자·월세 전에 알려드릴게요.', 'welcome');
      checkReminders();
    } else toast('알림이 허용되지 않았어요');
    render();
  }
  async function notify(title, body, tag) {
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      const opt = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: './' } };
      if (reg) await reg.showNotification(title, opt); else new Notification(title, opt);
    } catch (e) { toast(title + ' — ' + body); }
  }
  // 알림 목록 (앞으로 45일)
  function reminderList() {
    const out = [];
    const from = ymd(addDays(new Date(), -1)), to = ymd(addDays(new Date(), 45));
    for (const o of occurrences(from, to)) {
      if (o.paid) continue;
      for (const n of o.s.remind || []) {
        const [h, mi] = (o.s.time || '09:00').split(':').map(Number);
        const at = addDays(parseD(o.date), -n); at.setHours(h, mi, 0, 0);
        out.push({ key: `${o.key}|${n}`, at: at.getTime(), title: `${KINDS[o.s.kind]?.icon || '📌'} ${o.s.name} ${n === 0 ? '오늘이에요' : n + '일 남았어요'}`, body: `${+o.date.slice(5, 7)}월 ${+o.date.slice(8)}일 · ${o.estimated ? '약 ' : ''}${won(o.amount)}${o.s.cardId ? ' · ' + cardName(o.s.cardId) : ''}` });
      }
    }
    for (const e of plannedEntries(from, to)) {
      for (const n of S.settings.planRemind) {
        const at = addDays(parseD(e.date), -n); at.setHours(9, 0, 0, 0);
        out.push({ key: `p|${e.id}|${n}`, at: at.getTime(), title: `🗓️ 지출할 것: ${e.title} ${n === 0 ? '(오늘)' : '(내일)'}`, body: `${won(e.amount)}${e.cardId ? ' · ' + cardName(e.cardId) : ''}` });
      }
    }
    return out;
  }
  function checkReminders() {
    if (!S.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    const now = Date.now(); let changed = false;
    for (const r of reminderList()) {
      if (r.at <= now && r.at > now - 2 * 864e5 && !S.notified[r.key]) {
        S.notified[r.key] = now; changed = true;
        notify(r.title, r.body, r.key);
      }
    }
    // 오래된 표시 정리
    for (const k in S.notified) if (S.notified[k] < now - 60 * 864e5) { delete S.notified[k]; changed = true; }
    if (changed) save();
  }
  // 서비스워커가 앱이 꺼져 있어도 확인할 수 있게 알림 목록을 캐시에 저장
  async function syncReminderCache() {
    if (!('caches' in window)) return;
    try {
      const c = await caches.open('malro-data');
      await c.put('./__reminders.json', new Response(JSON.stringify({ enabled: !!S.settings.notify, list: reminderList(), notified: S.notified }), { headers: { 'Content-Type': 'application/json' } }));
    } catch (e) { /* ignore */ }
  }
  async function registerPeriodic() {
    try {
      const reg = await navigator.serviceWorker.ready;
      if ('periodicSync' in reg) {
        const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
        if (st.state === 'granted') await reg.periodicSync.register('malro-reminders', { minInterval: 60 * 60 * 1000 });
      }
    } catch (e) { /* 지원 안 함 */ }
  }

  // ---------- 내보내기 ----------
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function exportICS() {
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//malro-gagyebu//KO', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:말로 가계부 지출 일정'];
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const icsEsc = (s) => String(s).replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
    const alarms = (list, time) => list.map((n) => {
      const [h, m] = (time || '09:00').split(':').map(Number);
      const mins = n * 24 * 60 - (h * 60 + m); // 당일 0시 기준 → 알림 시각
      return ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:지출 알림', `TRIGGER:${mins >= 0 ? '-' : ''}PT${Math.abs(mins)}M`, 'END:VALARM'];
    }).flat();
    for (const s of S.schedules.filter((x) => x.active !== false)) {
      const start = occurrences(today(), ymd(addDays(new Date(), 62))).find((o) => o.s.id === s.id);
      const d = (start ? start.date : today()).replace(/-/g, '');
      L.push('BEGIN:VEVENT', `UID:${s.id}@malro-gagyebu`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`,
        s.day >= 29 ? 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1' : `RRULE:FREQ=MONTHLY;BYMONTHDAY=${s.day}`,
        `SUMMARY:${icsEsc(`${KINDS[s.kind]?.icon || ''} ${s.name} ${s.amount ? won(s.amount) : ''}`.trim())}`,
        `DESCRIPTION:${icsEsc(`${KINDS[s.kind]?.name || ''}${s.cardId ? ' · ' + cardName(s.cardId) : ''}`)}`, ...alarms(s.remind || [1], s.time), 'END:VEVENT');
    }
    for (const e of plannedEntries(today(), '9999-12-31')) {
      L.push('BEGIN:VEVENT', `UID:${e.id}@malro-gagyebu`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`,
        `SUMMARY:${icsEsc(`🗓️ ${e.title} ${won(e.amount)}`)}`, ...alarms(S.settings.planRemind, '09:00'), 'END:VEVENT');
    }
    L.push('END:VCALENDAR');
    if (L.length < 7) { toast('내보낼 일정이 없어요'); return; }
    download('가계부_지출일정.ics', L.join('\r\n'), 'text/calendar');
    toast('파일을 열어 캘린더에 추가하세요');
  }
  function exportCSV() {
    const typeName = { expense: '지출', planned: '지출예정', income: '수입', paid: '카드대금납부' };
    const rows = [['날짜', '시간', '구분', '내용', '분류', '결제수단', '금액', '메모']];
    for (const e of S.entries.slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))) rows.push([e.date, e.time, typeName[e.type] || e.type, e.title, e.category, cardName(e.cardId), e.amount, e.memo || '']);
    download(`가계부_${today()}.csv`, '﻿' + rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  }
  function restore(ev) {
    const f = ev.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (!Array.isArray(d.entries)) throw new Error('형식 오류');
        if (!confirm(`기록 ${d.entries.length}건을 불러올까요? 지금 기록은 바뀌어요.`)) return;
        S = Object.assign(blank(), d); save(); toast('불러왔어요'); render();
      } catch (e) { toast('백업 파일을 읽을 수 없어요'); }
    };
    rd.readAsText(f);
  }
  function loadDemo() {
    const n = new Date();
    const say = [
      '오늘 점심 신한카드로 김치찌개 9천원', '스타벅스 커피 4500원 신한카드', '어제 저녁 치킨 2만 3천원 국민카드',
      '어제 이마트 장보기 8만 7천원 삼성카드', '그저께 택시 만 2천원 현금', '지난주 금요일 병원비 2만 3천원 국민카드',
      '3일 전 쿠팡 생필품 3만 2천원 삼성카드', '5일 전 주유 6만원 현대카드', '10일 전 영화 2만 8천원 신한카드',
      '월급 350만원 들어왔어', '모레 친구 결혼 축의금 10만원 낼 예정',
    ];
    for (const t of say) for (const it of P.parse(t, { now: n, cards: S.cards })) S.entries.push({ id: uid(), type: it.type, amount: it.amount, date: it.date, time: it.time, cardId: it.cardId, category: it.category, title: it.title, memo: t, createdAt: Date.now() });
    // 지난달 데이터
    for (let i = 1; i <= 20; i++) { const d = addDays(n, -30 - i); S.entries.push({ id: uid(), type: 'expense', amount: [8000, 12000, 4500, 35000, 15000][i % 5], date: ymd(d), time: '12:30', cardId: ['shinhan', 'kb', 'samsung'][i % 3], category: ['식비', '교통', '카페·간식', '장보기', '생활용품'][i % 5], title: ['점심', '택시', '커피', '마트', '다이소'][i % 5], createdAt: Date.now() }); }
    if (!S.schedules.length) S.schedules.push(
      { id: uid(), name: '월세', kind: 'rent', amount: 500000, day: 25, cardId: 'transfer', category: '주거·관리비', remind: [3, 1, 0], time: '09:00', active: true },
      { id: uid(), name: '주택담보대출 이자', kind: 'loan', amount: 320000, day: 10, cardId: 'transfer', category: '금융·대출', remind: [3, 1, 0], time: '09:00', active: true },
      { id: uid(), name: '신한카드 결제', kind: 'card', amount: 0, day: 15, cardId: 'shinhan', category: '금융·대출', remind: [3, 1, 0], time: '09:00', active: true },
    );
    save(); toast('예시 데이터를 넣었어요'); ui.tab = 'diary'; render();
  }

  // ---------- 설치(PWA) ----------
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; $('#installBtn').hidden = false; });
  $('#installBtn').onclick = async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $('#installBtn').hidden = true; };
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (isIOS && !standalone) { $('#installBtn').hidden = false; $('#installBtn').onclick = () => alert('아이폰: Safari 아래쪽 공유 버튼(□↑) → “홈 화면에 추가”를 누르세요.'); }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then(() => { if (S.settings.notify) registerPeriodic(); }).catch(() => {});
  }

  // ---------- 시작 ----------
  render();
  save();
  checkReminders();
  setInterval(checkReminders, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkReminders(); if (ui.tab === 'diary' && ui.sel < today() && ui.month === ui.sel.slice(0, 7)) { /* 날짜 바뀜 */ } render(); } });
  if (new URLSearchParams(location.search).get('voice')) setTimeout(openVoice, 300);
  window.__app = { S: () => S, parse: P.parse };
})();
