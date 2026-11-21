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
      halaqaSelect.disabled = !requiresHalaqa;
      halaqaSelect.required = requiresHalaqa;
      if (!requiresHalaqa) halaqaSelect.value = '';
    }
  }

  function activateTab(tab) {
    const dialog = tab.closest('[data-registration-tabs]');
    for (const item of dialog.querySelectorAll('[role="tab"]')) {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      dialog.querySelector('#' + item.getAttribute('aria-controls')).hidden = !selected;
    }
    tab.focus();
  }

  document.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-registration-tabs] [role="tab"]:enabled');
    if (tab) activateTab(tab);
  });

  document.addEventListener('keydown', (event) => {
    const tab = event.target.closest('[data-registration-tabs] [role="tab"]:enabled');
    if (!tab) return;
    const tabs = [...tab.parentElement.querySelectorAll('[role="tab"]:enabled')];
    const index = tabs.indexOf(tab);
    // In the Arabic layout the next tab is to the left.
    const destinations = {
      ArrowLeft: (index + 1) % tabs.length,
      ArrowRight: (index + tabs.length - 1) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    if (!Object.hasOwn(destinations, event.key)) return;
    event.preventDefault();
    activateTab(tabs[destinations[event.key]]);
  });

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
