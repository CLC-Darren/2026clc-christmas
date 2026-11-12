/**
 * 2026 CLC 特別聖誕季：節點前一天早上 9 點（台北時間）寄提醒信。
 *
 * 使用方式（只要做一次）：
 * 1. 到 https://script.google.com 新增專案，把這整個檔案貼進去，存檔。
 * 2. 上方函式選單選 setupTriggers，按「執行」，依畫面授權（用要寄信的那個 Google 帳號）。
 * 3. 想先試寄：選 sendTestEmail 按「執行」，會馬上寄一封【測試】信。
 * 之後改日期、內容或收件人：改下面的設定，再執行一次 setupTriggers。
 */

const RECIPIENTS = ['darren.lin@twclc.org'];   // 要加人就加在這裡，用逗號分隔
const SITE_URL = '';                            // 選填：網站網址，填了信裡會附連結

// date＝要寄信的時間（節點前一天 09:00）
const REMINDERS = [
  { date: '2026-11-19T09:00:00+08:00', title: '11/20（五）各分堂餐點提交截止',
    detail: '明天截止。請確認各分堂與聚會的餐點、照片、單價與預計總預算都已填寫。', anchor: '#meals' },
  { date: '2026-12-04T09:00:00+08:00', title: '聖誕季接待・第一週',
    detail: '明天 12/05（六）青、晚崇，12/06（日）主日新人接待。', anchor: '#timeline' },
  { date: '2026-12-11T09:00:00+08:00', title: '聖誕季接待・第二週',
    detail: '明天 12/12（六）青、晚崇，12/13（日）主日新人接待。', anchor: '#timeline' },
  { date: '2026-12-18T09:00:00+08:00', title: '宏匯聖誕・四場聚會',
    detail: '明天 12/19（六）下午／晚上，12/20（日）早上／下午。', anchor: '#timeline' },
  { date: '2026-12-25T09:00:00+08:00', title: '聖誕季接待・第四週',
    detail: '明天 12/26（六）青、晚崇，12/27（日）主日新人接待。', anchor: '#timeline' },
];

/** 清掉舊的排程，依 REMINDERS 重新建立（每個時間點一個一次性觸發器）。 */
function setupTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sendDueReminders')
    .forEach(t => ScriptApp.deleteTrigger(t));
  const now = new Date();
  const created = [];
  REMINDERS.forEach(r => {
    const when = new Date(r.date);
    if (when > now) {
      ScriptApp.newTrigger('sendDueReminders').timeBased().at(when).create();
      created.push(Utilities.formatDate(when, 'Asia/Taipei', 'MM/dd HH:mm') + '  ' + r.title);
    }
  });
  Logger.log('已排程 %s 封：\n%s', created.length, created.join('\n'));
}

/** 觸發器呼叫：寄出「今天（台北時間）」該寄的提醒。 */
function sendDueReminders() {
  const today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  REMINDERS.filter(r => r.date.slice(0, 10) === today).forEach(r => send_(r, ''));
}

/** 手動測試：立刻寄出下一個節點的提醒（標題加【測試】）。 */
function sendTestEmail() {
  const now = new Date();
  const next = REMINDERS.find(r => new Date(r.date) > now) || REMINDERS[REMINDERS.length - 1];
  send_(next, '【測試】');
}

function send_(r, prefix) {
  const link = SITE_URL ? '\n\n專案網站：' + SITE_URL.replace(/\/$/, '') + '/' + (r.anchor || '') : '';
  const subject = prefix + '明天：' + r.title + '｜2026 CLC 特別聖誕季';
  const body = '2026 CLC 特別聖誕季提醒\n\n' + r.title + '\n' + r.detail + link +
               '\n\n（此信由系統於節點前一天早上自動寄出）';
  MailApp.sendEmail({ to: RECIPIENTS.join(','), subject: subject, body: body, name: '2026 CLC 聖誕季' });
  Logger.log('已寄出：%s → %s', subject, RECIPIENTS.join(', '));
}
