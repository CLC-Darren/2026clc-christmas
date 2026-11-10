// 只填 Firebase Console > 專案設定 > 你的應用程式 > Web app 的公開設定。
// 這些值不是密碼；不要把 Admin SDK 私密金鑰放在前端。
export const firebaseConfig = {
  apiKey: "PASTE_FIREBASE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  appId: "PASTE_FIREBASE_APP_ID"
};

// 只有這兩位能核准或解除鎖定；真正的限制同時寫在 firestore.rules。
export const superusers = [
  "darren.lin@twclc.org",
  "darren710404@twclc.org"
];

// 第一版只允許 twclc.org Workspace 帳號登入與填報。
export const allowedDomain = "twclc.org";
