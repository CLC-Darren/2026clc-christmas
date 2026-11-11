# 2026 CLC Christmas｜2026/11/11 首頁彈出表單更新

本更新包是**整站可部署版本**，以「中央物資多張相簿＋聖誕樹 PWA」的上一版完整網站為基礎，新增兩項首頁操作：

- 首頁 THE WAY 視覺內直接顯示「已回報新朋友總數」及江翠／新莊／林口／宏匯四個分類統計；數字沿用現有 Firestore `christmas2026/main/counts` 即時同步、管理者刪除後自動重新計算。
- 「＋回報新人人數」開啟 Pop-up；保留原本 8 個日期及依分堂的場次：江翠 5 場，新莊與林口各 3 場，宏匯 4 場依日期分配。送出直接公開，不需要登入或審核。
- 「＋新增餐點提案」開啟 Pop-up；可一次新增多筆餐點，原來的照片、名稱、單價、總預算、備註等欄位全部保留。
- 上方餐點區**顯示所有已提交餐點**，不再在下方重複顯示同一份餐點清單。管理者刪除按鈕移至上方展示卡片。
- 下方保留餐點預算提醒與新人人數明細，但移除重複的填報表單；其新增按鈕也會開啟同一個 Pop-up。
- 沒有修改 Firebase 資料格式、Firestore Rules、後端權限、中央照片相簿或 PWA 安裝設定。

## 手動部署（一次即可）

1. 解壓縮本 ZIP。登入 GitHub，開啟 Repository `CLC-Darren/2026clc-christmas` 的預設分支。
2. 選擇 **Add file → Upload files**，將此 ZIP 解壓後的檔案與資料夾上傳到 Repository 根目錄（不是 ZIP 檔本身），維持 `assets/`、`functions/` 資料夾路徑。點選 **Commit changes**。
3. Cloudflare Pages → **Deployments**，確認 Production 部署完成，瀏覽器按 **Ctrl+F5**（手機可使用無痕模式）重新開啟。原本 `firebase-config.js` 的公開 Web 設定已沿用，不必重建 Firebase。
4. **此版不需要重新 Publish Firestore Rules**；`firestore.rules` 仍隨 ZIP 保留作為備份。若你的 Firebase 正在使用先前公布、可匿名新增餐點／人數的最新版規則，維持不動即可。

## 驗收

- 打開首頁，不用登入，按「＋新增餐點提案」會顯示 Pop-up；可新增數筆並填寫，完成後回到首頁餐點展示。
- 不登入，按「＋回報新人人數」會開啟 Pop-up，先選日期，再選分堂與場次，送出後首頁黃金色的大數字及分堂統計會同步增加。
- 滾到下方只有資料說明／明細，不會再出現第二份重複填報表單。
- 以兩位既有管理者帳號登入時，仍可在首頁餐點卡片、回報明細刪除錯誤資料。

> 注意：本機已完成 HTML/JavaScript 語法、離線瀏覽器 Popup 與手機排版測試；尚未連線到你的正式 Firestore 對真實帳號寫入測試。正式部署後請先用一筆小型測試資料確認同步，再刪除測試資料。

---

# 2026 CLC 特別聖誕季｜THE WAY

這是一個 **Cloudflare Pages + Firebase Authentication + Firestore** 的輕量靜態網站。GitHub 保存檔案，Cloudflare 發布網站。僅使用一般瀏覽器，不需要 Work、Codex、CLI、Node.js 編譯或 Firebase Storage。

## 第一版已有的功能

- 依四週呈現 12/05–12/27 活動：第 1、2、3、4 週；第三週 12/19–20 為宏匯聖誕四場接待。
- 首頁 Brief、Timeline、快速連結；一般接待、中央物資、三分堂餐點及預算、宏匯四場人力。
- 新人人數回報（日期、分堂／活動、場次、人數、填報人、備註）；彙整已回報總人數。
- Google 登入。第一版允許已驗證的 `@twclc.org` 帳號填報；僅 2 位 Superuser 能確認／鎖定／解鎖：`darren.lin@twclc.org`、`darren710404@twclc.org`。
- 草稿本機保留，開啟編輯 10 分鐘後自動儲存至 Firestore；正式按「送出確認」後才進入待審核清單。
- 餐點照片：最多每分堂 3 張，瀏覽器自動轉成小 JPEG，暫存 Firestore 獨立文件。**這是為一次性少量照片的省平台方案，不適合大量照片或長期使用**。
- 修改紀錄；可選配 Cloudflare Pages Function + Resend 自動寄待審核通知至 `darren.lin@twclc.org`。未設定寄信不影響資料提交與網頁審核。

## 手動設定：建議按這個順序

### 1. GitHub
1. 建立 repository：`2026CLC_Christmas`。GitHub 可以設 Private；Cloudflare Pages 可連接 Private repository。
2. 將這個 ZIP **解壓縮** 後，把所有檔案及資料夾放到 repository 根目錄（**不是把 ZIP 當單一檔案上傳**）。
3. 不需要 GitHub Actions，也不需要在 GitHub 填入任何 Token。

### 2. Firebase（建議新建專案，避免碰到 YA／SR 舊資料）
1. Firebase Console → Add project，新建如 `clc-christmas-2026`（如名稱已被使用，自訂另一個 ID）。
2. Project settings（齒輪）→ Your apps → 新增 Web app。複製 `firebaseConfig` 中 `apiKey`、`authDomain`、`projectId`、`appId`。
3. 在 GitHub 修改專案根目錄 **`firebase-config.js`**，填入這四個值。這是公開的 Web app 設定，**不要放 Admin SDK private key**。
4. Firebase → Build → Authentication → Get started → Sign-in method → 啟用 **Google**；選擇支援 Email。
5. Firebase → Authentication → Settings → Authorized domains：將 Cloudflare 正式網域（例如 `your-project.pages.dev`，**只填主機名稱、不含 https://**）加入。測試網域若要測也要另外加入。
6. Firebase → Build → Firestore Database → Create database。選定資料庫地區（例如台灣或鄰近的可用區域；建立後不易改），使用 Production mode；到 **Rules**，整份貼入根目錄 `firestore.rules`，按 **Publish**。不要使用公開讀寫測試規則。
7. Firestore 文件會在第一次提交資料時自動建立；不需手工輸入集合或匯入 JSON。

### 3. Cloudflare Pages
1. Cloudflare → Workers & Pages → Create application → Pages → Connect to Git。
2. 選擇 `2026CLC_Christmas` repository，Production branch 選 `main`。
3. Framework preset：**None**；Build command：**留空**；Build output directory：**`.`**（專案根目錄）。
4. 完成部署後，複製 Cloudflare 顯示的實際 Production 網址；不要猜測網址。
5. 回 Firebase Authentication → Authorized domains，把 Production 網域加入；若網域有變更，也要重新確認。
6. 登入 `darren.lin@twclc.org` 測試：編輯餐點 → 儲存草稿 → 送出確認 → Superuser 確認 → 欄位鎖定。

### 4. （選配）自動 Email 寄給 Darren
Firestore 本身不會因前端提交就自動寄信，Cloudflare Pages 也不會自動提供寄件地址。因此本包提供 `/functions/api/notify.js`，使用 **Resend** 寄 Email。沒有設定時，網站內待審核與修改紀錄仍正常運作，使用者會看到「Email 尚未設定」。

1. 在 Resend 建立帳號，完成 `twclc.org` 寄件網域的 DNS 驗證（這步通常需負責網域的人協助）；也可使用自己擁有、已驗證的其他寄件網域。
2. Resend 建立 API key。
3. Cloudflare Pages 專案 → Settings → Variables and Secrets → Production 設定：
   - `RESEND_API_KEY` = Resend API key（**Secret**）
   - `RESEND_FROM` = 已驗證寄件地址（例如 `CLC Christmas <notifications@你已驗證的網域>`，**Text**）
   - `FIREBASE_WEB_API_KEY` = Firebase Web `apiKey`（Text）
   - `FIREBASE_PROJECT_ID` = Firebase 專案 `projectId`（Text）
4. 重新觸發 Production 部署使環境變數生效。請用實際提交操作測試通知能否寄達。
5. 不要把 Resend API key 寫到 `firebase-config.js`、GitHub 或 README。

> Cloudflare Function 驗證 Firebase 登入和 Firestore 當前待審核項目後才寄信。這是輕量內部流程；如日後需大量通知，應追加伺服器端防重寄／節流機制。

## 為何沒用 Firebase Storage？
依 Firebase 目前官方規定，Cloud Storage for Firebase 需要 Blaze 方案。這版為「少量聖誕餐點圖片」把照片轉為壓縮 JPEG 後寫入 Firestore 獨立文件，避免額外啟用 Storage 的帳務設定。每張影像在瀏覽器壓縮後限制在約 290,000 字元（相當小），每分堂最多三張。請勿上傳包含人臉、個資或敏感資料的圖片。未來如果需要大量照片，可以改成 Firebase Storage 或 R2，而不需重新設計整個網站。

## Google 表單參考及待確認事項

提供的原始表單（需具備存取權）：
https://docs.google.com/forms/d/1AzTEkqxydEYL1uA6kmDsQEg2PhH6r7Fv-rdm6vgZbAQ/edit

目前無法透過已連接的工具讀出該表單的實際題目，所以本版使用：**活動日期、分堂／活動、場次、新朋友人數、填報人、備註**。這並非宣稱和既有 Google Form 欄位完全相同。確定欄位後可再微調 `index.html` 的 `#countForm` 與 `app.js` 的 `submitCount()`。

## 第一版刻意不做

- 各分堂內部 SOP 和接待排班細節；只保留總窗口／人力配置。
- 新朋友姓名、電話或任何個資；目前只記人數統計。
- 與原 Google Form／Sheet 自動雙向同步（兩邊獨立，請選其中一個作為正式紀錄來源，以免重複計數）。
- 複雜角色權限和個別分堂管理者；全部 @twclc.org 已驗證帳號可填報，兩個 Superuser 核准／鎖定。
- 照片的完善清理工具。一般同工移除照片是解除卡片關聯，不會立即刪掉已上傳的影像文件；Superuser 移除時會刪除文件。

## 常見問題

- **登入失敗 `auth/unauthorized-domain`**：Firebase Auth Authorized domains 沒加 Cloudflare 正式網址。
- **讀寫失敗 `permission-denied`**：沒發布 `firestore.rules`，或使用非 `@twclc.org` 的 Google 帳號。
- **頁面顯示唯讀**：`firebase-config.js` 仍是 `PASTE_...`，或瀏覽器尚未取得更新版本。
- **資料儲存了但沒有收到 Email**：必須設定 Resend / Cloudflare 四個環境變數，並確認寄件網域完成驗證。
- **預覽有海報但頁面背景太暗**：更改 `styles.css` `.hero` 的 `linear-gradient` 不影響資料功能。

## 技術與安全提醒

Firestore Rules 是實際安全邊界，**前端顯示 Superuser 不是存取控管本身**。此專案使用了最小權限的兩級寫入規則，所有內部資料都需有效 Workspace 登入才可讀取。客戶端寫入的修改紀錄屬於作業追蹤，並非不可竄改的法律審計紀錄。請勿直接貼入包含個資的回報內容。

> 本包提供可部署原始碼，但沒有替你建立 Firebase 專案或 Cloudflare 網站；網域、Firebase config 和 Email 寄送需依上述步驟實際設置。


## 2026-11-11 更新｜相簿與 PWA

中央貼紙／餐券各自支援多張拖放上傳，Firestore `centralAssets/{id}/photos` 每張一份資料。
公開瀏覽，只有兩位 Superuser 能新增、刪除；舊 `centralAssets/{id}` 的單張圖片兼容顯示。
安裝使用 `manifest.webmanifest`、`pwa.js`、`sw.js`；安裝服務不快取網站資料。詳見 `DEPLOY_GUIDE_20261111.txt`。
