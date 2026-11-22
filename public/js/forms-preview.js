// Forms list page: renders the selected form as the student will see it.
// The detail is swapped by HTMX when another form is chosen, so this runs
// on load and after every swap.
(() => {
  let current = null;

  async function renderPreview() {
    const root = document.querySelector('[data-form-preview]:not([data-rendered])');
    const schemaElement = document.querySelector('[data-form-schema]');
    if (!root || !schemaElement || !window.Formio) return;
    root.dataset.rendered = 'true';

    try {
      const schema = JSON.parse(schemaElement.textContent);
      root.replaceChildren();
      current = await Formio.createForm(root, schema, {
        ...window.qcmsFormioI18n(),
        noAlerts: true,
      });
      current.nosubmit = true;
    } catch {
      const message = document.createElement('p');
      message.className = 'text-sm text-red-700';
      message.textContent = 'تعذر عرض معاينة هذا النموذج.';
      root.replaceChildren(message);
    }
    root.removeAttribute('aria-busy');
  }

  // Free the old form's listeners before HTMX removes its element.
  document.addEventListener('htmx:beforeSwap', (event) => {
    if (event.detail.target?.id === 'forms-workspace') {
      current?.destroy();
      current = null;
    }
  });

  document.addEventListener('htmx:afterSettle', renderPreview);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderPreview);
  } else {
    renderPreview();
  }
})();
