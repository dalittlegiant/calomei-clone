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

1. 開 App → 去「設定」輸入 Vision API Key（預設 OpenRouter + `openai/gpt-4o-mini`）。
2. 「影相」影低餐嘢 → AI 分析 → 結果頁可以改名、改卡路里、剔走唔計嘅嘢、糾正認錯嘅食物、加離線食物庫嘅嘢。
3. 「記錄」睇返每日總數 vs 每日目標（Mifflin-St Jeor）。
4. 「設定」→ 語氣：揀老味 / 18+ / 仁慈 / 教會弟兄，仲可以編輯每個語氣嘅 Prompt（存喺 Dexie，隨時重置返預設值）。

## 檔案

- `src/config/prompts.ts` — 4 個語氣嘅預設 System Prompt + 糾正用 Prompt
- `src/lib/db.ts` — Dexie schema + settings（Vision 設定、語氣 Prompt 覆寫）
- `src/lib/foodDb.ts` — 離線食物庫搜尋（每 100 克營養值）
- `src/lib/image.ts` — Canvas 壓縮 + 三餐時間推斷
- `src/lib/vision.ts` — VisionClient（OpenAI-compatible、Structured Outputs、驗證 + repair retry）
- `src/lib/nutrition.ts` — Mifflin-St Jeor BMR/TDEE、每日目標
- `src/pages/` — Scan（影相掃描）、Result（結果編輯／糾正）、History（記錄）、Settings（設定）
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
