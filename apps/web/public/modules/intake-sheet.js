import { birthDateHasYear, maskIdentityDocument } from './patient-registry.js';
import { escapeHtml, formatFullDate } from './ui-format.js';
import { isWorkbenchCapabilityEnabled } from './workbench-scope-policy.js';

/**
 * 初診紙本表單的雙面列印版（W7，業主 2026-11-23 要求「印完整雙面、盡量一模一樣」）。
 *
 * 正面＝◎初診基本資料；背面＝門診紀錄表。只把**已經有的**資料（姓名、生日、完整手機、
 * 身分證、初診日期、管理師）排進格子，其餘一律空白方框或底線，讓患者到診時
 * 手寫。**系統不儲存任何勾選內容。**
 *
 * 這個模組與 intake-print.css 都只在按下「列印初診基本資料」時才動態載入，所以不佔
 * /index.html 的效能預算。CSP 是 `style-src 'self'`：不能用 style 屬性，寬度走 class；
 * 線稿用 <img src> 引用 intake-assets/ 下的 SVG（`img-src 'self'`）。
 * 舊證件在畫面（預覽）遮罩、列印完整身分證，護照維持遮罩，列印後容器立即清空。
 */
const blank = (size = 'md') =>
  `<span class="intake-blank intake-blank-${size}"></span>`;
const box = (text) =>
  `<span class="intake-opt"><i class="intake-cb"></i>${text}</span>`;
const boxes = (...texts) => texts.map(box).join('');
const row = (...parts) => `<div class="intake-line">${parts.join('')}</div>`;
const star = (text) => `<span class="intake-star">★${text}</span>`;
const th = (text) => `<th>${text}</th>`;
const td = (value = '', span = 1) =>
  `<td${span > 1 ? ` colspan="${span}"` : ''}>${value}</td>`;

const patientOf = (state, id) => state.patients.find((item) => item.id === id);

function birthText(record) {
  return birthDateHasYear(record.birthDate)
    ? `${record.birthDate.slice(0, 4)} 年 ${record.birthDate.slice(5, 7)} 月 ${record.birthDate.slice(8, 10)} 日`
    : `${blank('sm')} 年 ${(record.birthDate ?? '').slice(2, 4)} 月 ${(record.birthDate ?? '').slice(5, 7)} 日`;
}

function documentText(record) {
  const legacyDocument = record.nationalId || record.passportNumber;
  if (!legacyDocument) return '';
  const masked = escapeHtml(maskIdentityDocument(record));
  return record.nationalId
    ? `<span class="intake-screen-only">${masked}</span><span class="intake-print-only">${escapeHtml(record.nationalId)}</span>`
    : masked;
}

function managerText(state, appointment) {
  if (!isWorkbenchCapabilityEnabled('CASE_MANAGEMENT')) return '';
  const assignment = state.caseAssignments.find(
    (item) => item.appointmentId === appointment.id && item.status === 'active'
  );
  const label =
    assignment === undefined
      ? ''
      : escapeHtml(
          state.caseManagers.find((item) => item.id === assignment.managerId)
            ?.label ?? assignment.managerId
        );
  return `<span>管理師：<span class="intake-value">${label}</span></span>`;
}

function frontPage(state, appointment, record) {
  return `<section class="intake-page intake-front">
    <header class="intake-top">
      <strong class="intake-title">◎初診基本資料</strong>
      <img class="intake-logo" src="/clinic-assets/clinic-logo.webp" alt="" />
      <span>病歷號碼：<span class="intake-value"></span></span>
      <span>初診日期：<span class="intake-value">${escapeHtml(formatFullDate(appointment.startsAt))}</span></span>
      ${managerText(state, appointment)}
    </header>
    <table class="intake-box intake-id">
      <tr>${th('姓　　名')}${td(escapeHtml(record.name ?? ''))}${th('生日')}${td(birthText(record))}${th('年齡')}${td()}${th('性　別')}${td(boxes('男', '女'))}</tr>
      <tr>${th('身分證字號')}${td(documentText(record))}${th('手機')}${td(escapeHtml(record.phone ?? ''))}${th('市話')}${td()}${th('婚　姻')}${td(boxes('已婚', '單身'))}</tr>
      <tr>${th('住　　址')}${td('', 5)}${th('職　業')}${td()}</tr>
      <tr>${th('聯　絡　人')}${td()}${th('手機')}${td()}${th('關係')}${td()}${th('LineID')}${td()}</tr>
      <tr><td colspan="8" class="intake-source">
        ${row('如何得知診所訊息：', boxes('網路搜尋', '官網', 'IG', 'FB', '論壇', 'Threads', '路過'))}
        ${row(boxes('親友介紹'), box(`介紹人：${blank('sm')}`), box('員工介紹'), box(`介紹人：${blank('sm')}`), box('其他：'))}
      </td></tr>
    </table>
    <h2 class="intake-heading">◎自主健康評量表、過去健康狀況、病史、手術史、過敏史、生活習慣</h2>
    <table class="intake-box intake-health">
      <tr><th>身高/cm</th>${td()}<th>體重/kg</th>${td()}</tr>
      <tr><td colspan="2" class="intake-half">
        ${row('是否懷孕', boxes('是', '否'))}
        ${row(boxes('心臟病', '糖尿病', '高血壓', '焦慮'))}
        ${row(boxes('腫瘤'), box(`免疫疾病：${blank('md')}`))}
        ${row(boxes('甲狀腺亢進/低下', 'B、C肝炎', '腎功能疾病'))}
        ${row(star('疾病手術史'))}
        ${row(`手術項目：${blank('lg')}`)}
        ${row(star('血型'), boxes('不清楚', 'A型', 'B型', 'O型', 'AB型'))}
      </td><td colspan="2" class="intake-half">
        ${row(star('藥物過敏：'), box('無'), box(`有：${blank('md')}`))}
        ${row(star('目前服用藥物：'), box('無'), box(`有：${blank('md')}`))}
        ${row('&nbsp;')}
        ${row('抽菸：', boxes('無', '有'))}
        ${row('喝酒：', boxes('無', '有', '常喝', '應酬'))}
        ${row('失眠：', boxes('無', '有', '依賴安眠藥'))}
        ${row('熬夜：', boxes('無', '有', '每天熬夜', '偶爾'))}
      </td></tr>
    </table>
    <h2 class="intake-heading">(鼻塞、鼻過敏、打呼患者以下請填寫)</h2>
    <table class="intake-box intake-quiz">
      <tr><td>1.</td><th>我最困擾的問題</th><td>${row(boxes('鼻塞', '鼻血', '噴嚏', '鼻鼾', '鼻涕倒流', '嗅覺變差', '喉異物感'))}${row(box('其他：'))}</td></tr>
      <tr><td>2.</td><th>用藥習慣</th><td>${row(boxes('無', '有', '鼻噴劑', '肌肉鬆弛劑', '中藥', '安眠藥', '其他：'))}</td></tr>
      <tr><td>3.</td><th>鼻咽喉困擾問題</th><td>
        ${row(boxes('睡醒口乾舌燥', '張口呼吸', '長期被枕邊人、家人抱怨。'))}
        ${row(boxes('睡覺呼吸疑似中斷情況', '睡覺時突深呼吸驚醒或咳醒'))}
        ${row(boxes('易疲勞', '無法正躺睡覺', '體重上升'))}
        ${row(boxes('曾想治療沒概念', '不想戴正壓呼吸器等輔具', '不想住院', '其他：'))}
      </td></tr>
      <tr><td>4.</td><th>睡眠狀況</th><td>${row(boxes('易入睡', '失眠', '淺眠', '睡不飽', '側躺睡', '正躺會喘', '半夜常醒來'))}</td></tr>
      <tr><td>5.</td><th>曾經治療紀錄</th><td>
        ${row('(1)曾經做過睡眠檢查確診呼吸中止症：')}
        ${row(box('無'), box('有，報告為：'), boxes('輕症', '中症', '重症'), `指數：${blank('sm')}`)}
        ${row('(2)曾經做過其他耳鼻喉科相關檢查：')}
        ${row(box('無'), box('有，'), boxes('鼻過敏', '鼻中膈彎曲', '鼻甲肥大', '鼻息肉'))}
        ${row('(3)曾經做過鼻咽喉手術：')}
        ${row('鼻腔：', boxes('無'), box('有：'), boxes('鼻中膈手術', '下鼻甲手術', '鼻整形'))}
        ${row(box('下鼻甲手術 ：'), boxes('無線射頻', '雷射', '螺旋刀'), box('其他：'))}
        ${row('咽喉：', boxes('無'), box('有：'), boxes('顎咽懸壅垂成形手術', '扁桃腺', '止鼾牙套'))}
      </td></tr>
    </table>
    <p class="intake-notice">本診所於公共空間(候診區、走廊、通道等)以及半公開空間(管理師會談室)依法設有監控錄影設備，目的維護醫病安全，影像資料依法保存，嚴格控管調閱權限。於洗手間、浴室、手術觀察室、治療室、美容室等隱私空間則<u>無監控錄影設備</u>，若有疑慮，請告知掛號人員。(20260514 版)</p>
    <p class="intake-sign">以上資料由本人確認無誤，簽名：${blank('lg')}</p>
  </section>`;
}

function recordBlock() {
  return `<div class="intake-rec">
      <div class="intake-rec-title">醫師門診紀錄</div>
      <div class="intake-rec-date">日期：</div>
      <div class="intake-rec-art">
        <img class="intake-art-nose" src="/intake-assets/nose-front.svg" alt="" />
        <img class="intake-art-nose" src="/intake-assets/nose-side.svg" alt="" />
      </div>
      <div class="intake-rec-art"><img class="intake-art-mouth" src="/intake-assets/mouth.svg" alt="" /></div>
    </div>`;
}

function backPage(record) {
  return `<section class="intake-page intake-back">
    <header class="intake-top intake-back-top">
      <img class="intake-logo" src="/clinic-assets/clinic-logo.webp" alt="" />
      <strong class="intake-title">門診紀錄表</strong>
      <span class="intake-mrn">●病歷號碼：<span class="intake-value"></span></span>
    </header>
    <table class="intake-box intake-back-id">
      <tr>${th('姓　　名')}${td(escapeHtml(record.name ?? ''))}${th('生　日')}${td(birthText(record))}${th('性　別')}${td(boxes('男', '女'))}</tr>
    </table>
    <div class="intake-recs">${recordBlock()}${recordBlock()}</div>
  </section>`;
}

export function renderIntakeSheet(state, appointmentId) {
  const appointment = state.appointments.find(
    (item) => item.id === appointmentId
  );
  if (appointment === undefined) return '';
  const record = patientOf(state, appointment.patientId) ?? {};
  return `<div class="intake-sheet">${frontPage(state, appointment, record)}${backPage(record)}</div>`;
}

/** 列印版面樣式只在這裡才載入（不進 /index.html 的初始樣式表）。 */
export function loadIntakeStylesheet(documentRef = globalThis.document) {
  if (documentRef.querySelector('link[data-intake-style]'))
    return Promise.resolve();
  const stylesheet = documentRef.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = '../intake-print.css';
  stylesheet.dataset.intakeStyle = '';
  return new Promise((resolve, reject) => {
    stylesheet.addEventListener('load', resolve, { once: true });
    stylesheet.addEventListener(
      'error',
      () => {
        stylesheet.remove();
        reject(new Error('列印版面樣式目前無法載入'));
      },
      { once: true }
    );
    documentRef.head.append(stylesheet);
  });
}
