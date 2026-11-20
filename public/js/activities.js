(() => {
  function syncActivityForm(form) {
    const deadline = form.querySelector('[data-application-deadline]');
    if (deadline) {
      const enabled = Boolean(form.elements.template.value);
      deadline.hidden = !enabled;
      deadline.disabled = !enabled;
    }
    const selectedLevel = form.querySelector('[name="level"]:checked')?.value;
    const halaqaFields = form.querySelector('[data-activity-halaqa]');
    const halaqaSelect = form.querySelector('[data-activity-halaqa-select]');

    if (!halaqaFields) return;

    const requiresHalaqa = selectedLevel === 'HALAQA_SPECIFIC';
    halaqaFields.hidden = !requiresHalaqa;
    halaqaFields.disabled = !requiresHalaqa;

    if (halaqaSelect) {
      halaqaSelect.disabled = !requiresHalaqa;
      halaqaSelect.required = requiresHalaqa;
      if (!requiresHalaqa) halaqaSelect.value = '';
    }
  }

  function initialize() {
    document.querySelectorAll('[data-activity-form]').forEach(syncActivityForm);
  }

  document.addEventListener('change', (event) => {
    const form = event.target.closest('[data-activity-form]');
    if (form && event.target.matches('[name="level"], [name="template"]')) syncActivityForm(form);
  });

  document.addEventListener('DOMContentLoaded', initialize);
  document.addEventListener('htmx:afterSwap', initialize);
  initialize();
})();
