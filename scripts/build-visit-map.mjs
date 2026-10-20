import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

// 診所官網「門診時間與交通」區塊的底圖產生器。
//
// 為什麼自己畫 SVG，而不是嵌 Google Maps 或貼地圖截圖：官網的 CSP 是
// `img-src 'self'; font-src 'self'`，第三方地圖 iframe／圖磚都會被擋；截圖則是
// 一張 200 KB 以上的點陣圖，放大會糊，字也無法跟著網站字型走。向量圖只有幾十 KB，
// 而且只畫道路、捷運站與公園，沒有商家、沒有其他診所，不會讓訪客以為診所在推薦
// 別家店。
//
// 這支腳本**不連網**。OpenStreetMap 資料是另外手動抓好、存成 JSON 再餵進來，
// 理由是：地圖不需要天天更新，建置機器不該為了一張底圖多一個對外連線與失敗點，
// 而且存下來的 JSON 讓同一份輸入永遠產生同一張 SVG（輸出沒有時間戳，可重現）。
//
// ── 手動更新資料的步驟 ──────────────────────────────────────────────────
// 1. 地址轉座標（Nominatim，每秒最多 1 次請求，User-Agent 要寫清楚用途）：
//      https://nominatim.openstreetmap.org/search?format=jsonv2&q=112 Guangfu North Road, Songshan District, Taipei
//    2026-10-12 的結果是 node 5773643475（光復北路 112 號 1 樓的一個店面點，
//    addr:full＝臺北市松山區光復北路112號1樓）：25.0508540, 121.5576600。
//    門牌號碼「112」完全吻合；診所在同一棟的 2 樓，OSM 沒有樓層座標，所以圖釘
//    落在這棟樓的門牌點上，誤差是一棟建築的大小。用中文地址查 Nominatim 會查無
//    結果，這是為什麼上面用英文路名。
// 2. 抓周邊資料（Overpass，只打這一次，結果存成 output/map-data/osm.json）：
//      POST https://overpass-api.de/api/interpreter  （表單欄位 data＝下面這段）
//
//      [out:json][timeout:90];
//      (
//        way["highway"~"^(trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street)$"](25.04381,121.53982,25.05790,121.56658);
//        nwr["railway"="station"](25.04381,121.53982,25.05790,121.56658);
//        nwr["leisure"~"^(park|garden)$"](25.04381,121.53982,25.05790,121.56658);
//        nwr["landuse"="recreation_ground"](25.04381,121.53982,25.05790,121.56658);
//        nwr["natural"="water"](25.04381,121.53982,25.05790,121.56658);
//        node(5773643475);
//      );
//      out geom;
//
//    查詢框是 wide 版 SCALE 決定的畫布範圍（圖釘往西 1.8 km、往東 0.9 km、南北各
//    0.78 km）再放寬一點，這樣 1600×900 的畫面邊緣不會出現空白。compact 版的畫布
//    只有 ±750 m × ±562 m，整個落在這個查詢框裡，不必另外重抓。標示的車站只取
//    直線距離 700 m 以內的（STATION_RADIUS_M），查詢框比 700 m 大不代表標示範圍
//    也跟著放大。
// 3. 執行：`node scripts/build-visit-map.mjs [osm.json 路徑]`，預設讀
//    `output/map-data/osm.json`，一次解析、寫出兩張圖到 `apps/web/public/clinic-assets/`：
//    `visit-map.svg`（wide，1600×900，桌機／平板）與 `visit-map-compact.svg`
//    （compact，600×450，手機，頁面用 <picture> 在 ≤48rem 換圖）。
//
// ── 授權 ────────────────────────────────────────────────────────────────
// 資料是 OpenStreetMap 貢獻者的成果，以 ODbL 授權。**兩張 SVG 都不內嵌著作權文字**：
// 放這些圖的頁面在每一種版面都用 HTML 文字顯示「地圖資料 © OpenStreetMap 貢獻者」，
// 並連到 https://www.openstreetmap.org/copyright，頁面上的這行 HTML 就是姓名標示。
// 圖裡原本也內嵌了一句，但手機版會被裁掉、桌機版又和頁面上那行重複，所以拿掉了；
// 頁面少了那行 HTML 就是不合規，不能再指望圖裡有。
//
// ── 圖面設計 ────────────────────────────────────────────────────────────
// 只用淺色（見下面的 COLOR），因為上面要疊資訊卡與文字，底圖不能搶；標籤字級是照
// 設計稿定的（wide：路名 22、站名 24、診所 26），不要為了塞更多字而縮小。compact 版
// 在手機上會被縮成約 0.6 倍（600 px 畫布顯示成約 358 px），字級放大到路名 26、站名
// 28、診所 30，縮完後才仍有 15 px 上下的實際大小。
//
// 站名與路名優先取 OSM 的 name:zh-Hant（網站用「臺」不用「台」，例如臺北小巨蛋），
// 沒有才退回 name:zh、name。
//
// 輸入資料一律當不可信的：只用 JSON.parse、座標必須是落在臺北附近的有限數字、
// 要畫進 SVG 的文字只接受漢字／英數／少數標點，而且全部再做 XML escape。這樣就算
// 上游資料被污染，最糟也只是少一個標籤，不會變成 SVG 裡的標記或腳本。

// 圖釘的地理座標，兩種輸出共用；圖釘落在畫面的哪裡則寫在各自的設定（VARIANTS）。
const PIN = { lat: 25.050854, lon: 121.55766 };

// 標示車站的直線距離上限（公尺）。
const STATION_RADIUS_M = 700;

const COLOR = {
  land: '#eef2ec',
  park: '#dfe9df',
  water: '#d6e6ea',
  road: '#ffffff',
  casing: '#d5ded6',
  text: '#56655a',
  brand: '#184f40'
};

const FONT_FAMILY =
  "'PingFang TC','Microsoft JhengHei','Noto Sans TC',sans-serif";

// 畫面外多留一圈再裁，路的圓頭才不會停在邊線上露出來。
const CLIP_MARGIN = 24;

// ── 兩種輸出各一份設定 ───────────────────────────────────────────────
//
// 兩種輸出共用同一次資料解析與同一套配置演算法，只有下面這些數字不同。
//   - wide：1600×900，桌機／平板用。
//   - compact：600×450（4:3），手機用。頁面在 ≤48rem 直接顯示這張，不裁切、
//     上面不疊任何東西，所以沒有資訊卡避讓區。
//
// 欄位：
//   pin          圖釘在畫面上的位置
//   scale        每公尺幾個畫面像素
//   font         路名／站名／診所標籤的字級
//   glyphScale   圖釘圖示與車站圓點的放大倍率（標籤字級變大時，圖示也要跟著大）
//   keepout      圖釘周圍不放路名／站名的空白（距圖釘中心的上下左右距離，畫面像素）
//   stationRise  站名放在圓點上方時，標籤中心到圓點中心的距離（畫面像素）
//   pinLabel     診所標籤的左右內距與高度
//   safeMargin   標籤離畫布邊緣至少多遠
//   haloWidth    文字底色描邊寬度
//   maxRoadLabels / minRoadLabels  路名標籤數量的上限，和配不到這麼多時直接報錯的下限
//   minVisiblePx 路名候選在畫面內（扣掉資訊卡）至少要有多少像素長的路
//   minAreaPx2   面積小於此值（畫面像素平方）的公園／水面不畫。太小的口袋公園在這個
//                縮尺下只是一個點，卻要付一整條路徑的位元組。wide 的 700 px² 約
//                1700 m²；compact 的縮尺小（0.4 對 0.64），同樣的實地面積只佔
//                270 px² 左右，所以門檻跟著降
//   cardCoverX   桌機版資訊卡蓋住的左側寬度；null 代表沒有東西蓋在圖上
//   phoneCrop    舊的「手機把圖裁成以圖釘為中心的視窗」規則；null 代表不裁
export const VARIANTS = {
  wide: {
    name: 'wide',
    file: 'visit-map.svg',
    width: 1600,
    height: 900,
    // 圖釘落點。畫面 68% 處（x=1080）而不是置中，因為桌機版左邊 40% 要蓋資訊卡。
    pin: { x: 1080, y: 450 },
    // 0.64 的取捨：南北各 703 m 剛好涵蓋 700 m 的範圍，而且兩個 700 m 內的捷運站
    // （東邊 674 m、西邊 628 m）都落在畫面裡——東邊那站距離圖釘 674×0.64≈431 px，
    // 加上標籤後還離右緣有空間。再放大東邊的站就會被切掉。
    // scale 和 Overpass 查詢框是綁在一起的：低於 0.6 左右，畫面的西緣與南北緣就會超出
    // 查詢框而出現空白，要縮小地圖必須先放大查詢框、重抓資料。
    scale: 0.64,
    font: { road: 22, station: 24, pin: 26 },
    glyphScale: 1,
    keepout: { left: 72, top: 62, right: 46, bottom: 18 },
    stationRise: 34,
    pinLabel: { padX: 28, height: 44 },
    safeMargin: 24,
    haloWidth: 5,
    maxRoadLabels: 6,
    minRoadLabels: 4,
    minVisiblePx: 150,
    minAreaPx2: 700,
    // 路名標籤盡量避開資訊卡蓋住的這一帶，被卡片蓋住的標籤等於白畫。
    cardCoverX: 660,
    // 手機已改載 compact 版，這條規則對 wide 不再有實際用途；保留它只是讓 wide 的
    // 輸出和已審過的版本逐位元組相同（除了拿掉的著作權文字與「臺」字）。
    phoneCrop: { width: 600, height: 450 }
  },
  compact: {
    name: 'compact',
    file: 'visit-map-compact.svg',
    width: 600,
    height: 450,
    // 圖釘置中，因為這張圖上不疊任何東西。
    pin: { x: 300, y: 225 },
    // 0.4 的取捨：兩個 700 m 內的車站（水平距離東邊 669 m、西邊 621 m）連圓點帶標籤
    // 都要完整落在 600×450 裡。0.4 時東邊圓點離右緣約 17 px、兩個站名標籤各離邊緣
    // 20 px 以上；0.42 時東邊圓點只剩約 4 px，看起來像被切到；0.38 時臺北小巨蛋站的
    // 標籤找不到不壓到圖釘避讓區的位置（產生器會直接報錯）。畫布涵蓋 ±750 m × ±562 m，
    // 都在 Overpass 查詢框內，不必重抓資料。
    scale: 0.4,
    // 字級放大到路名 26、站名 28、診所 30：手機上這張圖只顯示成約 358 px 寬（0.6 倍），
    // 縮完是 15.5／16.7／17.9 px，低於 14 px 的字在手機上就吃力了。圖釘與圓點跟著放大
    // 1.3 倍（縮完圖釘約 21×32 px），不然字大圖小，圖釘會被標籤比下去。
    font: { road: 26, station: 28, pin: 30 },
    glyphScale: 1.3,
    // 避讓區的左側比 wide 窄（56 對 72）：不然最近的大馬路南京東路四段，它 156 px 寬的
    // 路名塞不進臺北小巨蛋站的圓點與圖釘之間，圖上最大的那條路反而沒有名字。
    keepout: { left: 56, top: 62, right: 46, bottom: 18 },
    // 站名拉高到離圓點 46 px（wide 是 34）：臺北小巨蛋站的標籤有 241 px 寬，在左緣
    // 被夾住後會伸到圖釘上方，貼著圓點放就壓進避讓區。
    stationRise: 46,
    pinLabel: { padX: 32, height: 50 },
    safeMargin: 16,
    haloWidth: 6,
    maxRoadLabels: 4,
    minRoadLabels: 3,
    minVisiblePx: 150,
    minAreaPx2: 270,
    cardCoverX: null,
    phoneCrop: null
  }
};

// 路網分三級。次要道路（住宅區巷弄）細而白；主要道路加外框；介於其間的三級道路
// 比照主要道路加外框但細一點，不然光復北路過了南京東路由二級變三級，會在路口突然
// 變成沒有外框的細線，看起來像路斷了。
//
// 高架快速道路（市民大道高架）與它的匝道不畫：平面投影下高架疊在同名的地面道路
// 正上方，畫出來是兩條重疊的粗線加一堆交織的匝道，既不是步行者的路，也會把
// 周邊搞得很亂。
const ROAD_STYLE = {
  major: { stroke: 14, casing: 18, weight: 3, minRun: 6 },
  mid: { stroke: 8, casing: 12, weight: 2, minRun: 6 },
  minor: { stroke: 6, casing: 0, weight: 1, minRun: 30 }
};

// Douglas-Peucker 容許誤差（畫面像素）。0.9 px 在 1600 寬的圖上肉眼看不出彎折，
// 卻能把住宅區曲線路段的頂點砍掉一大半——檔案大小 30 KB 的預算靠這個撐。
const SIMPLIFY_EPS = 0.9;

const EARTH_RADIUS_M = 6371008.8;
const M_PER_DEG_LAT = (EARTH_RADIUS_M * Math.PI) / 180;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((PIN.lat * Math.PI) / 180);

// ── 座標與投影 ───────────────────────────────────────────────────────

// 輸入資料不可信：座標必須是有限數字，而且落在臺北盆地附近。範圍故意放寬到
// 比查詢框大很多，只用來擋明顯的垃圾值，不是第二道查詢框。
function isLatLon(p) {
  return (
    p !== null &&
    typeof p === 'object' &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    p.lat > 24.9 &&
    p.lat < 25.2 &&
    p.lon > 121.4 &&
    p.lon < 121.7
  );
}

// 以圖釘為原點的公尺座標（x 向東、y 向南，和螢幕座標同向）。
function toMetres(p) {
  return [
    (p.lon - PIN.lon) * M_PER_DEG_LON,
    -(p.lat - PIN.lat) * M_PER_DEG_LAT
  ];
}

function toPixels(view, [mx, my]) {
  return [view.pin.x + mx * view.scale, view.pin.y + my * view.scale];
}

// 回報用的直線距離。用 haversine 而不是上面的平面近似，這樣報出去的數字不依賴
// 繪圖用的投影。
function haversineM(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function pointToSegment([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// 圖釘到一條折線的最近距離（公尺，在公尺座標裡量）。
function distanceToLineM(geometry) {
  const pts = geometry.map(toMetres);
  let best = Infinity;
  for (let i = 1; i < pts.length; i += 1) {
    best = Math.min(best, pointToSegment([0, 0], pts[i - 1], pts[i]));
  }
  return best;
}

// ── 文字（不可信輸入的出口） ─────────────────────────────────────────

// 標籤優先取 name:zh-Hant，其次 name:zh，最後才是 name——不自己翻譯、不補字。
// 先取 zh-Hant 是因為網站用「臺」不用「台」（OSM 的 name 常是「台北小巨蛋」，
// zh-Hant 才是「臺北小巨蛋」），圖上的站名要和頁面文字寫法一致。某個欄位是空的或
// 通不過下面的字元檢查時，換下一個欄位而不是整個標籤丟掉。
// 允許的字元很窄：漢字、英數、中點、連字號與全形括號。任何超出這個集合的名稱整個丟掉。
const SAFE_LABEL = /^[\p{Script=Han}\p{N}\p{L}·\-－（）() ]{1,24}$/u;

function labelName(tags) {
  if (tags === null || typeof tags !== 'object') return null;
  for (const key of ['name:zh-Hant', 'name:zh', 'name']) {
    const value = tags[key];
    if (typeof value === 'string' && SAFE_LABEL.test(value.trim())) {
      return value.trim();
    }
  }
  return null;
}

function escapeXml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// 文字寬度只用來避讓，不需要精確：全形字算 1 em，其他算 0.6 em。
function textWidth(text, size) {
  let width = 0;
  for (const ch of text) {
    width += /[⺀-鿿＀-￯]/u.test(ch) ? size : size * 0.6;
  }
  return width;
}

// ── 幾何工具 ─────────────────────────────────────────────────────────

function perpendicularDistance(p, a, b) {
  return pointToSegment(p, a, b);
}

// 迭代版 Douglas-Peucker（不遞迴，避免超長折線爆堆疊）。
function simplify(points, epsilon) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let worst = 0;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const d = perpendicularDistance(points[i], points[first], points[last]);
      if (d > worst) {
        worst = d;
        index = i;
      }
    }
    if (index !== -1 && worst > epsilon) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

// Liang-Barsky：把一段線裁進矩形，整段在外面就回 null。
function clipSegment(p, q, rect) {
  let t0 = 0;
  let t1 = 1;
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const edges = [
    [-dx, p[0] - rect.x0],
    [dx, rect.x1 - p[0]],
    [-dy, p[1] - rect.y0],
    [dy, rect.y1 - p[1]]
  ];
  for (const [num, den] of edges) {
    if (num === 0) {
      if (den < 0) return null;
    } else {
      const t = den / num;
      if (num < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  return [
    [p[0] + t0 * dx, p[1] + t0 * dy],
    [p[0] + t1 * dx, p[1] + t1 * dy]
  ];
}

// 折線裁進矩形；穿出又穿回來的路會被切成多段。
function clipPolyline(points, rect) {
  const runs = [];
  let current = null;
  for (let i = 1; i < points.length; i += 1) {
    const seg = clipSegment(points[i - 1], points[i], rect);
    if (seg === null) {
      current = null;
      continue;
    }
    const [a, b] = seg;
    const last = current?.at(-1);
    if (!last || last[0] !== a[0] || last[1] !== a[1]) {
      current = [a];
      runs.push(current);
    }
    current.push(b);
  }
  return runs;
}

// Sutherland-Hodgman：多邊形裁進矩形（矩形是凸的，這個演算法足夠）。
function clipPolygon(points, rect) {
  const sides = [
    { inside: (p) => p[0] >= rect.x0, cut: (a, b) => cutX(a, b, rect.x0) },
    { inside: (p) => p[0] <= rect.x1, cut: (a, b) => cutX(a, b, rect.x1) },
    { inside: (p) => p[1] >= rect.y0, cut: (a, b) => cutY(a, b, rect.y0) },
    { inside: (p) => p[1] <= rect.y1, cut: (a, b) => cutY(a, b, rect.y1) }
  ];
  let output = points;
  for (const side of sides) {
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i += 1) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      if (side.inside(cur)) {
        if (!side.inside(prev)) output.push(side.cut(prev, cur));
        output.push(cur);
      } else if (side.inside(prev)) {
        output.push(side.cut(prev, cur));
      }
    }
    if (output.length === 0) return [];
  }
  return output;
}

function cutX(a, b, x) {
  const t = (x - a[0]) / (b[0] - a[0]);
  return [x, a[1] + t * (b[1] - a[1])];
}

function cutY(a, b, y) {
  const t = (y - a[1]) / (b[1] - a[1]);
  return [a[0] + t * (b[0] - a[0]), y];
}

function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function polylineLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    length += Math.hypot(
      points[i][0] - points[i - 1][0],
      points[i][1] - points[i - 1][1]
    );
  }
  return length;
}

// 把端點相接的路段串成一條長折線。同一個樣式群組裡串起來只是少幾個 `M`，
// 不影響畫出來的線，所以接在路口（不只是度數為 2 的節點）也無妨。
function chainWays(items) {
  const ends = new Map();
  items.forEach((item, i) => {
    for (const id of [item.nodes[0], item.nodes.at(-1)]) {
      if (!ends.has(id)) ends.set(id, []);
      ends.get(id).push(i);
    }
  });
  const used = new Array(items.length).fill(false);
  const take = (id) => ends.get(id)?.find((i) => !used[i]);
  const chains = [];
  for (let i = 0; i < items.length; i += 1) {
    if (used[i]) continue;
    used[i] = true;
    let nodes = [...items[i].nodes];
    let points = [...items[i].points];
    for (;;) {
      const j = take(nodes.at(-1));
      if (j === undefined) break;
      used[j] = true;
      let { nodes: nn, points: pp } = items[j];
      if (nn[0] !== nodes.at(-1)) {
        nn = [...nn].reverse();
        pp = [...pp].reverse();
      }
      nodes = nodes.concat(nn.slice(1));
      points = points.concat(pp.slice(1));
    }
    for (;;) {
      const j = take(nodes[0]);
      if (j === undefined) break;
      used[j] = true;
      let { nodes: nn, points: pp } = items[j];
      if (nn.at(-1) !== nodes[0]) {
        nn = [...nn].reverse();
        pp = [...pp].reverse();
      }
      nodes = nn.slice(0, -1).concat(nodes);
      points = pp.slice(0, -1).concat(points);
    }
    chains.push(points);
  }
  return chains;
}

// ── 路徑編碼 ─────────────────────────────────────────────────────────

// 座標用「十分之一像素」的整數運算，再轉回字串：這樣相對座標不會累積浮點誤差，
// 也能保證小數只有一位。
function tenths(n) {
  if (n === 0) return '0';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 10);
  const frac = abs % 10;
  if (frac === 0) return `${sign}${whole}`;
  return `${sign}${whole === 0 ? '' : whole}.${frac}`;
}

// 數字之間只在必要時加空白（負號本身就是分隔）。
function joinNumbers(tokens) {
  let out = '';
  tokens.forEach((token, i) => {
    out += i === 0 || token.startsWith('-') ? token : ` ${token}`;
  });
  return out;
}

function roundRun(run) {
  const out = [];
  for (const [x, y] of run) {
    const tx = Math.round(x * 10);
    const ty = Math.round(y * 10);
    const last = out.at(-1);
    if (!last || last[0] !== tx || last[1] !== ty) out.push([tx, ty]);
  }
  return out;
}

// 一組折線 → 一條 path 的 d。每段起點選絕對 `M` 或相對 `m` 中比較短的。
function encodeLines(runs) {
  let d = '';
  let cursor = [0, 0];
  for (const run of runs) {
    const pts = roundRun(run);
    if (pts.length < 2) continue;
    const abs = `M${joinNumbers([tenths(pts[0][0]), tenths(pts[0][1])])}`;
    const rel = `m${joinNumbers([
      tenths(pts[0][0] - cursor[0]),
      tenths(pts[0][1] - cursor[1])
    ])}`;
    d += d === '' || abs.length <= rel.length ? abs : rel;
    const tokens = [];
    for (let i = 1; i < pts.length; i += 1) {
      tokens.push(
        tenths(pts[i][0] - pts[i - 1][0]),
        tenths(pts[i][1] - pts[i - 1][1])
      );
    }
    d += `l${joinNumbers(tokens)}`;
    cursor = pts.at(-1);
  }
  return d;
}

function encodePolygons(polygons) {
  let d = '';
  for (const polygon of polygons) {
    const pts = roundRun(polygon);
    if (pts.length < 3) continue;
    const tokens = [];
    for (let i = 1; i < pts.length; i += 1) {
      tokens.push(
        tenths(pts[i][0] - pts[i - 1][0]),
        tenths(pts[i][1] - pts[i - 1][1])
      );
    }
    d += `M${joinNumbers([tenths(pts[0][0]), tenths(pts[0][1])])}l${joinNumbers(tokens)}z`;
  }
  return d;
}

// ── 讀取 OSM 資料 ────────────────────────────────────────────────────

function readElements(path) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (
    data === null ||
    typeof data !== 'object' ||
    !Array.isArray(data.elements)
  ) {
    throw new Error(`${path} 不是 Overpass JSON（缺少 elements 陣列）`);
  }
  return data.elements.filter((el) => el !== null && typeof el === 'object');
}

function roadClass(tags) {
  if (tags === null || typeof tags !== 'object') return null;
  // 匝道（*_link）與高架不畫，原因見 ROAD_STYLE 的註解。
  switch (tags.highway) {
    case 'trunk':
      return tags.bridge === 'yes' || Number(tags.layer) > 0 ? null : 'major';
    case 'primary':
    case 'secondary':
      return Number(tags.layer) > 0 ? null : 'major';
    case 'tertiary':
      return Number(tags.layer) > 0 ? null : 'mid';
    case 'unclassified':
    case 'residential':
    case 'living_street':
      return Number(tags.layer) > 0 ? null : 'minor';
    default:
      return null;
  }
}

function collectRoads(elements, view) {
  const ways = [];
  for (const el of elements) {
    if (el.type !== 'way' || !Array.isArray(el.geometry)) continue;
    const cls = roadClass(el.tags);
    if (cls === null) continue;
    if (!Array.isArray(el.nodes) || el.nodes.length !== el.geometry.length) {
      continue;
    }
    if (!el.geometry.every(isLatLon)) continue;
    ways.push({
      cls,
      name: labelName(el.tags),
      nodes: el.nodes,
      geometry: el.geometry,
      points: el.geometry.map((p) => toPixels(view, toMetres(p)))
    });
  }
  return ways;
}

function ringKey(p) {
  return `${p.lat},${p.lon}`;
}

// 多邊形關係的外環常被拆成好幾條 way，依端點座標接回一圈。接不回來的就放棄，
// 寧可少畫一塊公園，也不要畫出奇怪的形狀。
function joinRings(segments) {
  const rings = [];
  const pool = segments.map((s) => [...s]);
  while (pool.length > 0) {
    let ring = pool.shift();
    let grew = true;
    while (grew && ringKey(ring[0]) !== ringKey(ring.at(-1))) {
      grew = false;
      for (let i = 0; i < pool.length; i += 1) {
        const seg = pool[i];
        if (ringKey(seg[0]) === ringKey(ring.at(-1))) {
          ring = ring.concat(seg.slice(1));
        } else if (ringKey(seg.at(-1)) === ringKey(ring.at(-1))) {
          ring = ring.concat([...seg].reverse().slice(1));
        } else {
          continue;
        }
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ringKey(ring[0]) === ringKey(ring.at(-1))) rings.push(ring);
  }
  return rings;
}

function collectAreas(elements, view) {
  const parks = [];
  const waters = [];
  for (const el of elements) {
    const tags = el.tags;
    if (tags === null || typeof tags !== 'object') continue;
    let target = null;
    if (tags.leisure === 'park' || tags.leisure === 'garden') target = parks;
    else if (tags.natural === 'water') target = waters;
    if (target === null) continue;

    let rings = [];
    if (el.type === 'way' && Array.isArray(el.geometry)) {
      rings = [el.geometry];
    } else if (el.type === 'relation' && Array.isArray(el.members)) {
      const outers = el.members
        .filter((m) => m?.role === 'outer' && Array.isArray(m.geometry))
        .map((m) => m.geometry)
        .filter((g) => g.length >= 2 && g.every(isLatLon));
      rings = joinRings(outers);
    }
    for (const ring of rings) {
      if (ring.length < 4 || !ring.every(isLatLon)) continue;
      if (ringKey(ring[0]) !== ringKey(ring.at(-1))) continue;
      const pixels = ring.slice(0, -1).map((p) => toPixels(view, toMetres(p)));
      const clipped = clipPolygon(pixels, view.clip);
      if (clipped.length < 3 || polygonArea(clipped) < view.minAreaPx2) {
        continue;
      }
      target.push(
        simplify([...clipped, clipped[0]], SIMPLIFY_EPS).slice(0, -1)
      );
    }
  }
  return { parks, waters };
}

function stationPoint(el) {
  if (el.type === 'node' && isLatLon(el)) return { lat: el.lat, lon: el.lon };
  const geometry =
    el.type === 'way'
      ? el.geometry
      : el.members?.flatMap((m) => m?.geometry ?? []);
  if (!Array.isArray(geometry)) return null;
  const pts = geometry.filter(isLatLon);
  if (pts.length === 0) return null;
  return {
    lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
    lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length
  };
}

function collectStations(elements, view) {
  const stations = [];
  const seen = new Set();
  for (const el of elements) {
    if (el.tags?.railway !== 'station') continue;
    const name = labelName(el.tags);
    const point = stationPoint(el);
    if (name === null || point === null || seen.has(name)) continue;
    const distance = haversineM(PIN, point);
    if (distance > STATION_RADIUS_M) continue;
    seen.add(name);
    // 「捷運」只加在捷運站上；臺鐵站沒有這個前綴，硬加會寫錯。
    const metro =
      el.tags.station === 'subway' || el.tags.station === 'light_rail';
    stations.push({
      name,
      text: `${metro ? '捷運 ' : ''}${name.endsWith('站') ? name : `${name}站`}`,
      point,
      distance,
      xy: toPixels(view, toMetres(point))
    });
  }
  return stations.sort((a, b) => a.distance - b.distance);
}

// ── 標籤配置 ─────────────────────────────────────────────────────────

const box = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });

function overlaps(a, b, pad = 0) {
  return (
    a.x0 < b.x1 + pad &&
    a.x1 > b.x0 - pad &&
    a.y0 < b.y1 + pad &&
    a.y1 > b.y0 - pad
  );
}

function within(inner, outer) {
  return (
    inner.x0 >= outer.x0 &&
    inner.y0 >= outer.y0 &&
    inner.x1 <= outer.x1 &&
    inner.y1 <= outer.y1
  );
}

function rotatedBox(cx, cy, w, h, angle) {
  const c = Math.abs(Math.cos(angle));
  const s = Math.abs(Math.sin(angle));
  const hx = (c * w + s * h) / 2;
  const hy = (s * w + c * h) / 2;
  return box(cx - hx, cy - hy, cx + hx, cy + hy);
}

// 由設定導出的版面常數（避讓區、安全區、放置規則），每種輸出算一次。
function makeView(config) {
  const { width, height, pin, glyphScale: u, safeMargin } = config;

  // 圖釘：尖端在座標點，圓頭在上方。wide 的尺寸取 27×41，再大會蓋住上方 45 px 的
  // 南京東路；compact 的圖釘隨 glyphScale 放大，數字都是 wide 的倍數。
  const pinGlyph = box(
    pin.x - 16 * u,
    pin.y - 42 * u,
    pin.x + 16 * u,
    pin.y + 3 * u
  );

  // 路名與站名離圖釘至少留這麼寬的空白。貼得太近的路名會被讀成圖釘的標籤
  // （「南京東路四段」緊靠著圖釘，看起來像診所就叫這個名字）。診所自己的標籤例外，
  // 它本來就要貼著圖釘。這個空白是固定的畫面像素，不隨 glyphScale 放大：放大的是圖示，
  // 空白放大了反而把 compact 這張小圖裡本來就不多的標籤空間吃掉。
  const k = config.keepout;
  const pinKeepout = box(
    pin.x - k.left,
    pin.y - k.top,
    pin.x + k.right,
    pin.y + k.bottom
  );

  // 舊的手機規則：手機把 wide 裁成以圖釘為中心的視窗（phoneCrop）。標籤如果剛好壓在
  // 視窗邊線上，會看到被切掉一半的字，比完全看不到更糟，所以優先避開邊線：要嘛整個
  // 在視窗裡，要嘛整個在視窗外。compact 沒有這個規則（phoneCrop 為 null）。
  const crop = config.phoneCrop;
  const phoneWindow = crop
    ? box(
        pin.x - crop.width / 2,
        pin.y - crop.height / 2,
        pin.x + crop.width / 2,
        pin.y + crop.height / 2
      )
    : null;
  const straddlesPhoneWindow = (b) =>
    phoneWindow !== null && overlaps(b, phoneWindow) && !within(b, phoneWindow);

  // 資訊卡避讓：沒有東西蓋在圖上時（cardCoverX 為 null）整張圖都算可見。
  const coverX = config.cardCoverX ?? Number.NEGATIVE_INFINITY;

  return {
    ...config,
    clip: {
      x0: -CLIP_MARGIN,
      y0: -CLIP_MARGIN,
      x1: width + CLIP_MARGIN,
      y1: height + CLIP_MARGIN
    },
    safeArea: box(
      safeMargin,
      safeMargin,
      width - safeMargin,
      height - safeMargin
    ),
    pinGlyph,
    pinKeepout,
    coverX,
    // 配置分兩輪：先要求「不被桌機資訊卡蓋住、也不被手機視窗切半」，找不到再只要求
    // 不被資訊卡蓋住。第二輪放寬的是手機上的完整性，不是桌機上的可見性。
    // 沒有手機視窗規則時，兩輪是同一個條件，只留一輪。
    placementPasses:
      phoneWindow === null
        ? [(b) => b.x0 >= coverX]
        : [
            (b) => b.x0 >= coverX && !straddlesPhoneWindow(b),
            (b) => b.x0 >= coverX
          ]
  };
}

function placePinLabel(view, reserved) {
  const { pin, glyphScale: u } = view;
  const text = '一森渼診所';
  const w = textWidth(text, view.font.pin) + view.pinLabel.padX;
  const h = view.pinLabel.height;
  // 標籤垂直中心放在圖釘中段偏下（比圓頭低），讓它離開上方的南京東路，不會和
  // 路面的白線連成一片。優先放圖釘右邊（桌機版資訊卡在左邊）；放不下再換位置。
  const midY = pin.y - 8 * u;
  const options = [
    box(pin.x + 24 * u, midY - h / 2, pin.x + 24 * u + w, midY + h / 2),
    box(pin.x + 24 * u, pin.y + 10 * u, pin.x + 24 * u + w, pin.y + 10 * u + h),
    box(pin.x - 24 * u - w, midY - h / 2, pin.x - 24 * u, midY + h / 2)
  ];
  const placed = options.find(
    (b) =>
      within(b, view.safeArea) &&
      !overlaps(b, view.pinGlyph, 6) &&
      !reserved.some((r) => overlaps(b, r, 4))
  );
  if (!placed) throw new Error('診所標籤找不到不重疊的位置');
  return { text, box: placed, w, h };
}

function placeStationLabel(view, station, reserved) {
  const { safeArea, glyphScale: u } = view;
  const w = textWidth(station.text, view.font.station);
  const h = view.font.station;
  const [sx, sy] = station.xy;
  // 上下兩個選項的水平位置夾在安全區內：離右緣太近的車站，標籤靠右對齊，而不是
  // 為了置中被擠出畫面。
  const clampX = (cx) =>
    Math.min(Math.max(cx, safeArea.x0 + w / 2), safeArea.x1 - w / 2);
  const above = clampX(sx);
  const option = (anchor, x, y, b) => ({ anchor, x, y, b });
  // 標籤中心離圓點中心的距離：上下 rise（見設定），左右 18 跟著圓點一起放大。
  const rise = view.stationRise;
  const side = 18 * u;
  // 優先放圓點的「上方」而不是壓在路上：捷運站幾乎都在大馬路正下方，站名壓在路面
  // 上會把同一條路的路名擠到別處。
  const startX = sx - 10 * u;
  const options = [
    option(
      'start',
      startX,
      sy - rise,
      box(startX, sy - rise - h / 2, startX + w, sy - rise + h / 2)
    ),
    option(
      'middle',
      above,
      sy - rise,
      box(above - w / 2, sy - rise - h / 2, above + w / 2, sy - rise + h / 2)
    ),
    option(
      'start',
      sx + side,
      sy,
      box(sx + side, sy - h / 2, sx + side + w, sy + h / 2)
    ),
    option(
      'middle',
      above,
      sy + rise,
      box(above - w / 2, sy + rise - h / 2, above + w / 2, sy + rise + h / 2)
    ),
    option(
      'end',
      sx - side,
      sy,
      box(sx - side - w, sy - h / 2, sx - side, sy + h / 2)
    )
  ];
  for (const accept of view.placementPasses) {
    const placed = options.find(
      (o) =>
        within(o.b, safeArea) &&
        accept(o.b) &&
        !reserved.some((r) => overlaps(o.b, r, 6))
    );
    if (placed) return placed;
  }
  throw new Error(`車站「${station.name}」的標籤找不到不重疊的位置`);
}

// 折線每隔 step 像素取一個點。路名要沿著「一段略有彎度的路」放，不能只放在單一
// 直線段上——簡化後的折線常把一條緩彎的大馬路切成好幾段，每段都比路名短。
function resample(run, step) {
  const pts = [run[0]];
  let carry = 0;
  for (let i = 1; i < run.length; i += 1) {
    const [ax, ay] = run[i - 1];
    const [bx, by] = run[i];
    const len = Math.hypot(bx - ax, by - ay);
    let d = step - carry;
    while (d <= len) {
      const t = d / len;
      pts.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
      d += step;
    }
    carry = len - (d - step);
  }
  return pts;
}

function crossesBox(run, b) {
  for (let i = 1; i < run.length; i += 1) {
    if (clipSegment(run[i - 1], run[i], b) !== null) return true;
  }
  return false;
}

const LABEL_STEP = 8;
// 路名底下那段路相對於弦的最大偏離。超過就代表路在這段轉彎太大，字會飄離路面。
const LABEL_MAX_BEND = 5;
// 路名每穿過一條粗路（主要／三級道路）罰多少像素的距離：字壓在別條大路上不好讀。
const CROSSING_PENALTY = 60;

// 路名放在路「旁邊」而不是壓在路上：路寬 14 px 而字高 22 px，壓上去字會凸出路面，
// 還要和路口的白線打架。沿線取樣、兩側都試，挑離圖釘最近、且不撞到任何已佔用
// 區塊的位置——離圖釘近的路名對讀者最有用。
function placeRoadLabel(view, text, lines, reserved, accept, bigRoads) {
  const { pin, safeArea } = view;
  const w = textWidth(text, view.font.road);
  const h = view.font.road;
  const reach = Math.ceil(w / 2 / LABEL_STEP);
  let best = null;
  for (const { run, half } of lines) {
    const pts = resample(run, LABEL_STEP);
    for (let c = reach; c < pts.length - reach; c += 1) {
      const a = pts[c - reach];
      const z = pts[c + reach];
      const chord = Math.hypot(z[0] - a[0], z[1] - a[1]);
      if (chord < w) continue;
      let bend = 0;
      for (let k = c - reach + 1; k < c + reach; k += 1) {
        bend = Math.max(bend, pointToSegment(pts[k], a, z));
      }
      if (bend > LABEL_MAX_BEND) continue;
      const angle = Math.atan2(z[1] - a[1], z[0] - a[0]);
      const mx = (a[0] + z[0]) / 2;
      const my = (a[1] + z[1]) / 2;
      for (const side of [-1, 1]) {
        const offset = half + h / 2 + 4;
        const cx = mx - Math.sin(angle) * side * offset;
        const cy = my + Math.cos(angle) * side * offset;
        const b = rotatedBox(cx, cy, w, h, angle);
        if (!within(b, safeArea) || !accept(b)) continue;
        if (reserved.some((r) => overlaps(b, r, 4))) continue;
        const crossings = bigRoads.filter((r) => crossesBox(r, b)).length;
        const score =
          Math.hypot(cx - pin.x, cy - pin.y) + crossings * CROSSING_PENALTY;
        if (!best || score < best.score) {
          let deg = (angle * 180) / Math.PI;
          if (deg > 90) deg -= 180;
          if (deg <= -90) deg += 180;
          best = { score, cx, cy, deg, b };
        }
      }
    }
  }
  return best;
}

// ── 組裝 SVG ─────────────────────────────────────────────────────────

const num = (n) => tenths(Math.round(n * 10));

// variant 是 VARIANTS 裡的一份設定；同一份 elements 可以連續餵給不同設定。
export function buildMapSvg(elements, variant = VARIANTS.wide) {
  const view = makeView(variant);
  const { width, height, pin, glyphScale: u } = view;
  const ways = collectRoads(elements, view);
  const stations = collectStations(elements, view);
  const { parks, waters } = collectAreas(elements, view);

  // 1. 道路：依樣式群組串接、裁切、簡化。
  const drawn = { major: [], mid: [], minor: [] };
  for (const cls of Object.keys(drawn)) {
    const chains = chainWays(ways.filter((w) => w.cls === cls));
    for (const chain of chains) {
      for (const run of clipPolyline(chain, view.clip)) {
        const simple = simplify(run, SIMPLIFY_EPS);
        if (polylineLength(simple) >= ROAD_STYLE[cls].minRun) {
          drawn[cls].push(simple);
        }
      }
    }
  }

  // 2. 路名候選：依道路名稱彙整，用「等級權重 × 可讀長度 ÷ 離圖釘遠近」排序，
  //    取前幾名。OSM 的路在每個路口都被切成一段，單段通常比路名還短，所以先把同名
  //    同等級的路段串成長折線，再拿去找放字的位置。
  const byName = new Map();
  for (const way of ways) {
    if (way.cls === 'minor' || way.name === null) continue;
    const entry = byName.get(way.name) ?? {
      name: way.name,
      weight: 0,
      distance: Infinity,
      visible: 0,
      groups: new Map(),
      lines: []
    };
    entry.weight = Math.max(entry.weight, ROAD_STYLE[way.cls].weight);
    entry.distance = Math.min(entry.distance, distanceToLineM(way.geometry));
    const group = entry.groups.get(way.cls) ?? [];
    group.push(way);
    entry.groups.set(way.cls, group);
    byName.set(way.name, entry);
  }
  for (const entry of byName.values()) {
    for (const [cls, group] of entry.groups) {
      for (const chain of chainWays(group)) {
        for (const run of clipPolyline(chain, view.clip)) {
          const simple = simplify(run, SIMPLIFY_EPS);
          entry.lines.push({ run: simple, half: ROAD_STYLE[cls].casing / 2 });
          for (let i = 1; i < simple.length; i += 1) {
            if ((simple[i][0] + simple[i - 1][0]) / 2 >= view.coverX) {
              entry.visible += Math.hypot(
                simple[i][0] - simple[i - 1][0],
                simple[i][1] - simple[i - 1][1]
              );
            }
          }
        }
      }
    }
  }
  // 距離項取平方：離圖釘 300 m 的路名還有參考價值，600 m 外的幾乎沒有，平方會把
  // 「很長但很遠」的大馬路壓到「短一點但就在隔壁」的路後面。
  const ranked = [...byName.values()]
    .filter((e) => e.visible >= view.minVisiblePx)
    .map((e) => ({
      ...e,
      score: (e.weight * e.visible) / (1 + (e.distance / 250) ** 2)
    }))
    .sort((a, b) => b.score - a.score);

  // 3. 先放圖釘與車站，再放路名；後放的避讓先放的。
  //    圖裡不放著作權文字（見檔頭「授權」），所以右下角沒有要避讓的東西。
  const reserved = [];
  const stationDots = stations.map((s) =>
    box(s.xy[0] - 14 * u, s.xy[1] - 14 * u, s.xy[0] + 14 * u, s.xy[1] + 14 * u)
  );
  reserved.push(...stationDots);
  const pinLabel = placePinLabel(view, reserved);
  reserved.push(view.pinKeepout, pinLabel.box);
  const stationLabels = stations.map((s, i) => {
    // 站名要貼著自己的圓點，所以放置時不和自己的圓點比；其他站的圓點照常避讓。
    const others = reserved.filter((r) => r !== stationDots[i]);
    const placed = placeStationLabel(view, s, others);
    reserved.push(placed.b);
    return { station: s, ...placed };
  });

  const bigRoads = [...drawn.major, ...drawn.mid];
  const roadLabels = [];
  for (const entry of ranked) {
    if (roadLabels.length >= view.maxRoadLabels) break;
    // 掉到資訊卡底下的標籤等於沒標，兩輪都要求不被卡片蓋住；放不下的路名直接略過。
    let placed = null;
    for (const accept of view.placementPasses) {
      placed = placeRoadLabel(
        view,
        entry.name,
        entry.lines,
        reserved,
        accept,
        bigRoads
      );
      if (placed !== null) break;
    }
    if (placed === null) continue;
    reserved.push(placed.b);
    roadLabels.push({ entry, ...placed });
  }
  if (roadLabels.length < view.minRoadLabels) {
    throw new Error(
      `${view.name}：只配到 ${roadLabels.length} 個路名標籤（至少要 ${view.minRoadLabels} 個）`
    );
  }

  // 4. 輸出。只用呈現屬性，不用 <style>、style=、<script>、<foreignObject>、
  //    href 或 url()：這張圖會被當 <img> 載入，網站 CSP 只允許同源圖片。
  const title = '一森渼診所位置地圖（臺北市松山區光復北路112號2樓）';
  const roadNames = roadLabels.map((l) => escapeXml(l.entry.name)).join('、');
  const stationNames = stationLabels
    .map((l) => escapeXml(l.station.text))
    .join('、');
  const desc = `圖釘為一森渼診所。標示的道路：${roadNames}${
    stationNames === '' ? '' : `；標示的車站：${stationNames}`
  }。`;
  const out = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" lang="zh-Hant" font-family="${FONT_FAMILY}">`,
    `<title>${escapeXml(title)}</title>`,
    `<desc>${desc}</desc>`,
    `<rect width="${width}" height="${height}" fill="${COLOR.land}"/>`
  );
  if (waters.length > 0) {
    out.push(`<path fill="${COLOR.water}" d="${encodePolygons(waters)}"/>`);
  }
  if (parks.length > 0) {
    out.push(`<path fill="${COLOR.park}" d="${encodePolygons(parks)}"/>`);
  }

  const lineGroup = (cls, color, width) =>
    drawn[cls].length === 0
      ? null
      : `<path fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" d="${encodeLines(drawn[cls])}"/>`;
  out.push(lineGroup('minor', COLOR.road, ROAD_STYLE.minor.stroke));
  out.push(lineGroup('mid', COLOR.casing, ROAD_STYLE.mid.casing));
  out.push(lineGroup('mid', COLOR.road, ROAD_STYLE.mid.stroke));
  out.push(lineGroup('major', COLOR.casing, ROAD_STYLE.major.casing));
  out.push(lineGroup('major', COLOR.road, ROAD_STYLE.major.stroke));

  // 文字都帶一圈底色描邊，壓在白線或公園上也讀得到。
  const halo = `stroke="${COLOR.land}" stroke-width="${view.haloWidth}" stroke-linejoin="round" paint-order="stroke"`;
  out.push(
    `<g font-size="${view.font.road}" fill="${COLOR.text}" ${halo} text-anchor="middle">`
  );
  for (const l of roadLabels) {
    out.push(
      `<text transform="translate(${num(l.cx)} ${num(l.cy)}) rotate(${num(l.deg)})" y="${num(view.font.road * 0.36)}">${escapeXml(l.entry.name)}</text>`
    );
  }
  out.push('</g>');

  out.push(
    `<g font-size="${view.font.station}" font-weight="700" fill="${COLOR.brand}" ${halo}>`
  );
  for (const l of stationLabels) {
    out.push(
      `<text x="${num(l.x)}" y="${num(l.y + view.font.station * 0.36)}" text-anchor="${l.anchor}">${escapeXml(l.station.text)}</text>`
    );
  }
  out.push('</g>');
  for (const l of stationLabels) {
    out.push(
      `<g transform="translate(${num(l.station.xy[0])} ${num(l.station.xy[1])})"><circle r="${num(10 * u)}" fill="${COLOR.brand}" stroke="${COLOR.road}" stroke-width="${num(3 * u)}"/><circle r="${num(4 * u)}" fill="${COLOR.road}"/></g>`
    );
  }

  // 診所標籤：白底圓角，放在圖釘旁邊，不蓋到圖釘。
  const pb = pinLabel.box;
  out.push(
    `<rect x="${num(pb.x0)}" y="${num(pb.y0)}" width="${num(pinLabel.w)}" height="${num(pinLabel.h)}" rx="${num(12 * u)}" fill="${COLOR.road}" stroke="${COLOR.casing}" stroke-width="2"/>`,
    `<text x="${num((pb.x0 + pb.x1) / 2)}" y="${num((pb.y0 + pb.y1) / 2 + view.font.pin * 0.36)}" font-size="${view.font.pin}" font-weight="700" fill="${COLOR.brand}" text-anchor="middle">${escapeXml(pinLabel.text)}</text>`
  );
  out.push(
    `<g transform="translate(${pin.x} ${pin.y})${u === 1 ? '' : ` scale(${num(u)})`}"><path d="M0 0C-4.5-8-13.5-15-13.5-26a13.5 13.5 0 1 1 27 0C13.5-15 4.5-8 0 0z" fill="${COLOR.brand}" stroke="${COLOR.road}" stroke-width="3" stroke-linejoin="round"/><circle cy="-26" r="5.5" fill="${COLOR.road}"/></g>`
  );

  out.push('</svg>');

  const svg = `${out.filter((line) => line !== null).join('\n')}\n`;
  return { svg, roadLabels, stationLabels };
}

function main() {
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const input = process.argv[2]
    ? resolve(process.argv[2])
    : join(repoRoot, 'output', 'map-data', 'osm.json');
  const outputDir = join(repoRoot, 'apps', 'web', 'public', 'clinic-assets');

  // 資料只讀、只解析一次，兩種輸出共用。
  const elements = readElements(input);
  mkdirSync(outputDir, { recursive: true });
  for (const variant of Object.values(VARIANTS)) {
    const output = join(outputDir, variant.file);
    const { svg, roadLabels, stationLabels } = buildMapSvg(elements, variant);
    writeFileSync(output, svg);

    const bytes = Buffer.byteLength(svg);
    console.log(
      `[${variant.name}] 寫出 ${output}（${bytes} bytes，${(bytes / 1024).toFixed(1)} KiB）`
    );
    console.log('標示的道路（距離＝圖釘到道路中心線最近點的直線距離）：');
    for (const l of roadLabels) {
      console.log(`  ${l.entry.name}\t${Math.round(l.entry.distance)} m`);
    }
    console.log('標示的車站（距離＝圖釘到車站點的直線距離）：');
    for (const l of stationLabels) {
      console.log(`  ${l.station.text}\t${Math.round(l.station.distance)} m`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
