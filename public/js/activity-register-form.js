// Manual registration dialog: staff fill the activity's form for the
// participant, with the same answers the public apply page collects.
//
// The dialog has three tabs (halaqa students, center students, guests) and
// up to four forms. One Form.io form is shared: it is moved into the active
// form's [data-answers-slot], so answers survive switching tabs.
// Before a form is sent: the browser checks its own fields, Form.io checks
// the answers, and the answers go into the form's hidden formAnswers input.
(() => {
  let formio = null;
  let rendering = false;
  // The form staff last focused (e.g. the returning guest select while the
  // "new guest" form is open): the answers follow it.
  let focusedForm = null;

  // The page has its own submit button, so Form.io's buttons are removed:
  // left in, one would sit inside our <form> and catch Enter key presses.
  function withoutButtons(components) {
    return (components ?? [])
      .filter((component) => component.type !== 'button')
      .map((component) => ({
        ...component,
        ...(component.components && { components: withoutButtons(component.components) }),
        ...(component.columns && {
          columns: component.columns.map((column) => ({
            ...column,
            components: withoutButtons(column.components),
          })),
        }),
      }));
  }

  // The form the staff member is using now: in the visible tab, the one they
  // last focused, else the open "new guest" form if its <details> is open,
  // else the first one.
  function activeForm(dialog) {
    const panel = dialog.querySelector('[role="tabpanel"]:not([hidden])');
    if (!panel) return null;
    const forms = [...panel.querySelectorAll('form[data-needs-answers]')];
    if (forms.includes(focusedForm) && focusedForm.closest('details')?.open !== false)
      return focusedForm;
    return (
      forms.find((form) => form.closest('details')?.open) ??
      forms.find((form) => !form.closest('details')) ??
      forms[0] ??
      null
    );
  }

  function placeAnswers(dialog) {
    const block = dialog.querySelector('[data-register-answers]');
    if (!block) return;
    const slot = activeForm(dialog)?.querySelector('[data-answers-slot]');
    // No form in this tab (e.g. no students to pick): nothing to answer.
    block.hidden = !slot;
    if (slot && block.parentElement !== slot) slot.append(block);
  }

  async function render() {
    const dialog = document.getElementById('activity-register');
    const root = dialog?.querySelector('[data-register-form]');
    const schemaElement = dialog?.querySelector('[data-register-schema]');
    if (!root || !schemaElement || !window.Formio || rendering) return;
    if (root.dataset.rendered) return placeAnswers(dialog);

    rendering = true;
    formio?.destroy();
    formio = null;
    try {
      const schema = JSON.parse(schemaElement.textContent);
      schema.components = withoutButtons(schema.components);
      root.replaceChildren();
      formio = await Formio.createForm(root, schema, {
        ...window.qcmsFormioI18n(),
        noAlerts: true,
      });
      formio.nosubmit = true;
      root.dataset.rendered = 'true';
    } catch {
      const message = document.createElement('p');
      message.className = 'text-sm text-red-700';
      message.setAttribute('role', 'alert');
      message.textContent = 'تعذر تحميل النموذج. أغلق النافذة وحاول مرة أخرى.';
      root.replaceChildren(message);
    }
    root.removeAttribute('aria-busy');
    rendering = false;
    placeAnswers(dialog);
  }

  document.addEventListener(
    'submit',
    async (event) => {
      const form = event.target.closest('form[data-needs-answers]');
      if (!form) return;
      // Second pass (answers already checked and filled): let it go.
      if (form.dataset.answersReady) {
        delete form.dataset.answersReady;
        return;
      }
      event.preventDefault();
      if (!formio) return; // the form failed to load: never send without answers

      // 1. The form's own fields (student, guest name...).
      if (!form.reportValidity()) return;

      // 2. The answers: Form.io marks invalid fields and rejects.
      let submission;
      try {
        submission = await formio.submit();
      } catch {
        form.querySelector('[data-register-answers] .has-error input, [data-register-answers] .has-error select, [data-register-answers] .has-error textarea')?.focus();
        return;
      }

      // 3. Send, with the answers as JSON text.
      form.querySelector('input[name="formAnswers"]').value = JSON.stringify(submission.data ?? {});
      form.dataset.answersReady = 'true';
      form.requestSubmit();
    },
    true,
  );

  // Tabs are switched by activities.js; move the answers after it runs.
  document.addEventListener('click', (event) => {
    const dialog = event.target.closest('#activity-register');
    if (dialog && event.target.closest('[role="tab"]')) setTimeout(() => placeAnswers(dialog));
  });
  // Focus moved to another form in the same tab: move the answers there.
  document.addEventListener('focusin', (event) => {
    const form = event.target.closest('#activity-register form[data-needs-answers]');
    if (!form || form === focusedForm) return;
    focusedForm = form;
    placeAnswers(form.closest('#activity-register'));
  });
  document.addEventListener('keydown', (event) => {
    const dialog = event.target.closest('#activity-register');
    if (dialog && event.target.closest('[role="tab"]')) setTimeout(() => placeAnswers(dialog));
  });
  // <details> "إضافة ضيف جديد" opened or closed ("toggle" doesn't bubble).
  document.addEventListener(
    'toggle',
    (event) => {
      const dialog = event.target.closest?.('#activity-register');
      if (!dialog) return;
      focusedForm = null; // the opened/closed form decides again
      placeAnswers(dialog);
    },
    true,
  );

  // Free the old form before HTMX replaces the dialog.
  document.addEventListener('htmx:beforeSwap', (event) => {
    if (event.detail.target?.id === 'modal-root') {
      formio?.destroy();
      formio = null;
      focusedForm = null;
    }
  });
  document.addEventListener('htmx:afterSettle', render);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
