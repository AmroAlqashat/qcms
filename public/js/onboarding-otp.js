(() => {
  const initialize = () => {
    const form = document.querySelector('[data-otp-send]');
    if (!form || form.dataset.initialized) return;
    form.dataset.initialized = 'true';

    const cleanup = new AbortController();
    const button = form.querySelector('[data-otp-send-button]');
    const countdown = form.querySelector('[data-otp-send-countdown]');
    const status = form.querySelector('[data-otp-send-status]');
    let availableAt = 0;
    let pending = false;
    let attempted = false;
    let timer;

    const render = () => {
      const seconds = Math.max(0, Math.ceil((availableAt - Date.now()) / 1000));
      button.disabled = pending || seconds > 0;
      button.textContent = pending
        ? 'جارٍ إرسال الرمز…'
        : attempted
          ? 'إعادة إرسال رمز التحقق'
          : 'إرسال رمز التحقق';
      countdown.hidden = seconds === 0;
      countdown.textContent =
        seconds > 0 ? `يمكنك إعادة الإرسال بعد ${seconds} ثانية.` : '';
      if (seconds === 0 && timer) {
        window.clearInterval(timer);
        timer = undefined;
        if (!pending) status.textContent += ' يمكنك الآن إعادة الإرسال.';
      }
    };

    form.addEventListener('htmx:beforeRequest', (event) => {
      if (event.detail.elt !== form) return;
      if (pending || Date.now() < availableAt) {
        event.preventDefault();
        return;
      }
      pending = true;
      attempted = true;
      availableAt = Date.now() + 60_000;
      form.setAttribute('aria-busy', 'true');
      status.textContent = 'جارٍ إرسال الطلب. انتظر دقيقة قبل إعادة الإرسال.';
      render();
      timer = window.setInterval(render, 250);
    });

    // Keep response HTML/JSON out of the verification form, including errors
    // that the app's global handler would otherwise swap into the page.
    document.addEventListener(
      'htmx:beforeSwap',
      (event) => {
        if (event.detail.requestConfig?.elt === form) {
          event.detail.shouldSwap = false;
        }
      },
      { signal: cleanup.signal },
    );

    form.addEventListener('htmx:afterRequest', (event) => {
      if (event.detail.elt !== form) return;
      pending = false;
      form.removeAttribute('aria-busy');
      const code = event.detail.xhr.status;
      if (code >= 200 && code < 300) {
        status.textContent =
          'تم إرسال طلب الرمز. تحقق من بريدك الإلكتروني ومجلد الرسائل غير المرغوب فيها.';
      } else if (code === 429) {
        status.textContent = 'طلبات كثيرة. انتظر قبل إعادة المحاولة.';
      } else if (code === 401 || code === 403) {
        status.textContent =
          'تعذّر إرسال الرمز. قد تكون الجلسة انتهت؛ سجّل الدخول مجددًا.';
      } else {
        status.textContent =
          'تعذّر إرسال طلب الرمز. يمكنك المحاولة مجددًا بعد انتهاء الانتظار.';
      }
      if (code >= 400 && code < 500) {
        try {
          const body = JSON.parse(event.detail.xhr.responseText);
          const message = typeof body.message === 'string' ? body.message : undefined;
          if (message) status.textContent = message;
        } catch {
          // Keep the fallback message for empty or non-JSON responses.
        }
      }
      render();
    });

    form.addEventListener('htmx:beforeCleanupElement', (event) => {
      if (event.detail.elt !== form) return;
      window.clearInterval(timer);
      cleanup.abort();
    });
    render();
  };

  document.addEventListener('htmx:afterSwap', initialize);
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
