(() => {
  function syncActivityForm(form) {
    const selectedLevel = form.querySelector('[name="level"]:checked')?.value;
    const halaqaFields = form.querySelector('[data-activity-halaqa]');
    const halaqaSelect = form.querySelector('[data-activity-halaqa-select]');

    if (!halaqaFields) return;

    const requiresHalaqa = selectedLevel === 'HALAQA_SPECIFIC';
    halaqaFields.hidden = !requiresHalaqa;
    halaqaFields.disabled = !requiresHalaqa;

    if (halaqaSelect) {
      halaqaSelect.required = requiresHalaqa;
      if (!requiresHalaqa) halaqaSelect.value = '';
    }
  }

  function initialize() {
    document.querySelectorAll('[data-activity-form]').forEach(syncActivityForm);
  }

  document.addEventListener('change', (event) => {
    const form = event.target.closest('[data-activity-form]');
    if (form && event.target.matches('[name="level"]')) syncActivityForm(form);
  });

  document.addEventListener('DOMContentLoaded', initialize);
  document.addEventListener('htmx:afterSwap', initialize);
  initialize();
})();
