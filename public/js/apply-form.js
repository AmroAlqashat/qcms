// Public apply page: the student's national ID and date of birth (our HTML)
// plus the activity's form (Form.io), sent together as JSON to the same URL.
//
// On submit:
//   1. the browser checks the student fields (required, maxlength)
//   2. Form.io checks its own fields (form.submit() rejects if invalid;
//      nosubmit = true stops it from sending anything itself)
//   3. POST { _csrf, nationalId, dateOfBirth, formAnswers }
//   4. 201 -> success message; 422 -> errors under the fields; 409 -> box
(() => {
  const FIELD_IDS = {
    nationalId: 'apply-national-id',
    dateOfBirth: 'apply-date-of-birth',
  };

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

  async function init() {
    const page = document.querySelector('[data-apply-page]');
    const root = document.querySelector('[data-apply-form]');
    const schemaElement = document.querySelector('[data-form-schema]');
    if (!page || !root || !schemaElement || !window.Formio) return;

    const errorBox = page.querySelector('[data-apply-error-box]');
    const errorMessage = page.querySelector('[data-apply-error-message]');
    const submitButton = page.querySelector('[data-apply-submit]');
    const submitLabel = page.querySelector('[data-apply-submit-label]');
    const success = document.querySelector('[data-apply-success]');

    let form;
    try {
      const schema = JSON.parse(schemaElement.textContent);
      schema.components = withoutButtons(schema.components);
      root.replaceChildren();
      form = await Formio.createForm(root, schema, {
        ...window.qcmsFormioI18n(),
        noAlerts: true,
      });
      form.nosubmit = true;
    } catch {
      const message = document.createElement('p');
      message.className = 'text-sm text-red-700';
      message.setAttribute('role', 'alert');
      message.textContent = 'تعذر تحميل النموذج. حدّث الصفحة وحاول مرة أخرى.';
      root.replaceChildren(message);
      root.removeAttribute('aria-busy');
      submitButton.disabled = true;
      return;
    }
    root.removeAttribute('aria-busy');

    function showError(message) {
      errorMessage.textContent = message;
      errorBox.hidden = false;
      errorBox.focus();
    }

    function setFieldError(name, message) {
      const input = document.getElementById(FIELD_IDS[name]);
      const error = document.getElementById(`${FIELD_IDS[name]}-error`);
      if (!input || !error) return;
      error.textContent = message ?? '';
      error.hidden = !message;
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }

    function clearErrors() {
      errorBox.hidden = true;
      Object.keys(FIELD_IDS).forEach((name) => setFieldError(name));
    }

    function setBusy(busy) {
      submitButton.disabled = busy;
      submitLabel.textContent = busy ? 'جارٍ الإرسال…' : 'إرسال التسجيل';
    }

    page.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearErrors();

      // 1. Student fields: the browser's own messages, first one focused.
      const fields = Object.values(FIELD_IDS).map((id) => document.getElementById(id));
      const invalid = fields.find((input) => !input.checkValidity());
      if (invalid) {
        invalid.reportValidity();
        return;
      }

      setBusy(true);

      // 2. The activity's form: Form.io shows its errors next to each field.
      let submission;
      try {
        submission = await form.submit();
      } catch {
        setBusy(false);
        root.querySelector('.has-error input, .has-error select, .has-error textarea')?.focus();
        return;
      }

      // 3. Send both parts together.
      const values = Object.fromEntries(
        Object.entries(FIELD_IDS).map(([name, id]) => [name, document.getElementById(id).value]),
      );
      try {
        const response = await fetch(page.dataset.action, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ _csrf: page.dataset.csrf, ...values, formAnswers: submission.data }),
        });
        const body = await response.json().catch(() => ({}));

        if (response.ok) {
          page.hidden = true;
          success.hidden = false;
          success.focus();
          return;
        }

        // 422: { errors: { nationalId?, dateOfBirth?, formAnswers? } } or { message }
        const errors = body.errors ?? {};
        let fieldError = false;
        Object.keys(FIELD_IDS).forEach((name) => {
          if (errors[name]) {
            setFieldError(name, errors[name]);
            fieldError = true;
          }
        });
        const message = errors.formAnswers ?? (fieldError ? null : body.message);
        if (message) showError(message);
        else if (fieldError) document.querySelector('[aria-invalid="true"]')?.focus();
        else showError('تعذر إرسال التسجيل. حاول مرة أخرى.');
      } catch {
        showError('تعذر الاتصال بالخادم. تحقق من اتصالك ثم حاول مرة أخرى.');
      }
      setBusy(false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
