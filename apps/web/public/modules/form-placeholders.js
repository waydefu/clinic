// 動態表單只能以 DOM 建立，且不能有原生導向目的地。
export function activateFormPlaceholders(container) {
  const attributes = [
    'id',
    'class',
    'hidden',
    'data-reschedule-form',
    'data-notes-form',
    'data-follow-up-form',
    'data-case-form',
    'data-otp-form',
    'data-correction-form',
    'data-appointment-form'
  ];
  for (const placeholder of container.querySelectorAll('[data-client-form]')) {
    const form = document.createElement('form');
    for (const attribute of attributes) {
      if (placeholder.hasAttribute(attribute))
        form.setAttribute(attribute, placeholder.getAttribute(attribute));
    }
    form.addEventListener('submit', (event) => event.preventDefault());
    form.append(...placeholder.childNodes);
    placeholder.replaceWith(form);
  }
}
