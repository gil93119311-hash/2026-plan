const P = require('../docs/parser.js');
const now = new Date(2026, 10, 13, 15, 40); // 2026-11-13 (금) 15:40
const cases = [
  ['어제 점심 신한카드로 김치찌개 9천원', {type:'expense',amount:9000,date:'2026-11-12',time:'12:30',cardId:'shinhan',category:'식비'}],
  ['스타벅스에서 커피 4500원 현금으로 결제', {amount:4500,cardId:'cash',category:'카페·간식',date:'2026-11-13'}],
  ['이마트 장보기 3만 5천원 국민카드', {amount:35000,cardId:'kb',category:'장보기'}],
  ['택시비 만 이천원', {amount:12000,category:'교통'}],
  ['점심이 9천원', {amount:9000,category:'식비'}],
  ['삼만오천원 주유했어', {amount:35000,category:'교통'}],
  ['다음주 월요일 관리비 15만원 내야 돼', {type:'planned',amount:150000,date:'2026-11-16',category:'주거·관리비'}],
  ['25일 카드값 120만원 나갈 예정', {type:'planned',amount:1200000,date:'2026-11-25'}],
  ['매달 25일 월세 50만원', {type:'schedule',amount:500000,recurring:{day:25,kind:'rent'}}],
  ['매월 10일 대출이자 32만원 자동이체', {type:'schedule',amount:320000,cardId:'transfer'}],
  ['11월 3일 오후 7시 30분 삼성카드 회식 12만원', {amount:120000,date:'2026-11-03',time:'19:30',cardId:'samsung',category:'식비'}],
  ['월급 350만원 들어왔어', {type:'income',amount:3500000,category:'수입'}],
  ['점심 9천원 그리고 커피 4500원', null],
  ['지난주 금요일 병원비 2만 3천원', {amount:23000,date:'2026-11-06',category:'의료·건강'}],
  ['쿠팡 2만원', {amount:20000,category:'생활용품'}],
  ['넷플릭스 13500원 현대카드', {amount:13500,cardId:'hyundai',category:'문화·여가'}],
  ['1.5만원 다이소', {amount:15000}],
  ['어제 저녁 치킨 2만 3천 500원 배민', {amount:23500,time:'19:00',date:'2026-11-12'}],
];
let fail=0;
for (const [t, exp] of cases) {
  const r = P.parse(t, {now});
  if (!exp) { console.log('MULTI', t, '=>', JSON.stringify(r.map(x=>[x.amount,x.category,x.title]))); if (r.length!==2) fail++; continue; }
  const x = r[0]; let ok = true;
  for (const k in exp) if (JSON.stringify(x[k]) !== JSON.stringify(exp[k])) ok=false;
  if (!ok) fail++;
  console.log(ok?'OK  ':'FAIL', t, '=>', JSON.stringify({type:x.type,amount:x.amount,date:x.date,time:x.time,card:x.cardId,cat:x.category,title:x.title,rec:x.recurring}));
}
console.log(fail? fail+' failed':'all passed'); process.exit(fail?1:0);
