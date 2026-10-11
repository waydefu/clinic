import { data } from '/prototype/home-data.js';

// Native nodes only. The prototype uses the repository's unchanged CSP,
// including require-trusted-types-for 'script'; no innerHTML or permissive policy.
function node(tag, text, attrs = {}) {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, String(value));
  return element;
}
const clinic = data.clinic;
const quickHours = document.querySelector('#quick-hours');
for (const line of clinic.hours) quickHours.append(node('span', line));
for (const id of ['quick-phone', 'visit-phone']) {
  const element = document.querySelector('#' + id);
  element.textContent = clinic.phoneDisplay;
  element.href = clinic.phoneHref;
}
for (const id of ['quick-address', 'visit-address', 'footer-address']) document.querySelector('#' + id).textContent = clinic.address;
for (const line of clinic.hours) document.querySelector('#visit-hours').append(node('li', line));
document.querySelector('#map-link').href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(clinic.address);
for (const social of clinic.socialLinks.filter(item => ['LINE', 'Instagram', 'Facebook'].includes(item.label))) {
  document.querySelector('#social-links').append(node('a', social.label, { href: social.href, target: '_blank', rel: 'noopener noreferrer' }));
}
for (let i = 0; i < data.doctors.length; i++) {
  const doctor = data.doctors[i];
  const [name, position] = doctor.name.split(' ');
  const profile = node('article', null, { class: 'doctor-profile doctor-' + (i ? 'yang' : 'yan') });
  profile.append(node('img', null, { src: '/visual-assets/doctor-' + (i ? 'yang' : 'yan') + '.webp', alt: doctor.alt, width: 420, height: 460, loading: 'lazy', class: 'doctor-portrait' }));
  const copy = node('div', null, { class: 'doctor-copy' });
  copy.append(node('p', i ? '麻醉科' : '耳鼻喉科', { class: 'doctor-specialty' }));
  const heading = node('h3', name);
  heading.append(node('span', position));
  copy.append(heading);
  const summary = data.doctorSummaries.find(item => item.slug === doctor.slug);
  copy.append(node('p', summary.focus, { class: 'doctor-focus' }));
  copy.append(node('p', summary.summary));
  const credentials = node('ul', null, { class: 'doctor-credentials' });
  for (const line of doctor.education) credentials.append(node('li', line));
  copy.append(credentials, node('a', '學經歷與照護項目 ↗', { href: '/clinic/doctors/' + doctor.slug, class: 'text-link' }));
  profile.append(copy);
  document.querySelector('#doctor-profiles').append(profile);
}
const careKeys = ['environment', 'listening', 'treatment', 'aftercare'];
for (let i = 0; i < data.process.length; i++) {
  const entry = node('div', null, { class: 'process-entry' });
  const artwork = node('div', null, { class: 'care-artwork care-' + careKeys[i], 'aria-hidden': 'true' });
  artwork.append(node('img', null, { src: '/visual-assets/care-atlas.webp', alt: '', width: 528, height: 132, loading: 'lazy' }));
  const copy = node('div');
  copy.append(node('h3', data.process[i].title), node('p', data.process[i].description));
  entry.append(artwork, copy);
  document.querySelector('#care-process').append(entry);
}
for (const faq of data.faqs) {
  const details = node('details');
  details.append(node('summary', faq.question), node('p', faq.answer));
  document.querySelector('#faq-list').append(details);
}
for (const paragraph of data.selfTracking.paragraphs) document.querySelector('#tracking-content').append(node('p', paragraph));
for (const link of data.selfTracking.links) document.querySelector('#tracking-content').append(node('a', link.label + ' ↗', { href: link.href, target: '_blank', rel: 'noopener noreferrer' }));

const mobileMenu = document.querySelector('.mobile-navigation');
mobileMenu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => { mobileMenu.open = false; }));
mobileMenu.addEventListener('keydown', event => {
  if (event.key === 'Escape') { mobileMenu.open = false; mobileMenu.querySelector('summary').focus(); }
});

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const hero = document.querySelector('.hero-scene');
const heroPhoto = document.querySelector('#hero-photo');
const play = document.querySelector('#photo-play');
const status = document.querySelector('#photo-status');
const labels = { logo: '入口標誌牆', consult: '看診空間', reception: '診所櫃台', lounge: '候診空間', treatment: '處置空間', desk: '診桌' };
let current = 0;
let paused = reduced.matches;
let timer;
let generation = 0;
function syncPlayback() {
  clearTimeout(timer);
  play.hidden = reduced.matches;
  play.setAttribute('aria-label', paused ? '播放輪播' : '暫停輪播');
  play.firstElementChild.textContent = paused ? '▷' : 'Ⅱ';
  hero.dataset.playback = reduced.matches ? 'manual-only' : paused ? 'paused' : document.hidden ? 'hidden' : 'playing';
  if (!reduced.matches && !paused && !document.hidden) timer = setTimeout(async () => {
    await showPhoto((current + 1) % data.photos.length, false);
    syncPlayback();
  }, 7000);
}
async function showPhoto(index, manual) {
  const ticket = ++generation;
  const photo = data.photos[index];
  const preload = new Image();
  preload.src = photo.url;
  try { await preload.decode(); } catch {
    if (ticket === generation) { paused = true; status.textContent = '照片暫時無法載入，請再選一次。'; syncPlayback(); }
    return;
  }
  if (ticket !== generation) return;
  current = index;
  heroPhoto.src = photo.url;
  heroPhoto.alt = '一森渼診所' + labels[photo.id];
  hero.dataset.photo = photo.id;
  hero.querySelectorAll('[data-photo-index]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.photoIndex) === index)));
  if (manual) status.textContent = '目前顯示：' + labels[photo.id];
}
for (let i = 0; i < data.photos.length; i++) {
  const button = node('button', null, { type: 'button', 'aria-label': '查看' + labels[data.photos[i].id], 'aria-pressed': i === 0, 'data-photo-index': i });
  button.append(node('span', null, { 'aria-hidden': 'true' }));
  button.addEventListener('click', async () => { paused = true; syncPlayback(); await showPhoto(i, true); });
  button.addEventListener('focus', () => { paused = true; generation++; syncPlayback(); });
  document.querySelector('#hero-dots').append(button);
}
play.addEventListener('click', () => {
  if (reduced.matches) return;
  paused = !paused;
  if (paused) generation++;
  syncPlayback();
});
reduced.addEventListener('change', () => {
  paused = true; generation++;
  if (reduced.matches && document.activeElement === play) document.querySelector('[data-photo-index="' + current + '"]').focus();
  syncPlayback();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) generation++; syncPlayback(); });
window.addEventListener('pagehide', () => { generation++; clearTimeout(timer); });
window.addEventListener('pageshow', event => { if (event.persisted) syncPlayback(); });
syncPlayback();

let environmentGeneration = 0;
const environmentChoices = ['consult', 'lounge', 'reception'];
for (const id of environmentChoices) {
  const button = node('button', labels[id], { type: 'button', 'aria-pressed': id === 'consult', 'data-environment-photo': id });
  button.addEventListener('click', async () => {
    const ticket = ++environmentGeneration;
    const photo = data.photos.find(item => item.id === id);
    const preloaded = new Image(); preloaded.src = photo.url;
    try { await preloaded.decode(); } catch { status.textContent = '照片暫時無法載入，請再選一次。'; return; }
    if (ticket !== environmentGeneration) return;
    const image = document.querySelector('#environment-photo');
    image.src = photo.url; image.alt = '一森渼診所' + labels[id];
    document.querySelector('#environment-caption').textContent = labels[id];
    document.querySelectorAll('[data-environment-photo]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.environmentPhoto === id)));
    status.textContent = '目前顯示：' + labels[id];
  });
  document.querySelector('#environment-selectors').append(button);
}
