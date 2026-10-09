// This file for custom client side js.

document.body.addEventListener('htmx:beforeSwap', (e) => {
  const status = e.detail.xhr.status;
  if (status === 409 || status === 422) {
    e.detail.shouldSwap = true;
    e.detail.isError = false;
  }
});

function openDialogs() {
  document
    .querySelectorAll('dialog[data-auto-open]:not([open])')
    .forEach((d) => d.showModal());
}

openDialogs(); // pages that load with a dialog already in them
document.body.addEventListener('htmx:afterSettle', openDialogs);
