(() => {
  function syncForm(form) {
    const continuous =
      form.querySelector('[name="type"]:checked')?.value === 'CONTINUOUS';
    const dates = form.querySelector('[data-term-dates]');
    if (!dates) return;
    dates.hidden = continuous;
    dates.disabled = continuous;
    dates.querySelectorAll('input').forEach((input) => {
      input.required = !continuous;
    });
  }
  function initialize() {
    document.querySelectorAll('[data-term-form]').forEach(syncForm);
  }
  document.addEventListener('change', (event) => {
    if (event.target.matches('[data-term-form] [name="type"]'))
      syncForm(event.target.closest('form'));
  });
  document.addEventListener('click', (event) => {
    const clear = event.target.closest('[data-clear-term-search]');
    if (!clear) return;
    const form = clear.closest('form');
    const input = form.querySelector('[name="termId"]');
    input.value = '';
    form.requestSubmit();
    input.focus();
  });
  document.addEventListener('DOMContentLoaded', initialize);
  document.addEventListener('htmx:afterSwap', initialize);
  document.addEventListener('htmx:historyRestore', () => {
    const input = document.querySelector('[data-terms-search] [name="termId"]');
    if (input)
      input.value =
        new URLSearchParams(window.location.search).get('termId') || '';
    initialize();
  });
  initialize();
})();
