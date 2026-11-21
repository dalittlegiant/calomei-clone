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
