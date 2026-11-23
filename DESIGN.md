# CaLoMei — DESIGN.md（視覺規範，鎖定版 v2）

> 方向：**暖黑液態玻璃風（Warm Obsidian Liquid Glass）**。
> 2026-11-21 由 Kong 定案：**深藍 Liquid Glass 版（v1）已放棄**——太冷淡似天氣
> App，拎走咗卡路里圓環、Roast 擺錯位、按鈕唔夠醒目、導航無咗 Icon。
> v2 = 保留原本嗰版嘅排版結構、暖色配色同廣東話文案，只將材質同導航升級做
> iOS Liquid Glass。呢份文件係唯一視覺權威；改 UI 之前先對住佢。

## 1. 靈魂：嚴格保留原本嗰版嘅 5 大優點

1. **暖炭黑＋琥珀橙＋湖水綠**：暖調深炭黑底色；琥珀橙 `#FF9F0A` 係核心
   強調色；湖水綠 `#14B8A6` 係運動強調色。唔准用深海洋藍。
2. **開放式 Header**：唔用一個大藥丸框死成個頂欄。左邊 `CaLoMei 卡老味`
   （配細緻 icon），右邊兩個**獨立**磨砂玻璃小膠囊（`🔥 1` 同 `☺️ 老味 ⌄`）。
3. **火焰卡路里進度圓環**：主卡左邊維持「活動量・輕度運動／945 仲剩／
   555 / 1500 kcal／BMR・TDEE」，右邊保留**發光琥珀橙圓環配火焰 icon**；
   唔准換成幼橫條。下方嚴格保留原本嘅 **2-slide 左右滑動營養卡**
   （第 1 頁蛋白質／碳水／脂肪，第 2 頁糖／纖維／鈉）＋底部暖橙分頁圓點。
   **每個營養格都有細圓圈進度環**（64px，跟大卡路里圓環同一套 SVG 做法，
   數值喺圓圈中間；糖／鈉超咗上限變紅）。
4. **案底卡「Roast 喺頂、食物相＋大數字喺底」**：廣東話 Roast 評語喺卡片
   上半部做主角；下半部左邊食物相片縮圖＋餐類時間＋營養摘要，右邊放大大隻
   `🔥 555 kcal`。
5. **香港味文案**：按鈕用返「又食嘢？加啦」「做咗運動？」同「945 仲剩」。
6. **日期列揀邊日，主頁全部數字就跟邊日**（2026-11-22 修復：之前 scorecard、
   2-slide 營養格、飲水、運動寫死咗計今日，得案底跟住揀日走——而家全部跟
   `selectedDay` 嗰個 log-day 重算；未完成／失敗嘅 scan 唔計入當日總數；
   飲水 +1 樽會記入睇緊嗰日）。
7. **案底 Feed 預設只載最近 30 日**（2026-11-22 M9：主頁＋記錄頁 Dexie 查詢
   用 log-day 窗口，`loading="lazy"` 相片，底部「載入更多（仲有 N 餐）」每次
   延展 30 日——幾百餐相片一次過入 DOM／memory 會拖慢 iOS）。

## 2. 背景：大氣微光暖黑

- 整頁背景固定用深暖炭黑漸變：`linear-gradient(180deg, #0A0A0C 0%, #141210 100%)`
  （fixed 背景層實現，唔用 `background-attachment: fixed`）。
- 加 1–2 處極柔和、低飽和嘅環境光暈，等玻璃元件睇得出通透感而唔變死黑：
  右上極淡琥珀光 `rgba(255,159,10,0.10)`、左下極淡深青光 `rgba(20,184,166,0.08)`。
- 禁止：死黑 `#000` 純色大面積、白底、粗黑框、實心硬陰影、斜角貼紙。

## 3. 玻璃材質（Liquid Glass，純 CSS）

| 用途 | 樣式 |
| --- | --- |
| 主卡片 `.glass-card` | `background: rgba(255,255,255,0.06)` ＋ `backdrop-blur-xl` ＋ `rounded-3xl` ＋ `1px solid rgba(255,255,255,0.10)` ＋ `inset 0 1px 0 rgba(255,255,255,0.14)` 頂部玻璃反光 |
| 卡片內分組 `.glass-inset` | `background: rgba(0,0,0,0.25)` ＋ `rounded-2xl`（深一級內凹，靠層次分區） |
| Roast 區 `.glass-roast` | `background: rgba(245,158,11,0.16)`（半透明琥珀著色玻璃）＋底部 `1px solid rgba(245,158,11,0.20)` 微光分隔線；唔准做死實啡色 |
| 導航 `.glass-nav` | `backdrop-filter: blur(24px) saturate(180%)`（連 `-webkit-` 前綴）＋ `1px solid rgba(255,255,255,0.15)` ＋ `inset 0 1px 0 rgba(255,255,255,0.20)` ＋ `transform: translateZ(0)` |

- **嚴禁 SVG `feDisplacementMap` 濾鏡**（iOS Safari 唔支援，會失效）。
- 深度靠透明度層次（卡 → 內凹條 → 背景），唔靠陰影。

## 4. 著色玻璃按鈕（Tinted Glass CTA）

保留原本鮮明顏色，加微透明漸變＋頂部白色玻璃高光＋柔和同色系外發光：

- **琥珀**（選中日期、又食嘢？加啦、＋掣）：`linear-gradient(180deg, rgba(255,179,64,0.94), rgba(255,159,10,0.90))` ＋ `inset 0 1px 0 rgba(255,255,255,0.35)` ＋ `0 8px 24px rgba(255,159,10,0.35)`。
- **湖水綠**（做咗運動？、＋1 樽）：`linear-gradient(180deg, rgba(45,212,191,0.94), rgba(20,184,166,0.90))` ＋同款高光＋ `0 8px 24px rgba(20,184,166,0.30)`。
- 按鈕文字純白粗體；唔准用 Emoji 做按鈕 icon（用 Lucide 線條 SVG）。

## 5. 配色與排版

| 角色 | 值 |
| --- | --- |
| 主字 | 純白 `#FFFFFF` |
| 次要標籤 | `white/60` |
| 輔助細字 | `white/40` |
| 核心強調 | 琥珀橙 `#FF9F0A`（選中、主動作、圓環、分頁點、Streak） |
| 運動／水 | 湖水綠 `#14B8A6` |
| 數字 | 全部 `tabular-nums`；數值組合加 `whitespace-nowrap`，窄屏唔准斷行爆格 |

字體：系統字；唔引入 display 字體。Emoji 只保留三處：Streak `🔥`、語氣
本身嘅 emoji、案底卡右邊大數字嘅 `🔥`。其餘 icon 全部用 Lucide 單色線條 SVG。

## 6. 導航（必須有精緻 Icon）

- **摺埋（窄屏，< 768px）**：底部懸浮圓角藥丸 Tab Bar（`.glass-nav` 材質，
  `backdrop-blur-2xl saturate-180`）；4 個分頁（主頁／記錄／進度／設定）全部
  配 Lucide 單色線條 SVG Icon＋文字（唔准 Emoji，唔准淨文字）；選中分頁用
  半透明亮玻璃膠囊（`bg-white/15 rounded-full`）包住，Icon 同文字亮起琥珀橙。
  定位 `bottom: max(12px, env(safe-area-inset-bottom))`；主內容底部留 `pb-28`。
- **展開（寬屏，≥ 768px）**：**單欄，唔准雙欄 Bento**——日期 → 2-slide 板 →
  兩個大掣 → 案底，同摺埋一樣由上而下排，只係闊啲（`md:max-w-2xl`）。
  星期列（static，隨頁面碌走，唔再 sticky）同 scorecard 之間要有明顯空隙
  （容器 `pb-3` ＋ carousel `mt-4`），唔准痴埋。右側懸浮液態玻璃垂直導航欄（同款材質，Lucide
  Icon＋文字，底部獨立發光琥珀玻璃 ＋ 掣）；主內容右側留位避開佢。
- `index.html` 必須有 `viewport-fit=cover` 同
  `apple-mobile-web-app-status-bar-style="black-translucent"`；
  `theme-color` 用 `#0A0A0C`。

## 7. 安全限制（唔准郁）

- `src/lib/` 全部唔准改：Dexie schema、VisionClient、圖片壓縮、備份還原、
  Apple Health 捷徑匯出邏輯。重構只改 `src/index.css`、`index.html`、
  `src/App.tsx`、`src/pages/*.tsx` 嘅 className／JSX 結構；數據邏輯、查詢、
  寫入全部原封不動。
- 語氣切換只係經現有 `db.user_profiles.put()` 寫 `toneMode`。
- 單一深色身份；淺色主題退役（Settings 嘅主題切換喺套落全部頁面嗰陣一併移除）。

## 8. 分步驗收

1. 本文件 ＋ 玻璃框架 ＋ 主頁 → 摺埋／打開兩尺寸截圖，Kong 驗收。
2. Kong 確認滿意，**即刻**套落全部頁面——跟原本 App 大結構（主頁／記錄／
   進度／設定＋掃描／結果流程），唔重組頁面、唔改名。
3. 然後先 build＋deploy。

## 9. 設計系統（Design System，2026-11-21 全站套用）

為咗日後加新功能自動維持統一風格，玻璃樣式集中喺兩處，唔准逐頁自創：

### 9.1 CSS 變量（`src/index.css` 頂部 `:root`）

`--obsidian-bg-1: #0a0a0c`、`--obsidian-bg-2: #141210`、`--obsidian-amber: #ff9f0a`、
`--obsidian-teal: #14b8a6`、`--glass-bg: rgba(255,255,255,0.06)`、
`--glass-border: rgba(255,255,255,0.10)`、`--glass-highlight: rgba(255,255,255,0.14)`、
`--text-primary: #ffffff`、`--text-secondary: rgba(255,255,255,0.6)`、
`--text-tertiary: rgba(255,255,255,0.4)`、環境光暈 `--glow-amber`／`--glow-teal`。
所有玻璃 class 一律用呢啲變量，唔准 hardcode 另一套色值。

### 9.2 共用 class（`src/index.css`）

| class | 用途 |
| --- | --- |
| `.glass-card` | 主卡片（見 §3） |
| `.glass-subcard` | 細一級巢狀卡（營養格、身體格、列表行、次要按鈕底） |
| `.glass-pill` | 膠囊（星期列容器、Header 膠囊、篩選 chip） |
| `.glass-inset` | 卡片內深色內凹分組條 |
| `.glass-roast` | 案底卡上半部琥珀著色 Roast 區 |
| `.glass-nav` | 懸浮導航／藥丸 Tab Bar／Toast |
| `.glass-sheet` | 底部彈出 sheet 面板（AddSheet） |
| `.glass-cta-amber` | 琥珀著色玻璃主按鈕（見 §4） |
| `.glass-cta-teal` | 湖水綠著色玻璃按鈕（運動／水） |
| `.glass-input` | 玻璃輸入框／下拉／文字框（16px，iOS 唔會聚焦放大） |
| `.page-dot`／`.page-dot-on`／`.page-dot-off` | 暖橙分頁圓點 |

### 9.3 共用元件（`src/components/ui/Glass.tsx`）

`GlassCard`（`.glass-card`）、`GlassSubcard`（`.glass-subcard`）、
`GlassButton`（`variant="amber" | "teal" | "glass"`）、`GlassModal`
（`variant="sheet" | "dialog"`，backdrop 撳落去關閉）。新頁面／新彈窗
優先用呢啲元件，唔准另起一套卡片／按鈕／彈窗樣式。
營養格嘅細圓圈進度環係 `src/pages/HomePage.tsx` 入面嘅 `MiniRing`
（跟大卡路里火焰圓環同一套 SVG 做法）。

### 9.4 iPhone 適配

`index.html`：`viewport-fit=cover`＋`black-translucent`＋`theme-color #0A0A0C`。
底欄 `bottom: max(12px, env(safe-area-inset-bottom))`；內容底部 `pb-28`；
`.pb-safe`／`.pt-safe` 用 `env(safe-area-inset-*)`。純 CSS 實現玻璃——
**永遠唔用 SVG `feDisplacementMap`**。

## 10. 熱量赤字（計算規則＋詳細頁，2026-11-21 定案）

計算邏輯（`src/pages/deficit.ts`，純函數）：
- **只計「有食物記錄嘅日子」**：區間內某日完全無已完成嘅 food_entries，
  嗰日完全跳過，唔可以當食咗 0 kcal（舊版 bug：無記數嘅日子當食 0，
  赤字虛高）。
- 單日淨熱量 = 當日食物總卡路里 − (TDEE + 當日運動消耗)；負數 = 赤字
  （慳咗），正數 = 盈餘（食凸咗）。TDEE 用而家個人檔案計出嚟嗰個
  （Mifflin-St Jeor × 活動量），唔係每日目標卡路里。
- 累計 = 區間內所有有記食物嘅日子嘅單日淨熱量總和；日均 = 累計 ÷ 實際
  有記食物嘅日數（0 日有記就顯示「未有記錄」）；相當體脂 (kg) = 累計
  ÷ 7700（保留 1 位小數）。
- 廣東話評語按區間自動換句（見 `deficitComment`）：細赤字「連半碗叉燒飯
  都未夠，咁都叫忍？」；中赤字講幾多碗叉燒飯；大赤字（≥ 半公斤，即
  3850 kcal）講幾多公斤肥肉；超標就串佢食凸咗幾多。
- 顏色：赤字湖水綠 `#14B8A6`，盈餘琥珀橙 `#FF9F0A`，大幅超標（單日淨
  ≥ +1000）紅 `#F87171`。

進度頁赤字卡：成張卡可撳入詳細頁；標題左邊「🔥 熱量赤字」，右邊
「近 14 日 ›」；數據區顯示累計＋日均；右側迷你直條預覽（近 14 日，
只喺有記食物嘅日子畫柱）。

詳細頁（`src/pages/DeficitDetailPage.tsx`）：頂部 3 欄玻璃摘要（累計／
日均／相當體脂，極幼分隔線）；圖表卡有每日／累計＋14 日／30 日磨砂膠囊
切換；圖表只喺有記食物嘅日子畫柱／點，撳柱／點睇嗰日數字（食 X · 燒 Y ·
淨 Z）；底部日期區間翻頁條 `< 11月7日 – 11月20日 >`（最新一期去到今日，
> disable）；每日明細只列有記數嘅日子，由新到舊（✓ 日期／食 X · 燒 Y／
右側當日淨熱量）。

## 11. 結果頁重構（2026-11-22 定案）

主頁（`src/pages/ResultPage.tsx`，由上至下）：
- 頂部大面積圓角食物相，左上懸浮磨砂圓形 × 返回掣（無相就用「← 返回記錄」
  文字掣）。
- 相片下方：左邊餐類＋時間膠囊（「晚餐 · 8:32 PM」），右邊 3 個玻璃圖示掣
  （收藏 ★／同步 Apple Health ♥＋「Health」短字樣＋tooltip／刪除 🗑，
  兩下確認）。
- 餐名（撳標題改名）＋右邊「N 份 ✎」玻璃藥丸（0.5 / 1 / 1.5 / 2 或自訂，
  成餐按比例縮放）。
- 置中大字玻璃卡「🔥 XXX kcal」＋下方 2 行 × 3 欄內凹玻璃格（蛋白質／
  碳水／脂肪／糖／纖維／鈉）；撳總卡路里或任何一個營養數字彈出輸入框改
  總量，未剔除食材按比例跟住郁；細灰提示「撳任何一個數字直接改總量，
  食材會按比例跟住郁」。
- 「食材」列表：每樣食材只係乾淨單行玻璃條（左：名 · XXX kcal，右：
  XXg >，無克數就顯示簡短份量 + >）；剔除咗嘅半透明＋刪除線。**嚴禁
  再將每樣食材展開成大表單**——撳一行開「單一食材編輯窗」。
- Roast 卡（暖琥珀磨砂玻璃，`.glass-roast`）：評語＋之前嘅評語摺疊，
  右下角一粒精緻玻璃「駁佢」小按鈕，撳先展開輸入框（唔再放一大張固定
  表單卡）。
- 底部 Sticky Bottom Bar：`sticky bottom-[max(88px,calc(env(safe-area-inset-bottom)+76px))] md:bottom-6`，
  玻璃藥丸容器入面左右並排兩粒大掣——左邊暗色琥珀邊框玻璃「✨ AI 修正」，
  右邊暖琥珀液態玻璃主掣「搞掂」（儲存變更並返回）。ResultPage 開緊時
  App 嘅 FAB 收起，唔好撞埋一齊。

三個彈窗（全部用 `GlassModal`）：
- 單一食材編輯窗（`src/pages/IngredientSheet.tsx`，sheet）：頂欄左「‹ 返回」、
  右琥珀色「搞掂」；名稱輸入框＋右邊紅色玻璃剔除／恢復 icon 掣；份量區
  （數字＋單位，旁邊「份數／克」切換膠囊，選中琥珀色；下方灰字
  「≈ XX 克 · 改份量會自動調整營養數值」；改份量即時按比例重計卡路里＋
  6 項營養）；營養資料區（大條 🔥 XXX kcal 卡＋2×3 格，撳任何一格可手動
  微調數字）；底部兩下確認刪除。
- ＋加多樣（`src/pages/AddIngredientModal.tsx`，sheet）：「搜尋食物庫」
  （TFDA＋中國食物庫，＋100克加入）／「手動自訂」切換；揀完直接加入
  食材列表並重計總數。
- ✨ AI 修正（dialog）：輸入正確食物名（逗號分隔），用同一張相重新分析。

縮放模型（`src/pages/resultUtils.ts`，純函數）：
- base（1 份時嘅值）× multiplier = 顯示值；所有縮放都由 base 重新計，
  唔會逐次累積誤差。改總量：factor = 新總數／舊總數，未剔除食材 × factor，
  base 同 multiplier 同步郁。食材窗改完：顯示值除返 multiplier 寫入 base。
- 克數由 `portionDescription` 解析（`parseGrams`：約150克／100g）；解析唔到
  就當無克數——舊記錄照樣用得，唔改 Dexie schema、唔郁 `src/lib/`。

## 12. 動效規範（Motion Spec，2026-11-22 定案）

原則（impeccable animate／polish：動效要克制、有目的，唔係裝飾）：
- 動畫只係為咗講清楚「嘢由邊度嚟、去邊度、數值點變」——轉場、膠囊滑動、
  數字滾動、按壓回饋。唔做純裝飾性動畫，唔做長動畫。
- 只准驅動 GPU 屬性：`transform`、`opacity`、SVG `stroke-dashoffset`。
  **絕不動畫化 `backdrop-filter`、`width`、`height`、`box-shadow`**（iOS
  Safari 會窒機）。頁點「變闊」用 `layoutId` 滑動代替 width 動畫。
- 時長俐落：180–350ms 為主（圓環 400ms 例外）；ease-out（expo）為預設
  曲線；無 bounce、無 elastic。Sheet 例外：iOS spring 物理。
- 減少動態唔係可選：`<MotionConfig reducedMotion="user">` 包住根元件
  （`App.tsx`），系統開咗「減少動態」就自動變即時／淡入。

套件與共用模組（唯一真相來源，唔准逐頁自創時長／曲線）：
- `motion`（`motion/react`：`MotionConfig`、`AnimatePresence`、`layoutId`、
  spring）。`src/motion/presets.ts`：`springSheet`（stiffness 380／damping 34，
  底部 Sheet）、`springPill`（stiffness 500／damping 40，滑動膠囊）、
  `easeOutExpo`、`DUR`（quick 0.2／slide 0.25／number 0.25／ring 0.4／fill 0.35）。
- `src/motion/AnimatedNumber.tsx`：數字滾動（animate 250ms ease-out；
  `fmtInt` 整數、`fmt1dp` 一位小數）。

七大動效（邊度做、點做）：
- 日期膠囊：主頁 7 日列選中膠囊用 `layoutId="day-pill"` 平滑滑動。
- 圓環＋數字：火焰圓環＋6 個 MiniRing 用 `motion.circle` 嘅
  `strokeDashoffset` 過渡 400ms（`initial={false}`，首載唔做假掃入）；
  仲剩 kcal＋MiniRing 中間數字用 `AnimatedNumber` 滾 250ms。
- 案底列表：主頁 Feed 用 `key={viewKey}` 嘅 motion.div，切日子淡入＋微移
  （y: 8 → 0，opacity: 0 → 1，250ms）。
- 彈窗／Sheet：`GlassModal` 內置 `AnimatePresence`——暗幕淡入淡出 200ms；
  sheet 由底部用 iOS spring 滑上／滑落；dialog 由 scale 0.96＋y 8 淡入。
  呼叫端唔使包 `AnimatePresence`，照舊傳 `open` 就得。
- 頁面進出：`App.tsx` 主內容用 `AnimatePresence mode="popLayout"`＋
  `key={viewKey}`；Result／Scan／赤字詳細頁 slide＋fade（x: 32 → 0 →
  -32，250ms），主頁／記錄／進度／設定切頁只淡入淡出。
- 按壓回縮：共用 `.pressable`（`src/index.css`，transform 150ms，
  `:active` scale 0.97）——所有玻璃卡片、案底列表項、主按鈕、FAB、導航掣。
- 導航膠囊：摺埋底部藥丸 `layoutId="nav-pill-bottom"`、展開右欄
  `layoutId="nav-pill-rail"`——**兩個 nav 同時 mount 緊（一個用 CSS 隱藏），
  layoutId 一定要分開**，否則會搶同一個 pill。
- 赤字切換膠囊：每日／累計 `layoutId="deficit-mode-pill"`、
  14日／30日 `layoutId="deficit-range-pill"`。
- 飲水填滿：水樽格內填色用 `scaleY` 0 → 1（transform-origin: bottom，
  350ms）；達標時樽列背後有極克制嘅湖水綠微光（只驅動 opacity）。
- 2-Slide 頁點：琥珀色頁點用 `layoutId="carousel-dot"` 喺兩點之間滑動。
- 掃描光束：`ScanPage` 分析緊嗰陣，相片上有一層琥珀色光帶上下流動
  （`y: -100% → 220%`，mirror 來回，1.6s；純 transform＋opacity）。

日後加新功能：沿用 `presets.ts` 嘅 spring／時長／曲線；新嘅滑動膠囊要
開新嘅 `layoutId`（全站唯一）；新嘅底部彈窗／對話框一律用 `GlassModal`，
唔好自寫進出場；新嘅可撳元素加 `.pressable`。
