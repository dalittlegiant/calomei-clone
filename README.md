# CaLoMei Clone — 個人自用 PWA

影相識別食物、計卡路里、廣東話評語。原版 CaLoMei 卡老味嘅簡化重寫版，
用自己嘅 Vision LLM API（OpenRouter / OpenAI / Gemini 任駁）。

## 技術棧

- React 19 + Vite + Tailwind CSS v4，PWA（iPhone Safari「加入主畫面」）
- IndexedDB（Dexie.js），Schema 對應 `CLONE_SPEC.md` §4
- 影相用 Canvas 壓縮：最長邊 1024px、JPEG quality 70、Base64（照原版）
- 離線食物庫：`public/data/tfda_foods.json`（2,007 項）+ `china_foods.json`（1,130 項）
- 主題色 amber `#FFA500`（原版預設）

## 開發

```bash
npm install
npm run dev        # 開發伺服器
npm run build      # 生產 build（tsc + vite），輸出 dist/
npm run preview    # 本地預覽生產 build
```

## 用法

1. 開 App → 去「設定」輸入 Vision API Key（預設 OpenRouter + `openai/gpt-4o-mini`）。Model 有快捷選項（gpt-4o-mini、deepseek-v4.1-flash、gemini-2.5-flash）；OpenRouter 仲可以揀思考模式（預設關閉，避免推理模型食晒 max_tokens 出唔到 JSON）。
2. **主頁（今日總覽）**：sticky 星期 strip（撳日子篩選案底）+ 兩頁 scorecard carousel（第 1 頁卡路里 + 三大營養素，第 2 頁飲水 + 糖／纖維／鈉，下面有兩點指示器）+ 兩粒大掣「又食嘢？加啦」／「做咗運動？」+ 案底 feed（每餐有相 + roast banner + 時間 + 卡路里 + 蛋白質／碳水／脂肪）。深色主題預設；闊熒幕（iPhone Duo 打開）右邊出垂直 tool band，摺埋／直向就底部 tab bar。
3. **新增（＋）**：統一 sheet「又食嘢？揀個方法認罪」— 影相／上載／搜尋／收藏／打字／運動／飲水／上磅。打字模式冇相都得，照文字估算。
4. 「記錄」睇返每日總數 vs 每日目標（Mifflin-St Jeor），飲水改樽制（1 樽 500ml，目標 4 樽），仲有運動、體重／體脂記錄。
5. 「進度」：30 日營養圖（7 種營養切換，上限虛線，超標紅柱）+ 身體卡（體重／體脂／肌肉率／內臟脂肪／BMI 趨勢）+ 熱量赤字（近 14 日，約 7,700 kcal ≈ 1 公斤體脂）。
6. 「設定」→ 個人戰績（連續／最長／受刑日數／記錄幾多次／你嘅配額）；一日開始時間（預設 00:00）；主題（深色／淺色）。語氣：揀老味 / 18+ / 仁慈 / 教會弟兄 / 媽咪 / 佛系，仲可以編輯每個語氣嘅 Prompt（存喺 Dexie，隨時重置返預設值）。「自訂每日目標」可以改卡路里、蛋白質、碳水、脂肪、糖上限、纖維下限、鈉上限（留空即係用預設值）。
7. 結果頁可以改名、改卡路里、剔走唔計嘅嘢、糾正認錯嘅食物、加離線食物庫嘅嘢、收藏呢餐（去新增 sheet「收藏」可以直接加入）。

## iOS v2.0.1 介面改版（2026-11-21）

跟 Kong 嘅 iOS v2.0.1 截圖改版：主頁變今日總覽（sticky week strip + 兩頁 scorecard carousel + static 掣同案底 feed）；深色主題預設；案底 feed 卡片化（相 + roast banner）；統一新增 sheet（影相／上載／搜尋／收藏／打字／運動／飲水／上磅）；streaks + 個人戰績；飲水樽制；進度頁（30 日營養圖 + 身體趨勢 + 熱量赤字）；一日開始時間設定。目標數字唔係 hardcode — 由個人檔案經 Mifflin-St Jeor 計出。一個 responsive 設計兼容摺埋（底部 tab）同打開（右邊 tool band）兩種佈局。

明確唔做：帳號／Discord／優惠碼／Pro／免費配額、Widget、餐點提醒（iOS PWA 唔可以排程本地通知）、Health Connect、條碼掃描。

## v1.7.0 移植（2026-11-21）

跟原版 v1.7.0 移植：HK 新增媽咪、佛系兩個語氣；糖／纖維／鈉（Vision
Schema + 結果頁顯示／編輯）；飲水、運動、體脂記錄；駁斥 Roast（結果頁「駁佢」，舊評語留低做
`previous_roasts`）；營養標籤掃描；自訂每日目標（`nutrition_target_overrides`）。
Dexie 升到 version(2)，舊數據會保留；備份格式升到 v2（包埋新表，舊版備份照樣還原到）。

另外加咗「同步去 Apple Health」：經 iOS 捷徑 URL Scheme（`shortcuts://run-shortcut`）將一餐／飲水／體重包成
JSON 交畀你自建嘅捷徑寫入 HealthKit。捷徑名喺「設定」→「Apple Health」改（預設
`CaLoMeiToHealth`），嗰版有埋捷徑設定教學同 JSON 欄位表。

明確唔做：TTS、條碼掃描、q50／512px 壓縮（維持 1024px + q70）、TDEE 問卷。

## 檔案

- `src/config/prompts.ts` — 6 個語氣嘅預設 System Prompt + 糾正／標籤／駁斥用 Prompt
- `src/lib/db.ts` — Dexie schema（v2）+ settings（Vision 設定、語氣 Prompt 覆寫、捷徑名、自訂目標）
- `src/lib/foodDb.ts` — 離線食物庫搜尋（每 100 克營養值）
- `src/lib/health.ts` — Apple Health 匯出（iOS 捷徑 URL Scheme + JSON 欄位表）
- `src/lib/image.ts` — Canvas 壓縮 + 三餐時間推斷
- `src/lib/vision.ts` — VisionClient（OpenAI-compatible、Structured Outputs、驗證 + repair retry；掃描／糾正／駁斥／標籤）
- `src/lib/day.ts` — 一日開始時間（log-day）、星期 strip、streaks 計算
- `src/lib/nutrition.ts` — Mifflin-St Jeor BMR/TDEE、每日目標（含糖上限／纖維下限／鈉上限 + 自訂覆寫）、BMI、飲水樽制（1 樽 500ml）
- `src/pages/` — Home（今日總覽）、Scan（影相／標籤／打字）、Result（結果編輯／糾正／收藏）、History（記錄）、Progress（進度）、Settings（設定）、AddSheet（統一新增）
- 設計文件：`~/workspace/rea/calomei/VISION_API_DESIGN.md`、`CLONE_SPEC.md`

## 部署

`.github/workflows/deploy.yml`：一 push 上 `main` 就自動 build + deploy 去 GitHub Pages。

首次設定（只需做一次）：
1. GitHub 開一個空 repo：`dalittlegiant/calomei-clone`（public）。
2. Push 呢個專案上 `main`。
3. Repo → Settings → Pages → Build and deployment → Source 揀 **GitHub Actions**。
4. 之後每次 push 上 `main` 都會自動部署；網址係
   `https://dalittlegiant.github.io/calomei-clone/`。
5. iPhone Safari 開嗰網址 → 分享 → 加入主畫面。

## 私隱

全部資料（記錄、相片、API Key、Prompt）只存喺手機本地 IndexedDB，唔經任何自家後端。
唯一對外請求係直接去你揀嘅 Vision provider（OpenRouter / OpenAI / Gemini）。
