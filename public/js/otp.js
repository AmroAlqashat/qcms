(() => {
  const cooldowns = new Map();
  const initialize = () => {
    document.querySelectorAll('[data-otp-send]').forEach((form) => {
      if (form.dataset.initialized) return;
      form.dataset.initialized = 'true';
      const cleanup = new AbortController();
      const button = form.querySelector('[data-otp-send-button]');
      const countdown = form.querySelector('[data-otp-send-countdown]');
      const status = form.querySelector('[data-otp-send-status]');
      const key = `${form.action}:${form.querySelector('[name="email"]')?.value || ''}`;
      const alreadySent = form.hasAttribute('data-otp-already-sent');
      if (alreadySent && (cooldowns.get(key) || 0) <= Date.now())
        cooldowns.set(key, Date.now() + 60_000);
      let pending = false;
      let attempted = alreadySent || cooldowns.has(key);
      let timer;
      const render = () => {
        const seconds = Math.max(
          0,
          Math.ceil(((cooldowns.get(key) || 0) - Date.now()) / 1000),
        );
        button.disabled = pending || seconds > 0;
        button.textContent = pending
          ? 'جارٍ إرسال الرمز…'
          : attempted
            ? 'إعادة إرسال رمز التحقق'
            : 'إرسال رمز التحقق';
        countdown.hidden = seconds === 0;
        countdown.textContent =
          seconds > 0 ? `يمكنك إعادة الإرسال بعد ${seconds} ثانية.` : '';
      };
      form.addEventListener('htmx:beforeRequest', (event) => {
        if (event.detail.elt !== form) return;
        if (pending || (cooldowns.get(key) || 0) > Date.now()) {
          event.preventDefault();
          return;
        }
        pending = true;
        form.setAttribute('aria-busy', 'true');
        status.textContent = 'جارٍ إرسال الطلب…';
        render();
      });
      document.addEventListener(
        'htmx:beforeSwap',
        (event) => {
          if (event.detail.requestConfig?.elt === form)
            event.detail.shouldSwap = false;
        },
        { signal: cleanup.signal },
      );
      form.addEventListener('htmx:afterRequest', (event) => {
        if (event.detail.elt !== form) return;
        pending = false;
        form.removeAttribute('aria-busy');
        const xhr = event.detail.xhr;
        const success = xhr.status >= 200 && xhr.status < 300;
        if (success || xhr.status === 429) {
          attempted = true;
          cooldowns.set(key, Date.now() + 60_000);
        }
        status.textContent = success
          ? 'تم إرسال الطلب. تحقق من بريدك ومجلد الرسائل غير المرغوب فيها.'
          : xhr.status === 429
            ? 'انتظر دقيقة قبل إعادة المحاولة.'
            : xhr.status === 401 || xhr.status === 403
              ? 'حدّث الصفحة وتحقق من تسجيل الدخول ثم أعد المحاولة.'
              : 'تعذر إرسال الرمز. حاول مرة أخرى.';
        try {
          const body = JSON.parse(xhr.responseText);
          if (typeof body.message === 'string')
            status.textContent = body.message;
        } catch {
          /* Keep the fallback for non-JSON responses. */
        }
        render();
      });
      form.addEventListener('htmx:beforeCleanupElement', (event) => {
        if (event.detail.elt !== form) return;
        window.clearInterval(timer);
        cleanup.abort();
      });
      timer = window.setInterval(() => {
        if (!form.isConnected) {
          window.clearInterval(timer);
          cleanup.abort();
          return;
        }
        render();
      }, 1000);
      render();
    });
  };
  // Direct navigation renders a dialog outside modal-root. Replace it cleanly
  // when a later HTMX request supplies the next step or validation errors.
  document.addEventListener('htmx:beforeSwap', (event) => {
    const detail = event.detail;
    if (
      detail.target?.id !== 'modal-root' ||
      !detail.shouldSwap ||
      !detail.xhr.responseText.includes('<dialog')
    )
      return;
    document
      .querySelectorAll(
        '#account-otp-dialog, #change-email-dialog, #onboarding-otp-dialog',
      )
      .forEach((dialog) => {
        if (!dialog.closest('#modal-root')) {
          dialog.close();
          dialog.remove();
        }
      });
    const link = detail.requestConfig?.elt;
    if (link?.hasAttribute('data-replace-dialog'))
      link.closest('dialog')?.close();
  });
  document.addEventListener('htmx:afterSwap', initialize);
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
