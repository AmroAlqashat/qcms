(() => {
  const toSeconds = (time) => {
    const [hours, minutes, seconds = 0] = time.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds;
  };

  function validate(form) {
    const rows = [...form.querySelectorAll('[data-meeting-day]')];
    let hasTime = false;
    let message = '';
    for (const row of rows) {
      const start = row.querySelector('[data-meeting-start]');
      const end = row.querySelector('[data-meeting-end]');
      start.setCustomValidity('');
      end.setCustomValidity('');
      start.required = Boolean(end.value);
      end.required = Boolean(start.value);
      hasTime ||= Boolean(start.value || end.value);
      if (!start.value && end.value) {
        start.setCustomValidity(
          `يرجى إدخال وقت البداية ليوم ${row.dataset.meetingDay}`,
        );
      } else if (start.value && !end.value) {
        end.setCustomValidity(
          `يرجى إدخال وقت النهاية ليوم ${row.dataset.meetingDay}`,
        );
      } else if (
        start.value &&
        end.value &&
        toSeconds(end.value) <= toSeconds(start.value)
      ) {
        end.setCustomValidity(
          `يجب أن يكون وقت النهاية بعد وقت البداية ليوم ${row.dataset.meetingDay}`,
        );
      }
      message ||= start.validationMessage || end.validationMessage;
    }
    if (!hasTime && rows.length) {
      message = 'يرجى تحديد موعد لقاء واحد على الأقل';
      rows[0].querySelector('[data-meeting-start]').setCustomValidity(message);
    }
    const feedback = form.querySelector('[data-meeting-feedback]');
    feedback.textContent = message;
    feedback.hidden = !message || !form.dataset.scheduleTouched;
  }

  function initialize() {
    document.querySelectorAll('[data-halaqa-form]').forEach(validate);
  }
  for (const eventName of ['input', 'change']) {
    document.addEventListener(eventName, (event) => {
      const form = event.target.closest('[data-halaqa-form]');
      if (!form || !event.target.closest('[data-meeting-day]')) return;
      form.dataset.scheduleTouched = 'true';
      validate(form);
    });
  }
  document.addEventListener(
    'invalid',
    (event) => {
      const form = event.target.closest('[data-halaqa-form]');
      if (!form) return;
      form.dataset.scheduleTouched = 'true';
      validate(form);
    },
    true,
  );
  document.addEventListener('DOMContentLoaded', initialize);
  document.addEventListener('htmx:afterSwap', initialize);
  initialize();
})();
