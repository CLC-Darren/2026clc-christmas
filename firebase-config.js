
// Firebase Web App 公開設定
// 這些值不是密碼；不要把 Admin SDK 私密金鑰放在前端。
export const firebaseConfig = {
  apiKey: "AIzaSyBapk4wA25pZQDwnsUWenKNWjSpNvJUi-8",
  authDomain: "clc-christmas.firebaseapp.com",
  projectId: "clc-christmas",
  appId: "1:400047408001:web:71d05a67ee2ea9df3dde80"
};

// 只有這兩位能核准或解除鎖定；真正的限制同時寫在 firestore.rules。
export const superusers = [
  "darren.lin@twclc.org",
  "darren710404@twclc.org"
];

// 第一版只允許 twclc.org Workspace 帳號登入與填報。
export const allowedDomain = "twclc.org";

