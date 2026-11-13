// 음성 인식이 문장마다 끊겨도 20초 동안 이어 듣는지 확인 (가짜 마이크)
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => {
    const phrases = ['어제 점심 신한카드로 김치찌개 9천원', '그리고 커피 4500원', '그리고 택시 만 이천원 현금'];
    let n = 0; window.__starts = 0;
    window.webkitSpeechRecognition = class {
      start() {
        window.__starts++;
        const p = phrases[n++];
        setTimeout(() => {
          if (p) this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: p }], { isFinal: true })] });
          setTimeout(() => this.onend && this.onend(), 200); // 휴대폰처럼 한 문장 뒤 끊김
        }, 400);
      }
      stop() { setTimeout(() => this.onend && this.onend(), 50); }
      abort() {}
    };
    window.SpeechRecognition = window.webkitSpeechRecognition;
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/');
  // 1) 문장 3개 → 자동 재시작으로 이어붙임 → '말 다 했어요'
  await p.click('#micFab');
  await p.waitForTimeout(3000);
  const cd = await p.textContent('#countdown');
  await p.click('#stopVoice'); await p.waitForTimeout(400);
  const items = await p.$$eval('.parsed .raw', els => els.map(e => e.textContent));
  console.log('countdown:', cd, '| restarts:', await p.evaluate(() => window.__starts), '| items:', items.length, items);
  // 2) 아무 말 없을 때 20초 뒤 자동 종료
  await p.click('[data-close]');
  await p.evaluate(() => { window.webkitSpeechRecognition.prototype.start = function () { window.__starts++; setTimeout(() => this.onend && this.onend(), 300); }; window.__starts = 0; });
  await p.click('#micFab');
  await p.waitForTimeout(21000);
  console.log('after 20s:', await p.textContent('#transcript'), '| stop hidden:', await p.isHidden('#stopVoice'), '| restarts:', await p.evaluate(() => window.__starts));
  const ok = items.length === 3 && await p.isHidden('#stopVoice');
  console.log('errors', errs, ok ? 'PASS' : 'FAIL');
  await b.close(); process.exit(ok ? 0 : 1);
})();
