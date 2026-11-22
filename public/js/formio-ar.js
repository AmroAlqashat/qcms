// Arabic translations for Form.io (builder, edit popup, and the form students fill).
//
// How it works: Form.io never shows text directly. It calls t('key'), and t()
// looks the key up in the dictionary of the current language. Missing keys
// fall back to English, so a missing entry shows up as English text.
//
// Keys are either Form.io's own ids ('save', 'required') or the English text
// itself ('Label', 'Text Field'). Keep {{placeholders}} as they are: Form.io
// replaces them, e.g. '{{field}} مطلوب' -> 'الاسم مطلوب'.
//
// Usage: Formio.builder(el, form, { ...window.qcmsFormioI18n() })
(() => {
  const ar = {
    // Builder
    dragAndDropComponent: 'اسحب حقلًا وأفلته هنا',
    searchFields: 'ابحث عن حقل',
    noMatchesFound: 'لا توجد نتائج',
    save: 'حفظ',
    cancel: 'إلغاء',
    remove: 'حذف',
    edit: 'تعديل',
    copy: 'نسخ',
    pasteBelow: 'لصق بالأسفل',
    move: 'نقل',
    editJson: 'تعديل JSON',
    help: 'مساعدة',
    // The edit popup title is "<type> <component>" ("Text Field Component").
    // Arabic reads better with the type alone: "حقل نصي". A space, not '':
    // t() treats '' as missing and would show the key "component".
    component: ' ',
    preview: 'معاينة',
    showPreview: 'إظهار المعاينة',
    hidePreview: 'إخفاء المعاينة',
    close: 'إغلاق',
    confirmComponentRemove: 'هل تريد حذف هذا الحقل؟',
    confirmComponentRemoveWithChildren:
      'حذف هذا العنصر سيحذف كل الحقول التي بداخله أيضًا. هل تريد المتابعة؟',
    yes: 'نعم',
    no: 'لا',
    add: 'إضافة',
    addOrRemove: 'إضافة أو حذف',
    addAnother: 'إضافة آخر',
    delete: 'حذف',
    saveBtnDescription: 'زر الحفظ. اضغط لحفظ التغييرات والعودة إلى النموذج.',
    cancelBtnDescription: 'زر الإلغاء. اضغط لإلغاء التغييرات والعودة إلى النموذج.',
    closeBtnDescription: 'زر الإغلاق. اضغط للعودة إلى النموذج.',
    // Hidden text read by screen readers on number-only settings.
    numericOnly: 'أرقام فقط',
    // Column size names (Bootstrap breakpoints) in the Columns settings.
    xs: 'صغير جدًا',
    sm: 'صغير',
    md: 'متوسط',
    lg: 'كبير',
    xl: 'كبير جدًا',

    // Palette: component names
    'Text Field': 'حقل نصي',
    'Text Area': 'نص طويل',
    Number: 'رقم',
    Email: 'بريد إلكتروني',
    'Phone Number': 'رقم الجوال',
    Select: 'قائمة منسدلة',
    Radio: 'اختيار واحد',
    'Select Boxes': 'اختيارات متعددة',
    Checkbox: 'مربع اختيار',
    'Date / Time': 'التاريخ والوقت',
    Button: 'زر',
    Panel: 'لوحة',
    'Field Set': 'مجموعة حقول',
    Columns: 'أعمدة',
    Submit: 'إرسال',

    // Edit popup: tabs
    Display: 'العرض',
    Data: 'البيانات',
    Validation: 'التحقق',
    Conditional: 'الإظهار المشروط',
    Date: 'التاريخ',
    Time: 'الوقت',

    // Edit popup: fields
    Label: 'العنوان',
    'Field Label': 'عنوان الحقل',
    'The label for this field that will appear next to it.':
      'العنوان الذي يظهر بجانب هذا الحقل.',
    'The label for this field.': 'عنوان هذا الحقل.',
    Placeholder: 'نص توضيحي',
    'The placeholder text that will appear when this field is empty.':
      'نص يظهر داخل الحقل وهو فارغ.',
    Description: 'الوصف',
    'The description is text that will appear below the input field.':
      'نص يظهر أسفل الحقل.',
    'Description for this field.': 'وصف هذا الحقل.',
    Tooltip: 'تلميح',
    'Adds a tooltip to the side of this field.':
      'يضيف أيقونة تلميح بجانب الحقل.',
    'To add a tooltip to this field, enter text here.':
      'اكتب نص التلميح هنا.',
    Rows: 'عدد الأسطر',
    'This allows control over how many rows are visible in the text area.':
      'عدد الأسطر الظاهرة في مربع النص.',
    'Enter the amount of rows': 'أدخل عدد الأسطر',
    'Inline Layout': 'عرض الخيارات في سطر واحد',
    'Displays the checkboxes/radios horizontally.':
      'يعرض الخيارات بجانب بعضها بدل عرضها تحت بعضها.',
    Title: 'العنوان',
    'Panel Title': 'عنوان اللوحة',
    'The title text that appears in the header of this panel.':
      'العنوان الذي يظهر أعلى اللوحة.',
    Collapsible: 'قابلة للطي',
    'If checked, this will turn this Panel into a collapsible panel.':
      'عند التفعيل يمكن للطالب طي اللوحة وفتحها.',
    Legend: 'العنوان',
    'The legend for this Fieldset.': 'العنوان الذي يظهر أعلى المجموعة.',
    'Column Properties': 'إعدادات الأعمدة',
    'The size and width settings for each column. One row is equal to 12. (e.g., a row with two columns spanning the entire page should be 6 and 6)':
      'عرض كل عمود. السطر الكامل يساوي 12 (مثال: عمودان متساويان = 6 و 6).',
    'Add Column': 'إضافة عمود',
    Size: 'المقاس',
    Width: 'العرض',
    'Default Value': 'القيمة الافتراضية',
    'The Default Value will be the value for this field, before user interaction. Having a default value will override the placeholder text.':
      'قيمة الحقل قبل أن يغيّرها الطالب. تحل محل النص التوضيحي.',
    'Data Source Values': 'الخيارات',
    'Values to use as the data source. Labels are shown in the select field. Values are the corresponding values saved with the submission.':
      'العنوان هو ما يراه الطالب، والقيمة هي ما يُحفظ مع الطلب.',
    Values: 'الخيارات',
    'The radio button values that can be picked for this field. Values are text submitted with the form data. Labels are text that appears next to the radio buttons on the form.':
      'العنوان هو ما يراه الطالب، والقيمة هي ما يُحفظ مع الطلب.',
    Value: 'القيمة',
    Shortcut: 'اختصار',
    'The shortcut key for this option.': 'مفتاح اختصار لهذا الخيار.',
    Required: 'مطلوب',
    'A required field must be filled in before the form can be submitted.':
      'لا يمكن إرسال النموذج قبل تعبئة هذا الحقل.',
    'Minimum Length': 'أقل عدد من الأحرف',
    'The minimum length requirement this field must meet.':
      'أقل عدد من الأحرف المسموح به.',
    'Maximum Length': 'أكبر عدد من الأحرف',
    'The maximum length requirement this field must meet.':
      'أكبر عدد من الأحرف المسموح به.',
    'Minimum Value': 'أقل قيمة',
    'The minimum value this field must have before the form can be submitted.':
      'أقل رقم مسموح به.',
    'Maximum Value': 'أكبر قيمة',
    'The maximum value this field can have before the form can be submitted.':
      'أكبر رقم مسموح به.',
    'Minimum checked number': 'أقل عدد من الاختيارات',
    'Minimum checkboxes required before form can be submitted.':
      'أقل عدد من الخيارات يجب أن يختاره الطالب.',
    'Maximum checked number': 'أكبر عدد من الاختيارات',
    'Maximum checkboxes possible before form can be submitted.':
      'أكبر عدد من الخيارات يمكن أن يختاره الطالب.',
    'Minimum Date': 'أقدم تاريخ',
    "The minimum date that can be picked. You can also use Moment.js functions. For example: moment().subtract(10, 'days')":
      'أقدم تاريخ يمكن اختياره.',
    'Maximum Date': 'أحدث تاريخ',
    "The maximum date that can be picked. You can also use Moment.js functions. For example: moment().add(10, 'days')":
      'أحدث تاريخ يمكن اختياره.',
    'Custom Error Message': 'رسالة خطأ مخصصة',
    'Error message displayed if any error occurred.':
      'رسالة تظهر للطالب بدل رسائل الخطأ الافتراضية.',
    'Enable Date Input': 'تفعيل إدخال التاريخ',
    'Enables date input for this field.': 'يسمح باختيار التاريخ.',
    'Enable Time Input': 'تفعيل إدخال الوقت',
    'Enables time input for this field.': 'يسمح باختيار الوقت.',
    Simple: 'شرط بسيط',
    'This component should Display:': 'هل يظهر هذا الحقل؟',
    True: 'نعم',
    False: 'لا',
    'When the form component:': 'عندما يكون الحقل:',
    'Has the value:': 'قيمته:',

    // Messages students see while filling the form
    required: '{{field}} مطلوب',
    pattern: '{{field}} لا يطابق النمط المطلوب',
    minLength: 'يجب أن يحتوي {{field}} على {{length}} أحرف على الأقل.',
    maxLength: 'يجب ألا يتجاوز {{field}} {{length}} حرفًا.',
    min: 'يجب ألا يقل {{field}} عن {{min}}.',
    max: 'يجب ألا يزيد {{field}} عن {{max}}.',
    minDate: 'يجب ألا يكون {{field}} قبل {{minDate}}',
    maxDate: 'يجب ألا يكون {{field}} بعد {{maxDate}}',
    minSelectedCount: 'يجب اختيار {{minCount}} خيارات على الأقل',
    maxSelectedCount: 'يمكنك اختيار {{maxCount}} خيارات كحد أقصى',
    minSelectItems: 'يجب اختيار {{minCount}} خيارات على الأقل',
    maxSelectItems: 'يمكنك اختيار {{maxCount}} خيارات كحد أقصى',
    invalid_email: 'يجب أن يكون {{field}} بريدًا إلكترونيًا صحيحًا.',
    invalid_date: '{{field}} ليس تاريخًا صحيحًا.',
    invalid_day: '{{field}} ليس يومًا صحيحًا.',
    invalidOption: 'قيمة {{field}} غير صالحة.',
    valueIsNotAvailable: 'قيمة {{ field }} غير صالحة.',
    select: '{{field}} يحتوي على اختيار غير صالح',
    mask: '{{field}} لا يطابق الصيغة المطلوبة.',
    unique: '{{field}} يجب أن يكون فريدًا',
    time: 'وقت غير صالح',
    error: 'يرجى تصحيح الأخطاء التالية قبل الإرسال.',
    submitError: 'يرجى مراجعة النموذج وتصحيح الأخطاء قبل الإرسال.',
    errorsListNavigationMessage: 'اضغط للانتقال إلى الحقل الذي فيه الخطأ.',
    complete: 'تم الإرسال',
    submit: 'إرسال',
    submitButtonAriaLabel: 'زر الإرسال. اضغط لإرسال النموذج',

    // Select boxes and dropdowns
    typeToSearch: 'اكتب للبحث',
    noResultsFound: 'لا توجد نتائج',
    noChoices: 'لا توجد خيارات',
    loading: 'جارٍ التحميل',

    // Counters
    typeRemaining: 'متبقٍ {{ remaining }} {{ type }}.',
    typeCount: '{{ count }} {{ type }}',
    words: 'كلمات',
    characters: 'أحرف',
  };

  // A fresh object each time: Form.io writes into the options it receives.
  window.qcmsFormioI18n = () => ({ language: 'ar', i18n: { ar: { ...ar } } });
})();
