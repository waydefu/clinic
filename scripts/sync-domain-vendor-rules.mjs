/** Select JavaScript artifacts that belong in the browser's domain vendor. */
export function selectBrowserDomainFiles(entries) {
  return entries
    .filter((name) => name.endsWith('.js') && !name.endsWith('.node.js'))
    .sort();
}
