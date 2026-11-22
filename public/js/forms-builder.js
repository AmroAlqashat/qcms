// Form builder page (views/forms/form-builder.hbs), used for create and edit.
//
// The server (validateFormComponents) is the real security check. This file
// only shapes the builder so admins aren't offered what the server rejects.
(() => {
  const page = document.querySelector('[data-form-builder]');
  if (!page || !window.Formio) return;

  // Same types as src/forms/helpers/form-component.rules.ts.
  const FIELD_TYPES = [
    'textfield',
    'textarea',
    'number',
    'email',
    'phoneNumber',
    'select',
    'radio',
    'selectboxes',
    'checkbox',
    'datetime',
    'button',
  ];
  const LAYOUT_TYPES = ['panel', 'fieldset', 'columns'];
  const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

  // Edit popup allowlist: per tab, the settings admins may change. Every
  // other setting, and the API / Logic / Layout tabs, are removed. An
  // allowlist also hides settings that future Form.io versions add.
  const KEEP = {
    display: [
      'label',
      'placeholder',
      'description',
      'tooltip',
      'rows',
      'inline',
      'title',
      'legend',
      'columns',
      'collapsible',
    ],
    data: ['defaultValue', 'data.values', 'values'],
    validation: [
      'validate.required',
      'validate.minLength',
      'validate.maxLength',
      'validate.min',
      'validate.max',
      'validate.minSelectedCount',
      'validate.maxSelectedCount',
      'datePicker.minDate',
      'datePicker.maxDate',
      'validate.customMessage',
    ],
    conditional: ['simple-conditional'],
    date: ['enableDate'],
    time: ['enableTime'],
  };

  // Kept settings that Form.io edits with a code editor (Ace, monospace and
  // left-to-right, loaded from a CDN). Admins type plain Arabic text here.
  // overrideEditForm makes these values replace Form.io's own.
  const PLAIN_TEXT = ['description', 'tooltip'].map((key) => ({
    key,
    overrideEditForm: true,
    editor: '',
    as: '',
    wysiwyg: false,
    rows: 2,
  }));

  // Builds Form.io's editForm override for one type: { key, ignore: true }
  // removes a tab or a setting (merged by key inside Form.io).
  function editFormOverrides(type) {
    const Component = Formio.Components.components[type];
    const tabs = Component?.editForm?.().components?.[0]?.components ?? [];

    return tabs.map((tab) => {
      const keep = KEEP[tab.key];
      const settings = tab.components ?? [];
      const removed = settings
        .filter((setting) => setting.key && !keep?.includes(setting.key))
        .map((setting) => ({ key: setting.key, ignore: true }));
      const changed = PLAIN_TEXT.filter((override) =>
        settings.some((setting) => setting.key === override.key && keep?.includes(setting.key)),
      );

      // The options table of radio / select boxes has a "Shortcut" column
      // (a keyboard key per option). It took most of the width, squeezing
      // Label and Value so much that Arabic was typed backwards.
      if (tab.key === 'data' && (type === 'radio' || type === 'selectboxes')) {
        changed.push({ key: 'values', components: [{ key: 'shortcut', ignore: true }] });
      }

      return keep && settings.length > removed.length
        ? { key: tab.key, components: [...removed, ...changed] }
        : { key: tab.key, ignore: true };
    });
  }

  // Labels a new field starts with (Form.io's are English, e.g. "Text Field").
  const DEFAULT_LABELS = {
    textfield: 'حقل نصي',
    textarea: 'نص طويل',
    number: 'رقم',
    email: 'البريد الإلكتروني',
    phoneNumber: 'رقم الجوال',
    select: 'قائمة منسدلة',
    radio: 'اختيار واحد',
    selectboxes: 'اختيارات متعددة',
    checkbox: 'مربع اختيار',
    datetime: 'التاريخ',
    button: 'إرسال',
    panel: 'لوحة',
    fieldset: 'مجموعة حقول',
    columns: 'أعمدة',
  };

  // A palette entry: Form.io's own info for the type, with an Arabic label.
  function paletteEntry(type) {
    const info = Formio.Components.components[type].builderInfo;
    const schema = { ...info.schema, label: DEFAULT_LABELS[type] };
    if (type === 'panel') schema.title = DEFAULT_LABELS[type];
    if (type === 'fieldset') schema.legend = DEFAULT_LABELS[type];
    if (type === 'button') schema.action = 'submit';
    return { ...info, schema };
  }

  // Form.io makes a key from the label. An Arabic label gives an Arabic key,
  // which the server rejects, so keep only English letters/digits and fall
  // back to the type (Form.io then adds a number: textfield1, textfield2...).
  const WebformBuilder = Formio.Builders.getBuilder('webform');
  const originalUpdateKey = WebformBuilder.prototype.updateComponentKey;
  WebformBuilder.prototype.updateComponentKey = function (data) {
    const key = String(originalUpdateKey.call(this, data) ?? '')
      .replace(/[^A-Za-z0-9_]/g, '')
      .replace(/^[^A-Za-z]+/, '');
    return KEY_PATTERN.test(key) ? key : data.type;
  };

  const nameForm = document.getElementById('form-builder-form');
  const nameInput = document.getElementById('form-name');
  const nameError = document.getElementById('form-name-error');
  const errorBox = page.querySelector('[data-form-error-box]');
  const errorMessage = page.querySelector('[data-form-error-message]');
  const saveButton = page.querySelector('[data-save-button]');
  const saveLabel = page.querySelector('[data-save-label]');
  const saveStatus = page.querySelector('[data-save-status]');
  const builderRoot = page.querySelector('[data-builder-root]');
  const previewRoot = page.querySelector('[data-preview-root]');
  const tabs = [...page.querySelectorAll('[data-builder-tab]')];
  const layout = page.querySelector('[data-builder-layout]');

  const schema = JSON.parse(page.querySelector('[data-form-schema]').textContent);
  schema.display = 'form';
  schema.components = Array.isArray(schema.components) ? schema.components : [];

  // Students need a way to send the form. Form.io's own default is English.
  const isSubmit = (c) => c.type === 'button' && (!c.action || c.action === 'submit');
  if (!schema.components.some(isSubmit)) {
    schema.components.push({
      type: 'button',
      label: 'إرسال',
      key: 'submit',
      action: 'submit',
      disableOnInvalid: true,
      theme: 'primary',
    });
  }

  let builder = null;
  let preview = null;
  let saving = false;
  let saved = false;

  const snapshot = () =>
    JSON.stringify({ name: nameInput.value.trim(), components: builder?.schema.components });
  let initialSnapshot = '';
  const isDirty = () => builder !== null && snapshot() !== initialSnapshot;

  function updateStatus() {
    saveStatus.textContent = isDirty() ? 'لديك تغييرات غير محفوظة' : 'لا توجد تغييرات غير محفوظة';
  }

  function showError(message) {
    errorMessage.textContent = message;
    errorBox.hidden = false;
    errorBox.focus();
    errorBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function showNameError(message) {
    nameError.textContent = message;
    nameError.hidden = false;
    nameInput.setAttribute('aria-invalid', 'true');
    nameInput.focus();
  }

  function clearErrors() {
    errorBox.hidden = true;
    errorMessage.textContent = '';
    nameError.hidden = true;
    nameError.textContent = '';
    nameInput.removeAttribute('aria-invalid');
  }

  function setSaving(value) {
    saving = value;
    saveButton.disabled = value;
    saveButton.setAttribute('aria-busy', String(value));
    saveLabel.textContent = value ? 'جارٍ الحفظ…' : 'حفظ النموذج';
  }

  Formio.builder(builderRoot, schema, {
    ...window.qcmsFormioI18n(),
    noDefaultSubmitButton: true,
    // No "Edit JSON" button: it lets admins type settings the server rejects.
    editJson: false,
    // No "Help" link to Form.io's English documentation.
    helplinks: 'false',
    // The palette stays in view with CSS (position: sticky in
    // assets/styles/form-builder.css), not Form.io's own scroll handling.
    sideBarScroll: false,
    builder: {
      basic: false,
      advanced: false,
      layout: false,
      data: false,
      premium: false,
      qcmsFields: {
        title: 'حقول الإدخال',
        weight: 0,
        default: true,
        components: Object.fromEntries(FIELD_TYPES.map((type) => [type, paletteEntry(type)])),
      },
      qcmsLayout: {
        title: 'التنسيق',
        weight: 10,
        components: Object.fromEntries(LAYOUT_TYPES.map((type) => [type, paletteEntry(type)])),
      },
    },
    editForm: Object.fromEntries(
      [...FIELD_TYPES, ...LAYOUT_TYPES].map((type) => [type, editFormOverrides(type)]),
    ),
  })
    .then((instance) => {
      builder = instance;
      builderRoot.removeAttribute('aria-busy');
      initialSnapshot = snapshot();
      builder.on('change', updateStatus);
    })
    .catch(() => {
      builderRoot.removeAttribute('aria-busy');
      showError('تعذر تحميل أداة البناء. حدّث الصفحة ثم حاول مرة أخرى.');
    });

  // Form.io writes these button labels in English directly in its templates
  // (not through t()), so the dictionary can't translate them. Set an Arabic
  // title (visible tooltip on hover) and aria-label (screen readers) on every
  // render: the builder redraws often, and the edit popup is added to <body>.
  const BUTTON_LABELS = {
    'component-settings-button-remove': 'حذف الحقل',
    'component-settings-button-copy': 'نسخ الحقل',
    'component-settings-button-paste': 'لصق أسفله',
    'component-settings-button-move': 'نقل الحقل',
    'component-settings-button-edit': 'تعديل الحقل',
    'formio-dialog-close': 'إغلاق النافذة',
  };
  const labelSelector = Object.keys(BUTTON_LABELS)
    .map((name) => `.${name}:not([data-ar-label])`)
    .join(',');

  function labelButtons() {
    document.querySelectorAll(labelSelector).forEach((button) => {
      const name = Object.keys(BUTTON_LABELS).find((key) => button.classList.contains(key));
      button.title = BUTTON_LABELS[name];
      button.setAttribute('aria-label', BUTTON_LABELS[name]);
      button.dataset.arLabel = '';
    });
  }
  new MutationObserver(labelButtons).observe(document.body, { childList: true, subtree: true });

  nameInput.addEventListener('input', () => {
    if (!nameError.hidden && nameInput.value.trim()) clearErrors();
    updateStatus();
  });

  // Tabs: Build / Preview. The preview is rebuilt from the latest schema.
  async function selectTab(name) {
    tabs.forEach((tab) => {
      const selected = tab.dataset.builderTab === name;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    });
    // CSS hides the palette and form area in preview mode. (The build panel
    // uses display: contents, which the hidden attribute does not override.)
    layout.dataset.mode = name;

    if (name !== 'preview' || !builder) return;
    const title = page.querySelector('[data-preview-title]');
    if (title) title.textContent = nameInput.value.trim() || 'نموذج بدون اسم';
    preview?.destroy();
    previewRoot.replaceChildren();
    preview = await Formio.createForm(previewRoot, builder.schema, {
      ...window.qcmsFormioI18n(),
      noAlerts: true,
    });
    preview.nosubmit = true;
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.builderTab));
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      // RTL: the next tab is on the left.
      const step = event.key === 'ArrowLeft' ? 1 : -1;
      const next = tabs[(index + step + tabs.length) % tabs.length];
      next.focus();
      selectTab(next.dataset.builderTab);
    });
  });

  nameForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving || !builder) return;
    clearErrors();

    const name = nameInput.value.trim();
    if (!name) {
      showNameError('اسم النموذج مطلوب');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(page.dataset.action, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          _csrf: page.dataset.csrf,
          name,
          form: { display: 'form', components: builder.schema.components },
        }),
      });
      const body = await response.json().catch(() => ({}));

      if (response.ok) {
        saved = true;
        window.location.assign(body.location || '/forms');
        return;
      }

      // 422 from ValidationPipe: { errors: { name?: string, form?: string } }
      const errors = body.errors ?? {};
      if (errors.name) showNameError(errors.name);
      const formError = errors.form ?? (errors.name ? null : body.message);
      if (formError) showError(formError);
      if (!errors.name && !formError) showError('تعذر حفظ النموذج. حاول مرة أخرى.');
    } catch {
      showError('تعذر الاتصال بالخادم. تحقق من اتصالك ثم حاول مرة أخرى.');
    }
    setSaving(false);
  });

  // Ctrl+S / Cmd+S saves, like a document editor.
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      nameForm.requestSubmit();
    }
  });

  window.addEventListener('beforeunload', (event) => {
    if (!saved && isDirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
})();
