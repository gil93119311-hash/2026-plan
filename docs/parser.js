/* 말로 하는 가계부 - 한국어 음성 문장 해석기
 * "어제 점심 신한카드로 김치찌개 9천원" →
 * { type:'expense', amount:9000, date:'2026-11-12', time:'12:30', cardId:'shinhan', category:'식비', title:'김치찌개' }
 */
(function (root) {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

  // ---------- 분류 사전 ----------
  const CATEGORIES = [
    { name: '식비', icon: '🍚', words: ['점심', '저녁밥', '아침밥', '밥값', '식사', '식당', '배달', '배민', '요기요', '쿠팡이츠', '치킨', '피자', '햄버거', '버거', '짜장', '짬뽕', '중국집', '김밥', '라면', '국밥', '찌개', '고기', '삼겹살', '회식', '분식', '떡볶이', '초밥', '돈까스', '냉면', '칼국수', '족발', '보쌈', '외식', '반찬', '도시락', '맥도날드', '롯데리아', '버거킹', '술', '맥주', '소주', '술값', '야식'] },
    { name: '카페·간식', icon: '☕', words: ['커피', '카페', '스타벅스', '스벅', '이디야', '메가커피', '빽다방', '투썸', '라떼', '아메리카노', '빵', '베이커리', '파리바게뜨', '뚜레쥬르', '케이크', '디저트', '아이스크림', '간식', '과자', '음료'] },
    { name: '장보기', icon: '🛒', words: ['마트', '이마트', '홈플러스', '롯데마트', '코스트코', '트레이더스', '장보기', '장 봤', '장봤', '시장', '식료품', '채소', '과일', '쌀', '노브랜드', '하나로'] },
    { name: '생활용품', icon: '🧴', words: ['다이소', '편의점', 'gs25', 'cu', '세븐일레븐', '이마트24', '생활용품', '휴지', '세제', '샴푸', '올리브영', '화장품', '쿠팡', '생필품'] },
    { name: '교통', icon: '🚌', words: ['택시', '카카오택시', '버스', '지하철', '교통', '기차', 'ktx', 'srt', '고속버스', '주유', '기름', '기름값', '주차', '톨비', '통행료', '하이패스', '전기차 충전', '항공', '비행기'] },
    { name: '주거·관리비', icon: '🏠', words: ['월세', '관리비', '전기', '전기세', '전기요금', '가스', '가스비', '도시가스', '수도', '수도세', '수도요금', '전세', '집세', '임대료'] },
    { name: '통신', icon: '📱', words: ['핸드폰', '휴대폰', '폰요금', '통신비', '통신', '인터넷', '와이파이', 'skt', 'kt', 'lg유플러스', '유플러스'] },
    { name: '금융·대출', icon: '🏦', words: ['대출', '이자', '대출이자', '원금', '할부', '카드값', '카드대금', '카드 대금', '보험', '보험료', '적금', '저축', '수수료', '연금'] },
    { name: '의료·건강', icon: '💊', words: ['병원', '약국', '약값', '치과', '한의원', '진료', '검진', '안과', '피부과', '정형외과', '헬스', '필라테스', '요가', '운동'] },
    { name: '교육', icon: '📚', words: ['학원', '교육', '책', '도서', '수강', '강의', '교재', '학비', '등록금', '과외', '학습지'] },
    { name: '문화·여가', icon: '🎬', words: ['영화', '넷플릭스', '유튜브', '구독', '공연', '콘서트', '전시', '게임', '여행', '숙박', '호텔', '펜션', '놀이공원', '노래방', 'pc방', '피씨방', '골프', '취미'] },
    { name: '쇼핑·의류', icon: '🛍️', words: ['옷', '의류', '신발', '가방', '백화점', '쇼핑', '무신사', '아울렛', '유니클로', '자라', '안경', '가전', '전자제품'] },
    { name: '경조사·선물', icon: '🎁', words: ['축의금', '조의금', '부조', '경조사', '선물', '생일', '용돈 드', '부모님', '기부', '헌금', '십일조'] },
    { name: '자녀·반려', icon: '🧸', words: ['아이', '애들', '아기', '기저귀', '분유', '장난감', '어린이집', '유치원', '강아지', '고양이', '사료', '동물병원'] },
    { name: '수입', icon: '💰', words: ['월급', '급여', '수입', '보너스', '상여', '이자수입', '환급', '부수입', '용돈 받', '입금'] },
    { name: '기타', icon: '📝', words: [] },
  ];
  // 점심/저녁/아침 같은 끼니 단어는 시간도 뜻함
  const MEAL_WORDS = { '아침': '08:00', '점심': '12:30', '저녁': '19:00', '야식': '22:00', '브런치': '11:00' };

  // ---------- 기본 결제수단 ----------
  const DEFAULT_CARDS = [
    { id: 'shinhan', name: '신한카드', aliases: ['신한'], color: '#2a5bd7' },
    { id: 'kb', name: 'KB국민카드', aliases: ['국민', 'kb', '케이비'], color: '#c9a200' },
    { id: 'samsung', name: '삼성카드', aliases: ['삼성'], color: '#1b4ea3' },
    { id: 'hyundai', name: '현대카드', aliases: ['현대'], color: '#333333' },
    { id: 'lotte', name: '롯데카드', aliases: ['롯데카드', '롯데 카드'], color: '#d6262e' },
    { id: 'hana', name: '하나카드', aliases: ['하나카드', '하나 카드'], color: '#00897b' },
    { id: 'woori', name: '우리카드', aliases: ['우리카드', '우리 카드'], color: '#0067ac' },
    { id: 'bc', name: 'BC카드', aliases: ['비씨', 'bc'], color: '#e03c31' },
    { id: 'nh', name: 'NH농협카드', aliases: ['농협', 'nh'], color: '#1f9d55' },
    { id: 'kakao', name: '카카오뱅크', aliases: ['카카오뱅크', '카뱅', '카카오페이', '카카오 페이'], color: '#e6b800' },
    { id: 'toss', name: '토스', aliases: ['토스'], color: '#3182f6' },
    { id: 'cash', name: '현금', aliases: ['현금', '캐시'], color: '#6b8e23' },
    { id: 'transfer', name: '계좌이체', aliases: ['계좌이체', '이체', '송금', '자동이체'], color: '#7e57c2' },
  ];

  // ---------- 숫자 ----------
  const HDIGIT = { '영': 0, '공': 0, '일': 1, '이': 2, '삼': 3, '사': 4, '오': 5, '육': 6, '륙': 6, '칠': 7, '팔': 8, '구': 9 };
  const SMALL = { '십': 10, '백': 100, '천': 1000 };
  const BIG = { '만': 10000, '억': 100000000 };

  function parseKoreanNumber(str) {
    const s = String(str).replace(/[,\s]/g, '');
    if (!s) return NaN;
    let total = 0, section = 0, cur = null, any = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (/[0-9.]/.test(ch)) {
        let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
        cur = parseFloat(s.slice(i, j)); i = j - 1; any = true;
      } else if (ch in HDIGIT) { cur = HDIGIT[ch]; any = true; }
      else if (ch in SMALL) { section += (cur === null ? 1 : cur) * SMALL[ch]; cur = null; any = true; }
      else if (ch in BIG) { total += ((section + (cur || 0)) || 1) * BIG[ch]; section = 0; cur = null; any = true; }
      else return NaN;
    }
    if (!any) return NaN;
    return Math.round(total + section + (cur || 0));
  }

  const NUMCH = '0-9일이삼사오육칠팔구십백천만억,.';
  // 금액 찾기: 반환 {amount, start, end}
  function findAmount(text) {
    // 1) "...원"으로 끝나는 금액
    const re = new RegExp(`[${NUMCH}][${NUMCH}\\s]*\\s*원`, 'g');
    let m, best = null;
    while ((m = re.exec(text))) {
      let start = m.index;
      let run = m[0].replace(/원$/, '');
      // 단어에 붙은 한글(조사 등)은 떼어냄: "점심이 9천원" → "9천"
      const prev = text[start - 1];
      if (prev && /[가-힣a-zA-Z]/.test(prev) && /[가-힣]/.test(run[0])) {
        const k = run.search(/[\s0-9]/);
        if (k < 0) continue;
        start += k; run = run.slice(k);
      }
      // 앞쪽의 단독 한글숫자 토큰 제거 ("이 9천" → "9천")
      let toks = run.trim().split(/\s+/);
      while (toks.length > 1 && /^[일이삼사오육칠팔구]$/.test(toks[0])) toks.shift();
      // 연결 불가능한 토큰 앞부분 제거 ("3 35000" 같은 경우)
      while (toks.length > 1 && isNaN(parseKoreanNumber(toks.join('')))) toks.shift();
      const v = parseKoreanNumber(toks.join(''));
      if (!isNaN(v) && v > 0) {
        const s0 = text.indexOf(toks[0], start);
        best = { amount: v, start: s0 >= 0 ? s0 : start, end: m.index + m[0].length };
        break;
      }
    }
    if (best) return best;
    // 2) "원" 없이: 숫자+단위 ("2만", "3만5천", "4500")
    const re2 = /(\d[\d,]*(?:\.\d+)?)\s*(억|만|천)?\s*(\d[\d,]*)?\s*(천)?(?!\s*(?:일|시|분|월|년|개|번|명|살|주|층|호|km|키로|프로|%|박|회|권|잔|병|인분))/g;
    while ((m = re2.exec(text))) {
      const raw = m[0].trim();
      if (!raw) continue;
      const v = parseKoreanNumber(raw);
      if (!isNaN(v) && (v >= 100 || /[만천억]/.test(raw))) {
        return { amount: v, start: m.index, end: m.index + m[0].length };
      }
    }
    // 3) 한글 숫자만 ("만오천", "삼만 원" 은 1에서 처리) — 단위 포함 필수
    const re3 = /(?:^|\s)([일이삼사오육칠팔구십백천]*[만천][일이삼사오육칠팔구십백천만]*)(?=\s|$)/g;
    while ((m = re3.exec(text))) {
      const v = parseKoreanNumber(m[1]);
      if (!isNaN(v) && v >= 1000) return { amount: v, start: m.index, end: m.index + m[0].length };
    }
    return null;
  }

  // ---------- 날짜 ----------
  const WD = { '일': 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6 };
  function findDate(text, now) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const removes = [];
    let date = null, m;
    const take = (re) => { const r = text.match(re); if (r) removes.push(r[0]); return r; };

    if ((m = take(/(그저께|그제|엊그제|엊그저께)/))) date = addDays(today, -2);
    else if ((m = take(/내일\s*모레|내일모레/))) date = addDays(today, 2);
    else if ((m = take(/어제|어저께/))) date = addDays(today, -1);
    else if ((m = take(/글피/))) date = addDays(today, 3);
    else if ((m = take(/모레/))) date = addDays(today, 2);
    else if ((m = take(/내일/))) date = addDays(today, 1);
    else if ((m = take(/(\d+)\s*일\s*(전|후|뒤)/))) date = addDays(today, (m[2] === '전' ? -1 : 1) * parseInt(m[1], 10));
    else if ((m = take(/(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일/))) {
      const y = m[1] ? parseInt(m[1], 10) : today.getFullYear();
      date = new Date(y, parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    } else if ((m = take(/(지난달|저번달|저번 달|지난 달|이번달|이번 달|다음달|다음 달|담달)\s*(\d{1,2})\s*일/))) {
      const off = /지난|저번/.test(m[1]) ? -1 : /다음|담달/.test(m[1]) ? 1 : 0;
      const y = today.getFullYear(), mo = today.getMonth() + off;
      const dim = daysInMonth(y, mo);
      date = new Date(y, mo, Math.min(parseInt(m[2], 10), dim));
    } else if ((m = take(/(지난주|저번주|지난 주|저번 주|이번주|이번 주|다음주|다음 주|담주)?\s*([월화수목금토일])요일/))) {
      const target = WD[m[2]];
      const mondayIdx = (today.getDay() + 6) % 7; // 월=0
      const monday = addDays(today, -mondayIdx);
      const tIdx = (target + 6) % 7;
      if (m[1]) {
        const off = /지난|저번/.test(m[1]) ? -7 : /다음|담주/.test(m[1]) ? 7 : 0;
        date = addDays(monday, off + tIdx);
      } else {
        // 그냥 "금요일" → 이번주 해당 요일 (오늘 이후라도 그대로; 지출이면 지난 요일로)
        date = addDays(monday, tIdx);
      }
    } else if ((m = take(/(?:^|\s)(\d{1,2})\s*일(?:에|날|자)?(?=\s|$|에|날)/))) {
      const d = parseInt(m[1], 10);
      if (d >= 1 && d <= 31) date = new Date(today.getFullYear(), today.getMonth(), Math.min(d, daysInMonth(today.getFullYear(), today.getMonth())));
    }
    if (/오늘/.test(text)) removes.push('오늘');
    return { date, removes };
  }

  function findTime(text) {
    const removes = [];
    let m = text.match(/(오전|오후|아침|낮|저녁|밤|새벽)?\s*(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분|(반))?/);
    if (m) {
      let h = parseInt(m[2], 10);
      const min = m[4] ? 30 : m[3] ? parseInt(m[3], 10) : 0;
      const ap = m[1];
      if ((ap === '오후' || ap === '저녁' || ap === '밤') && h < 12) h += 12;
      if (ap === '낮' && h < 7) h += 12;
      if ((ap === '오전' || ap === '새벽' || ap === '아침') && h === 12) h = 0;
      if (!ap && h >= 1 && h <= 6) h += 12; // "3시" → 오후 3시로 추정
      removes.push(m[0]);
      return { time: `${pad(Math.min(h, 23))}:${pad(Math.min(min, 59))}`, removes };
    }
    for (const w of Object.keys(MEAL_WORDS)) {
      if (text.includes(w)) return { time: MEAL_WORDS[w], meal: w, removes };
    }
    if (/새벽/.test(text)) return { time: '03:00', removes: ['새벽'] };
    if (/(^|\s)밤(\s|에|$)/.test(text)) return { time: '21:00', removes: [] };
    return { time: null, removes };
  }

  // ---------- 결제수단 ----------
  function findCard(text, cards) {
    const lower = text.toLowerCase();
    let best = null;
    for (const c of cards) {
      const names = [c.name, ...(c.aliases || [])].filter(Boolean);
      for (const a of names) {
        const al = a.toLowerCase();
        const idx = lower.indexOf(al);
        if (idx >= 0 && (!best || al.length > best.len)) best = { card: c, idx, len: al.length };
      }
    }
    if (!best) {
      if (/카드/.test(text) && !/카드\s*(값|대금|결제일)/.test(text)) return { cardId: null, phrase: null, hint: 'card' };
      return { cardId: null, phrase: null };
    }
    // "신한카드로", "신한 카드로", "현금으로" 까지 지우기
    const rest = text.slice(best.idx);
    const pm = rest.match(/^[^\s]*?(?:\s*카드)?(?:로|으로|에서|결제|로 결제)?(?=\s|$)/);
    return { cardId: best.card.id, phrase: pm ? pm[0] : text.substr(best.idx, best.len) };
  }

  function findCategory(text) {
    const lower = text.toLowerCase();
    let best = null;
    for (const c of CATEGORIES) {
      for (const w of c.words) {
        const i = lower.indexOf(w);
        if (i >= 0) {
          const score = w.length;
          if (!best || score > best.score) best = { name: c.name, score, word: w };
        }
      }
    }
    if (!best) {
      for (const meal of Object.keys(MEAL_WORDS)) if (text.includes(meal)) return '식비';
    }
    return best ? best.name : '기타';
  }

  // ---------- 지출/예정/수입 구분 ----------
  function findType(text, dateStr, todayStr) {
    if (/(월급|급여|보너스|상여|환급|부수입|수입|용돈\s*받|입금\s*(됐|되었|받)|들어왔|들어옴|받았)/.test(text) && !/(썼|결제했|냈|샀)/.test(text)) return 'income';
    if (/(예정|할\s*거|할거|낼\s*거|낼거|내야|나갈|나가야|갚아야|살\s*거|살거|사야|결제할|납부할|낼\s*것|할\s*것|예약)/.test(text)) return 'planned';
    if (dateStr && dateStr > todayStr) return 'planned';
    return 'expense';
  }

  // ---------- 매달 반복(고정지출) ----------
  function findRecurring(text) {
    const m = text.match(/(매달|매월|달마다|다달이|월마다)\s*(?:(\d{1,2})\s*일|말일)?/);
    if (!m) return null;
    let day = m[2] ? parseInt(m[2], 10) : (/말일/.test(m[0]) ? 31 : null);
    if (!day) { const d2 = text.match(/(\d{1,2})\s*일/); if (d2) day = parseInt(d2[1], 10); }
    let kind = 'etc';
    if (/(카드값|카드대금|카드 대금|결제일|카드 결제)/.test(text)) kind = 'card';
    else if (/(대출|이자|원리금|원금)/.test(text)) kind = 'loan';
    else if (/(월세|집세|임대료)/.test(text)) kind = 'rent';
    else if (/(관리비|전기|가스|수도|통신|핸드폰|인터넷|보험|구독|넷플릭스|학원)/.test(text)) kind = 'bill';
    return { day: day || 1, kind, phrase: m[0] };
  }

  const STOP = /(으로|로|에서|에|을|를|이|가|은|는|도|했어요|했어|했음|했다|썼어요|썼어|썼음|썼다|씀|샀어요|샀어|샀음|결제했어|결제함|결제|냈어|냈음|지출|사용|계산|예정이야|예정|이야|이에요|입니다|해야\s*돼|해야\s*함|내야\s*돼|내야\s*함|내야\s*해|내야|할\s*거야|할거야|할\s*거|할거|낼\s*거야|낼거야|낼\s*거|낼거|나갈\s*거|나갈|나감|낼|갚을|들어왔어요|들어왔어|들어왔음|들어옴|받았어|받음|요)$/;

  function cleanTitle(text, pieces) {
    let t = ' ' + text + ' ';
    for (const p of pieces) if (p) t = t.split(p).join(' ');
    t = t.replace(/\b(오늘|지금|방금|아까)\b/g, ' ');
    let words = t.split(/\s+/).filter(Boolean)
      .map((w) => { let prev; do { prev = w; w = w.replace(STOP, ''); } while (w && w !== prev && w.length > 1); return w; })
      .filter((w) => w && !/^(오늘|지금|방금|아까|원|카드|그리고|좀|거|것|돈|총|해서|하고|정도|쯤|약|대충|에서|으로|로|있어|있음|해|돼|함|매달|매월)$/.test(w));
    return words.join(' ').trim();
  }

  // 한 문장 해석
  function parseOne(text, opts) {
    const now = opts.now || new Date();
    const cards = opts.cards || DEFAULT_CARDS;
    const todayStr = ymd(now);
    const src = text.trim();

    const amt = findAmount(src);
    const amountText = amt ? src.slice(amt.start, amt.end) : null;
    const rec = findRecurring(src);
    const dt = findDate(src, now);
    const tm = findTime(src);
    const cd = findCard(src, cards);
    const category = findCategory(src);
    let dateStr = dt.date ? ymd(dt.date) : (opts.inheritDate || todayStr);
    let type = findType(src, dt.date ? dateStr : null, todayStr);
    if (category === '수입' && type === 'expense') type = 'income';
    // 요일만 말했는데 미래 날짜가 되면 지출일 때는 지난주로
    if (type === 'expense' && dateStr > todayStr && dt.removes.some((r) => /요일/.test(r) && !/다음|담주|이번/.test(r))) {
      const d = new Date(dateStr); d.setDate(d.getDate() - 7); dateStr = ymd(d);
    }
    let time = tm.time;
    if (!time) time = (dateStr === todayStr && type !== 'planned') ? hm(now) : (opts.inheritTime || (type === 'expense' ? '12:00' : '09:00'));

    const pieces = [amountText, cd.phrase, rec && rec.phrase, ...dt.removes, ...tm.removes];
    let title = cleanTitle(src, pieces);
    if (!title) title = tm.meal || category;

    const result = {
      raw: src,
      type,
      amount: amt ? amt.amount : 0,
      date: dateStr,
      time,
      cardId: cd.cardId || opts.defaultCardId || null,
      cardGuessed: !cd.cardId,
      category: type === 'income' ? '수입' : category,
      title,
    };
    if (rec) {
      result.recurring = { day: rec.day, kind: rec.kind };
      result.type = 'schedule';
    }
    return result;
  }

  // 여러 항목: "점심 9천원 그리고 커피 4500원"
  function parse(text, opts = {}) {
    if (!text || !text.trim()) return [];
    const parts = text.split(/\s*(?:그리고|,|그다음에|그 다음에|또\s)\s*/).map((s) => s.trim()).filter(Boolean);
    const withAmount = parts.filter((p) => findAmount(p));
    const segs = withAmount.length > 1 ? mergeOrphans(parts) : [text];
    const out = [];
    let inheritDate = null, inheritTime = null;
    for (const s of segs) {
      const r = parseOne(s, Object.assign({}, opts, { inheritDate, inheritTime }));
      if (findDate(s, opts.now || new Date()).date) inheritDate = r.date;
      out.push(r);
      if (!inheritDate) inheritDate = r.date;
    }
    return out;
  }
  // 금액 없는 조각은 앞 조각에 붙임
  function mergeOrphans(parts) {
    const out = [];
    for (const p of parts) {
      if (!findAmount(p) && out.length) out[out.length - 1] += ' ' + p;
      else if (!findAmount(p)) out.push(p);
      else if (out.length && !findAmount(out[out.length - 1])) out[out.length - 1] += ' ' + p;
      else out.push(p);
    }
    return out;
  }

  const api = { parse, parseOne, parseKoreanNumber, findAmount, CATEGORIES, DEFAULT_CARDS, ymd, hm, pad, addDays, daysInMonth };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VoiceParser = api;
})(typeof self !== 'undefined' ? self : this);
