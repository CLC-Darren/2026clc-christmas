// 由 GitHub Actions 每天早上執行：若「明天」是 reminders.json 裡的節點，就用 Resend 寄出提醒信。
// 需要 GitHub Secrets：RESEND_API_KEY、RESEND_FROM。可選 Variable：SITE_URL。
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('../reminders.json', import.meta.url), 'utf8'));
const { RESEND_API_KEY, RESEND_FROM, SITE_URL = '', TEST_SEND = '', FORCE_DATE = '' } = process.env;

// 台北時間的「明天」
const taipeiToday = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const tomorrow = FORCE_DATE || new Date(Date.parse(taipeiToday) + 86400e3).toISOString().slice(0, 10);

let due = cfg.milestones.filter(m => m.date === tomorrow);
if (TEST_SEND === 'true') {
  const next = cfg.milestones.find(m => m.date >= taipeiToday) || cfg.milestones.at(-1);
  due = [{ ...next, title: '【測試】' + next.title }];
}
if (!due.length) { console.log(`台北今天 ${taipeiToday}，明天 ${tomorrow} 沒有節點，不寄信。`); process.exit(0); }
if (!RESEND_API_KEY || !RESEND_FROM) { console.error('缺少 RESEND_API_KEY 或 RESEND_FROM，請到 GitHub Settings → Secrets 設定。'); process.exit(1); }

const site = SITE_URL.replace(/\/$/, '');
for (const m of due) {
  const link = site ? `\n\n專案網站：${site}/${m.anchor || ''}` : '';
  const payload = {
    from: RESEND_FROM,
    to: cfg.recipients,
    subject: `明天：${m.title}｜2026 CLC 特別聖誕季`,
    text: `2026 CLC 特別聖誕季提醒\n\n${m.title}\n${m.detail}${link}\n\n（此信由系統於節點前一天早上自動寄出）`,
  };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) { console.error('寄送失敗', res.status, body); process.exit(1); }
  console.log('已寄出：', payload.subject, '→', cfg.recipients.join(', '));
}
