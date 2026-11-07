// This file for custom client side js.

function openDialogs() {
  document
    .querySelectorAll('dialog[data-auto-open]:not([open])')
    .forEach((d) => d.showModal());
}

document.querySelectorAll('[data-password-confirmation]').forEach((form) => {
  const password = form.querySelector('[name="newPassword"]');
  const confirmation = form.querySelector('[name="confirmPassword"]');
  const mismatch = form.querySelector('#password-mismatch-error');

  if (!password || !confirmation || !mismatch) {
    return;
  }

  const validateConfirmation = () => {
    const hasMismatch =
      confirmation.value.length > 0 && password.value !== confirmation.value;
    confirmation.setAttribute('aria-invalid', String(hasMismatch));
    mismatch.hidden = !hasMismatch;
    return !hasMismatch;
  };

  confirmation.addEventListener('input', validateConfirmation);
  password.addEventListener('input', () => {
    if (confirmation.value.length > 0) {
      validateConfirmation();
    }
  });

  form.addEventListener('submit', (event) => {
    if (!validateConfirmation()) {
      event.preventDefault();
      confirmation.focus();
    }
  });
});

openDialogs(); // pages that load with a dialog already in them
document.body.addEventListener('htmx:afterSettle', openDialogs);
