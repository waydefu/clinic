/**
 * 診所官網的 UI 掃描取樣。
 *
 * `/clinic` 底下有八條路由，全部共用 `clinic.html` 這一個 shell 與
 * `clinic-site.css` 這一份樣式表，所以「每條路由都跑一次每種掃描」得到的是
 * 大量重複結果與很慢的 CI。介面規則書 §5.5 對視覺證據講的是同一件事：
 * 代表性矩陣，不是 route × role × state × viewport 的笛卡兒積。
 *
 * 取樣按**版面型態**分四類——它們的組成不同，才有各自掃的價值：
 *
 *   1. 首頁：hero、服務卡片網格、FAQ disclosure、CTA；
 *   2. 醫師列表：卡片網格；
 *   3. 醫師個人：長文與清單；
 *   4. 鼻功能療程：長文、圖片、衛教聲明。
 *
 * **這份清單是單一來源。** 先前 `affordance.spec.ts` 自帶一份，其他 spec 想涵蓋
 * 官網就得再抄一份——那正是這個 repo 剛修掉的那類 drift（`/clinic` 的字級偏離
 * 之所以能存在四個月，就是因為每道 gate 各自宣告涵蓋範圍，沒有人發現有幾道
 * 根本沒宣告到它）。要加路由請改這裡，不要在 spec 裡另開陣列。
 *
 * 實際路由的權威來源是 `clinic-content.js` 的 `CLINIC_ROUTES`；
 * `check:pages` 會 import 那個 export 與 `public-pages.json` 雙向比對，所以
 * 這裡的字串不會與產品悄悄分岔。
 *
 * 注意它與 `PUBLIC_PAGE_SCAN_ROUTES` 是不同的東西：後者宣告「這支 spec 涵蓋
 * 哪些 public page」，`check:pages` 用 TypeScript AST 讀它，因此**必須**是各
 * spec 內的 literal array，不得 import 或 spread。
 */
export const CLINIC_UI_SCAN_ROUTES = [
  '/clinic',
  '/clinic/doctors',
  '/clinic/doctors/yan-cheng-an',
  '/clinic/nasal/snoring-five-in-one'
] as const;
