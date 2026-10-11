// Build-time shared shell: semantic links stay in HTML, icons share one SVG resource.
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
export function socials(clinic, id = "") {
  return `<div${id ? ` id="${id}"` : ""} class="social-icons">${clinic.socialLinks
    .filter((s) => ["LINE", "Instagram", "Facebook"].includes(s.label))
    .map(
      (s) =>
        `<a href="${escape(s.href)}" target="_blank" rel="noopener noreferrer" aria-label="${s.label}（另開視窗）" title="${s.label}"><svg aria-hidden="true" viewBox="0 0 24 24"><use href="/visual-assets/social-icons.svg#${s.label.toLowerCase()}"></use></svg></a>`,
    )
    .join("")}</div>`;
}
export function footer(clinic) {
  return `<footer class="site-footer"><div class="page-width"><strong>一森渼診所</strong><p>${escape(clinic.address)}</p><a href="${escape(clinic.phoneHref)}">${escape(clinic.phoneDisplay)}</a><a href="/privacy">隱私權說明</a></div></footer>`;
}
