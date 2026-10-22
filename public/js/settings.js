(() => {
  const initializeSettings = () => {
    const root = document.querySelector('[data-settings-page]');
    if (!root || root.dataset.initialized) return;
    root.dataset.initialized = 'true';
    const lifecycle = new AbortController();
    root.addEventListener(
      'htmx:beforeCleanupElement',
      (event) => {
        if (event.detail.elt === root) lifecycle.abort();
      },
      { signal: lifecycle.signal },
    );
    const form = root.querySelector('form');
    const currency = form.elements.currency;
    const registration = form.elements.registrationOpen;
    const feedback = root.querySelector('[data-settings-feedback]');
    const save = form.querySelector('button[type="submit"]');
    const reset = form.querySelector('[type="reset"]');
    let dirty = false;
    let submitting = false;

    const supported = (key, fallback) => {
      try {
        return Intl.supportedValuesOf(key);
      } catch {
        return fallback;
      }
    };
    let currencyNames;
    try {
      currencyNames = new Intl.DisplayNames(['ar'], { type: 'currency' });
    } catch {
      /* Codes remain usable. */
    }
    const populate = (select, values, label) => {
      const existing = new Map(
        [...select.options]
          .filter((o) => o.value)
          .map((o) => [o.value, o.text]),
      );
      values.forEach((value) => existing.set(value, label(value)));
      const initial = select.dataset.initialValue || '';
      select.replaceChildren(new Option('اختر من القائمة', ''));
      [...existing]
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([value, text]) => {
          select.add(
            new Option(text, value, value === initial, value === initial),
          );
        });
      select.value = initial;
    };
    populate(
      currency,
      supported('currency', ['JOD', 'SAR', 'AED', 'USD', 'EUR']),
      (value) => `${value} — ${currencyNames?.of(value) || value}`,
    );
    const fields = [...form.elements].filter((field) => field.name);
    const saved = JSON.parse(root.dataset.settingsInitial || '{}');
    const initial = new Map(
      fields.map((field) => [
        field.name,
        Object.hasOwn(saved, field.name) ? String(saved[field.name] ?? '') : '',
      ]),
    );
    for (const name of [
      'sessionInactivityTimeoutMinutes',
      'delegateAccessExpiryHours',
    ]) {
      form.elements[name].min = '1';
      form.elements[name].step = '1';
    }

    const previews = () => {
      let money = '';
      try {
        if (currency.value)
          money = `مثال عرض: ${new Intl.NumberFormat('ar-JO', { style: 'currency', currency: currency.value }).format(1234.5)}`;
      } catch {
        money = '';
      }
      root.querySelector('[data-currency-preview]').textContent = money;
      const changed = registration.value !== initial.get('registrationOpen');
      const states = {
        true: [
          'التسجيل مفتوح',
          'يمكن للزوار تقديم طلبات تسجيل جديدة عبر الرابط.',
        ],
        false: [
          'التسجيل مغلق',
          'لا يمكن للزوار تقديم طلبات تسجيل جديدة عبر الرابط.',
        ],
      };
      const [title, description] = states[registration.value] || [
        'اختر حالة رابط التسجيل',
        'اختر فتح التسجيل أو إغلاقه لعرض أثر الإعداد.',
      ];
      root.querySelector('[data-registration-title]').textContent = changed
        ? `${title} — تغيير غير محفوظ`
        : title;
      root.querySelector('[data-registration-description]').textContent =
        changed ? `بعد الحفظ: ${description}` : description;
    };
    const update = () => {
      submitting = false;
      form.elements.centerName.setCustomValidity(
        form.elements.centerName.value.trim() ? '' : 'أدخل اسم المركز.',
      );
      dirty = fields.some((field) => field.value !== initial.get(field.name));
      save.disabled = reset.disabled = !dirty;
      root.querySelector('[data-settings-dirty]').textContent = dirty
        ? 'لديك تغييرات غير محفوظة.'
        : 'لا توجد تغييرات غير محفوظة.';
      previews();
    };
    form.addEventListener('input', () => {
      feedback.hidden = true;
      update();
    });
    form.addEventListener('change', update);
    form.addEventListener('reset', (event) => {
      event.preventDefault();
      fields.forEach((field) => {
        field.value = initial.get(field.name);
        field.removeAttribute('aria-invalid');
      });
      root
        .querySelectorAll('[id$="-error"], [data-form-error]')
        .forEach((error) => {
          error.hidden = true;
        });
      feedback.hidden = true;
      update();
      form.elements.centerName.focus();
    });
    // Native validation runs before submit. Allow the backend or HTMX to handle it.
    // Suppress the navigation warning only when a normal submission proceeds.
    form.addEventListener('submit', (event) => {
      queueMicrotask(() => {
        submitting = !event.defaultPrevented;
      });
    });
    window.addEventListener(
      'beforeunload',
      (event) => {
        if (root.isConnected && dirty && !submitting) {
          event.preventDefault();
          event.returnValue = '';
        }
      },
      { signal: lifecycle.signal },
    );
    root.querySelectorAll('input, select, button').forEach((control) => {
      control.classList.add(
        'focus-visible:outline-2',
        'focus-visible:outline-offset-2',
        'focus-visible:outline-[#287a73]',
      );
    });
    update();
    const error = root.querySelector('[aria-invalid="true"]');
    if (error) error.focus({ preventScroll: true });
    else if (!feedback.hidden) feedback.focus({ preventScroll: true });
  };
  document.addEventListener('htmx:afterSwap', initializeSettings);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSettings);
  } else {
    initializeSettings();
  }
})();
