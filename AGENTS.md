# AGENTS.md — CaLoMei Clone

> 專案：CaLoMei Clone（個人自用 PWA，React + Vite + Tailwind + Dexie）。
> 本文件係俾後續改動（人手或 AI agent）睇嘅硬規則。

## 鐵律：只換皮、零改動功能

- `src/lib/` 入面全部檔案（`db.ts`、`vision.ts`、`foodDb.ts`、`image.ts`、
  `nutrition.ts`、`backup.ts`、`day.ts`、`health.ts`）同 `src/config/prompts.ts`
  **一個字都唔准郁**：Dexie schema、VisionClient、圖片壓縮、備份還原、Apple Health
  捷徑匯出邏輯全部係禁區。
- 唔准為咗配合美觀而刪減、隱藏或簡化任何現有功能：2-slide 左右滑動營養卡、
  影食物／影營養標籤模式切換、駁斥 Roast、糾正 AI、手動加減／剔除食物成分、
  離線食物庫搜尋、飲水／運動／體脂記錄、自訂營養目標、自訂語氣 Prompt 編輯器、
  JSON 備份還原、匯出 Apple Health（iOS 捷徑）按鈕——全部必須完整保留並正常運作。

## 視覺：Warm Obsidian Liquid Glass（唯一規範）

- **所有後續新增頁面、彈窗或功能，必須嚴格遵守 `DESIGN.md` 嘅 Warm Obsidian
  Liquid Glass 規範，並優先重用 `src/components/ui/` 與 `src/index.css` 嘅玻璃樣式，
  禁止引入不一致嘅配色或框架樣式。**
- 設計權威係專案根目錄嘅 `DESIGN.md`（v2，2026-11-21 Kong 定案；深藍 v1 已放棄）。
- 共用樣式集中喺兩處：`src/index.css`（CSS 變量＋`.glass-card`／`.glass-subcard`／
  `.glass-pill`／`.glass-cta-amber`／`.glass-cta-teal`／`.glass-nav`／`.glass-input`／
  `.glass-sheet`）同 `src/components/ui/Glass.tsx`（`GlassCard`、`GlassSubcard`、
  `GlassButton`、`GlassModal`）。新 UI 優先用呢啲，唔准逐頁自創卡片／按鈕／彈窗樣式。
- 純 CSS 實現玻璃，**嚴禁 SVG `feDisplacementMap`**（iOS Safari 唔支援）。
- 單一深色身份：淺色主題已退役，唔准加返主題切換。

## 熱量赤字（唔准改返錯）

- 赤字計算唯一真相來源係 `src/pages/deficit.ts`：只計有記食物嘅日子、用
  TDEE（唔係每日目標卡路里）做基準。唔准改返「無記數當食 0」或者「用目標
  卡路里計」嗰套舊算法。詳見 DESIGN.md §10。

## 結果頁（唔准展開大表單）

- 結果頁食材列表必須係單行玻璃條，撳一行開 `IngredientSheet` 單獨編輯——
  唔准將每樣食材展開成成堆輸入框。份數縮放唯一真相來源係
  `src/pages/resultUtils.ts`（base × multiplier）；克數由 portionDescription
  解析，唔准為咗存克數而改 Dexie schema。詳見 DESIGN.md §11。

## 驗收（改完先交，唔准直接 push）

1. `npm run build` 零錯誤（TypeScript＋打包）。
2. 喺 `/calomei-clone/` 子路徑下真實渲染驗收，唔係淨睇 HTTP 200——
   HTTP 200 唔等於 render 到（2026-11-21 黑屏教訓：未索引嘅 Dexie `orderBy`
   會令成個 app 黑屏；所有 `orderBy`／`where` 必須用已索引嘅欄位）。
   **截圖前一定要 double-reload 先攞到新 bundle**——個 tab 會繼續行舊 JS，
   截出嚟嘅圖 file hash 同上一張一模一樣即係舊版，未更新。
3. `git diff --stat` 確認 `src/lib/` 同 `src/config/prompts.ts` 無被改動。
4. 部署要經 Kong 俾嘅一次性 GitHub PAT（push 完即刻移除 remote，佢 revoke）。

> 2026-11-22 一次性特批：Kong 批准今次修改 `src/lib/backup.ts`、
> `src/lib/vision.ts`、`src/lib/foodDb.ts`、`src/lib/health.ts`（Audit
> H1–L8 修復清單），Dexie schema version 不變；之後 `src/lib/` 恢復禁區。
> 今次 `git diff --stat` 會見到 lib 有改動，係特批，唔係違規。
>
> 2026-11-22 第二次一次性特批：Kong 批准今次修改 `src/lib/vision.ts`
>（駁佢 `rebutRoast` 崩潰修復：`fixTotal` 由通用 `chatCompletion` 搬去
> 三條食物路徑，`rebutRoast` 只讀 `roast_comment`）；之後 `src/lib/`
> 恢復禁區。
>
> 2026-11-23 一次性特批：Kong 批准今次修改 `src/config/prompts.ts`
>（掃描 prompt `SHARED_FOOD_RULES` 加數件數規則：同款食物多件要逐件
> 數，份量同營養按總件數計 — 茶葉蛋 2 隻只計 1 隻嘅教訓）；之後
> `src/config/prompts.ts` 恢復禁區。

> 2026-11-23 一次性特批（Meal Planner）：Kong 批准今次修改
> `src/lib/db.ts`（Dexie v3，只加 recipes／meal_plans／grocery_items
> 三表＋settings cooking_prefs，舊表零改動）、`src/lib/backup.ts`
>（備份 v3，包埋新表；匯入舊版 v2 備份唔清新表），以及新增
> `src/lib/mealPlanner.ts`（AI 食譜生成＋買餸合併＋4 款 mock 食譜）。
> `prompts.ts`／`vision.ts`／其餘 `src/lib/` 檔案今次無郁，之後
> `src/lib/` 恢復禁區。份量語義（全站統一）：食材份量／營養係成個
> 食譜（servings 人份）嘅總量，每份 = 總量 ÷ servings；買餸合併、
> 下廚材料、Log 寫入全部用同一條數，唔准各自一套。
>
> 2026-11-23 一次性特批（Dexie v4，SavedFood 完整營養素）：Kong
> 批准今次修改 `src/lib/db.ts`（Dexie v4：stores 同 v3 一模一樣，只係
> 版本號＋1；SavedFood 加可選 sugarG／fiberG／sodiumMg／
> componentsJson，舊行唔使 migration）同 `src/lib/backup.ts`（備份 v4，
> 包埋新欄位；匯入舊版 v2／v3 備份唔報錯唔清資料），以及
> `src/pages/MealPlannerPage.tsx`（存入收藏存齊 7 項＋componentsJson）、
> `src/pages/ResultPage.tsx`（「收藏呢餐」補齊 7 項＋componentsJson，
> Audit M4）、`src/pages/AddSheet.tsx`（由收藏記餐完整還原，舊收藏
> fallback 糖／纖維／鈉 0＋單項食材清單）。`prompts.ts`／`vision.ts`／
> `foodDb.ts`／`health.ts` 今次無郁，之後 `src/lib/` 恢復禁區。

## 動效（Motion Polish，2026-11-22）

- 套件：`motion`（`motion/react`）。共用規範唯一真相來源係
  `src/motion/presets.ts`（spring／時長／曲線）＋`DESIGN.md` §12；新功能
  沿用同一套，唔准自創時長／曲線。
- 鐵律：只准驅動 `transform`／`opacity`／SVG `stroke-dashoffset`；絕不動畫化
  `backdrop-filter`、`width`、`height`、`box-shadow`。轉場 180–350ms
  （圓環 400ms 例外）。
- `layoutId` 全站唯一：摺埋底部導航同展開右欄係兩個同時 mount 緊嘅 nav，
  膠囊 id 一定要分開（`nav-pill-bottom`／`nav-pill-rail`）。
- 新嘅底部彈窗／對話框一律用 `GlassModal`（AnimatePresence 內置喺入面）；
  新嘅可撳元素加 `.pressable`（`src/index.css`）。
- 驗收同上面一樣：build 零錯誤＋真實渲染＋`git diff --stat` 確認
  `src/lib/` 同 `src/config/prompts.ts` 無郁。
