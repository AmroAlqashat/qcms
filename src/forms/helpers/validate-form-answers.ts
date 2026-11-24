// Checks a public applicant's answers against the activity's form on the
// server. The browser checks too, but anyone can POST anything to a public URL.
//
// 1. @formio/core runs the form's own rules (required, min/max, dates...) and
//    drops any key that isn't a field of the form.
// 2. Our own check makes sure each value has the right type for its field
//    (Form.io accepts e.g. an object for a text field) and is one of the
//    field's options for radio/select/selectboxes.

import { processSync, Processors, Utils } from '@formio/core';

type UnknownObject = Record<string, unknown>;

type FormComponent = {
  key: string;
  type: string;
  label?: string;
  input?: boolean;
  multiple?: boolean;
  values?: { value: unknown }[];
  data?: { values?: { value: unknown }[] };
};

type FormAnswersResult =
  { error: string } | { answers: UnknownObject; error?: undefined };

// Long enough for any real answer, short enough to keep rows small.
const MAX_TEXT_LENGTH = 2000;

const TEXT_TYPES = new Set([
  'textfield',
  'textarea',
  'email',
  'phoneNumber',
  'datetime',
]);

function isObject(value: unknown): value is UnknownObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// An option value is a string, number or boolean, never an object.
function isOption(options: Set<string>, value: unknown) {
  return (
    (typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean') &&
    options.has(String(value))
  );
}

function isEmpty(value: unknown) {
  return value === undefined || value === null || value === '';
}

// Options typed in the builder: radio/selectboxes use `values`, select uses
// `data.values`. Compared as strings, like Form.io does.
function optionValues(component: FormComponent) {
  const options = component.values ?? component.data?.values ?? [];
  return new Set(options.map((option) => String(option.value)));
}

function isValidValue(component: FormComponent, value: unknown) {
  if (isEmpty(value)) return true; // required is checked by @formio/core

  if (TEXT_TYPES.has(component.type))
    return typeof value === 'string' && value.length <= MAX_TEXT_LENGTH;

  switch (component.type) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'checkbox':
      return typeof value === 'boolean';
    case 'radio':
      return isOption(optionValues(component), value);
    case 'select': {
      const options = optionValues(component);
      if (component.multiple)
        return Array.isArray(value) && value.every((v) => isOption(options, v));
      return isOption(options, value);
    }
    case 'selectboxes': {
      const options = optionValues(component);
      return (
        isObject(value) &&
        Object.entries(value).every(
          ([option, checked]) =>
            options.has(option) && typeof checked === 'boolean',
        )
      );
    }
    default:
      return false;
  }
}

function fieldName(component: FormComponent) {
  return component.label?.trim() || component.key;
}

export function validateFormAnswers(
  form: unknown,
  answers: UnknownObject,
): FormAnswersResult {
  if (!isObject(form) || !Array.isArray(form.components))
    return { error: 'نموذج التسجيل غير صالح' };

  const components = form.components as FormComponent[];
  const errors: {
    ruleName?: string;
    context?: { component?: FormComponent };
  }[] = [];
  const context = {
    form,
    submission: { data: structuredClone(answers) },
    data: structuredClone(answers),
    components,
    processors: Processors,
    scope: { errors },
    config: { server: true },
  };
  processSync(context as Parameters<typeof processSync>[0]);

  const [first] = errors;
  if (first) {
    const name = first.context?.component
      ? fieldName(first.context.component)
      : 'أحد الحقول';
    return {
      error:
        first.ruleName === 'required'
          ? `${name} مطلوب`
          : `قيمة «${name}» غير صالحة`,
    };
  }

  // Only the fields' values are kept: the submit button's key is dropped too.
  const data = context.data;
  const cleaned: UnknownObject = {};
  let typeError: string | undefined;
  // @formio/core's own Component type is wider than ours; we only read these.
  type EachComponent = Parameters<typeof Utils.eachComponent>[0];
  Utils.eachComponent(components as unknown as EachComponent, (each) => {
    const component = each as unknown as FormComponent;
    if (typeError || component.input === false || component.type === 'button')
      return;
    if (!(component.key in data)) return;
    const value = data[component.key];
    if (!isValidValue(component, value)) {
      typeError = `قيمة «${fieldName(component)}» غير صالحة`;
      return;
    }
    cleaned[component.key] = value;
  });

  return typeError ? { error: typeError } : { answers: cleaned };
}
