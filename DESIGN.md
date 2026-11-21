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
4. **案底卡「Roast 喺頂、食物相＋大數字喺底」**：廣東話 Roast 評語喺卡片
   上半部做主角；下半部左邊食物相片縮圖＋餐類時間＋營養摘要，右邊放大大隻
   `🔥 555 kcal`。
5. **香港味文案**：按鈕用返「又食嘢？加啦」「做咗運動？」同「945 仲剩」。

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
- **展開（寬屏，≥ 768px）**：雙欄 Bento——左欄熱量圓環主卡＋2-slide 營養卡＋
  兩個大掣；右欄案底列表。右側懸浮液態玻璃垂直導航欄（同款材質，Lucide
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

### 9.4 iPhone 適配

`index.html`：`viewport-fit=cover`＋`black-translucent`＋`theme-color #0A0A0C`。
底欄 `bottom: max(12px, env(safe-area-inset-bottom))`；內容底部 `pb-28`；
`.pb-safe`／`.pt-safe` 用 `env(safe-area-inset-*)`。純 CSS 實現玻璃——
**永遠唔用 SVG `feDisplacementMap`**。
