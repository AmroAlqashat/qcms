// Runs right after the Form.io library, before any form or builder is created.
//
// Form.io downloads some libraries at runtime (e.g. the date picker) from
// cdn.form.io. Point it at our own copies instead (copied by
// scripts/build-formio-css.mjs), so no outside server is involved. A library
// we don't host fails to load rather than coming from somewhere else.
(() => {
  if (!window.Formio?.cdn) return;
  window.Formio.cdn.setBaseUrl(`${window.location.origin}/vendor/formio/cdn`);
})();
