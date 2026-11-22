// Checks the components of a Form.io form against form-component.rules.ts.
// Returns the first problem as an Arabic message, or undefined if all is valid
// (same pattern as meetingDaysError in src/halaqas/dto/meeting-days.dto.ts).

import {
  ALLOWED_INPUT_TYPES,
  ALLOWED_LAYOUT_TYPES,
  COMPONENT_KEY_PATTERN,
  FORBIDDEN_PROPERTIES,
  FORBIDDEN_VALIDATE_PROPERTIES,
  MAX_DEPTH,
  MAX_LABEL_LENGTH,
  MAX_TOTAL_COMPONENTS,
} from './form-component.rules';

type UnknownObject = Record<string, unknown>;

// State shared by the whole tree while walking it.
interface WalkContext {
  seenKeys: Set<string>;
  count: number;
}

// The only option template allowed on a select (Form.io's default).
const DEFAULT_SELECT_TEMPLATE = '<span>{{ item.label }}</span>';

// Types whose options must be typed in by the admin (dataSrc "values").
const OPTION_TYPES: ReadonlySet<string> = new Set([
  'select',
  'radio',
  'selectboxes',
]);

// True only for a plain object: not null, not an array.
// As a type guard, TypeScript treats `value` as an object after a true check.
function isObject(value: unknown): value is UnknownObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A property that is present but does nothing ('' / false / [] / {}) is
// harmless: hand-written forms often include Form.io defaults like these.
function isSet(value: unknown): boolean {
  if (value === undefined || value === null || value === '' || value === false)
    return false;
  if (Array.isArray(value)) return value.length > 0;
  if (isObject(value)) return Object.keys(value).length > 0;
  return true;
}

export function validateFormComponents(
  components: unknown,
): string | undefined {
  if (!Array.isArray(components)) return 'حقول النموذج غير صالحة';

  return walk(components, 1, { seenKeys: new Set(), count: 0 });
}

// Checks a list of components and, through checkChildren, every list nested
// inside them. depth is 1 for the form's top-level components.
function walk(
  components: unknown[],
  depth: number,
  context: WalkContext,
): string | undefined {
  if (depth > MAX_DEPTH) {
    return `لا يمكن تداخل الحقول أكثر من ${MAX_DEPTH} مستويات`;
  }

  for (const component of components) {
    const error = checkComponent(component, depth, context);
    if (error) return error;
  }

  return undefined;
}

function checkComponent(
  component: unknown,
  depth: number,
  context: WalkContext,
): string | undefined {
  if (!isObject(component)) return 'حقول النموذج غير صالحة';

  context.count++;
  if (context.count > MAX_TOTAL_COMPONENTS) {
    return `يجب ألا يتجاوز عدد حقول النموذج ${MAX_TOTAL_COMPONENTS} حقلًا`;
  }

  // 1. Type: allowlist, so unknown or new Form.io types are rejected.
  const { type } = component;
  if (typeof type !== 'string') return 'يوجد حقل بلا نوع';
  if (!ALLOWED_INPUT_TYPES.has(type) && !ALLOWED_LAYOUT_TYPES.has(type)) {
    return `نوع الحقل غير مسموح: ${type}`;
  }

  // 2. Key: valid format and unique in the whole form (inside layouts too).
  const { key } = component;
  if (typeof key !== 'string' || !COMPONENT_KEY_PATTERN.test(key)) {
    return `مفتاح الحقل غير صالح في حقل من نوع ${type}: يجب أن يبدأ بحرف إنجليزي ويحتوي على حروف وأرقام و _ فقط`;
  }
  if (context.seenKeys.has(key)) return `مفتاح الحقل مكرر: ${key}`;
  context.seenKeys.add(key);

  // From here on, messages name the field by its key.
  const field = `الحقل "${key}"`;

  // 3. Label: optional text, limited length.
  const { label } = component;
  if (label !== undefined && typeof label !== 'string') {
    return `${field}: العنوان غير صالح`;
  }
  if (typeof label === 'string' && label.length > MAX_LABEL_LENGTH) {
    return `${field}: يجب ألا يتجاوز العنوان ${MAX_LABEL_LENGTH} حرف`;
  }

  // 4. Properties that run code, load outside data, or add raw attributes.
  for (const property of FORBIDDEN_PROPERTIES) {
    // A select may keep Form.io's default option template, nothing else.
    if (
      property === 'template' &&
      (component.template === undefined ||
        component.template === DEFAULT_SELECT_TEMPLATE)
    ) {
      continue;
    }
    if (isSet(component[property])) {
      return `${field}: الخاصية "${property}" غير مسموحة`;
    }
  }

  const error =
    checkValidate(component, field) ??
    checkConditional(component, field) ??
    checkTypeRules(component, type, field);
  if (error) return error;

  // 5. Children: only layout types may contain other components.
  return checkChildren(component, type, field, depth, context);
}

function checkValidate(
  component: UnknownObject,
  field: string,
): string | undefined {
  const { validate } = component;
  if (validate === undefined) return undefined;
  if (!isObject(validate)) return `${field}: قواعد التحقق غير صالحة`;

  for (const property of FORBIDDEN_VALIDATE_PROPERTIES) {
    if (isSet(validate[property])) {
      return `${field}: قاعدة التحقق "${property}" غير مسموحة`;
    }
  }

  return undefined;
}

// Simple conditions ({ show, when, eq }) are plain data and allowed;
// JSON Logic conditions are not.
function checkConditional(
  component: UnknownObject,
  field: string,
): string | undefined {
  const { conditional } = component;
  if (conditional === undefined) return undefined;
  if (!isObject(conditional)) return `${field}: شرط الإظهار غير صالح`;
  if (isSet(conditional.json)) {
    return `${field}: شروط JSON Logic غير مسموحة`;
  }

  return undefined;
}

function checkTypeRules(
  component: UnknownObject,
  type: string,
  field: string,
): string | undefined {
  // Several values per field change the shape of the submitted data.
  if (isSet(component.multiple)) {
    return `${field}: الإدخال المتعدد غير مسموح`;
  }

  if (type === 'button') {
    const { action } = component;
    if (action !== undefined && action !== 'submit') {
      return `${field}: الزر يجب أن يكون زر إرسال فقط`;
    }
  }

  if (type === 'textarea') {
    // A rich text editor would submit HTML instead of plain text.
    if (isSet(component.wysiwyg) || isSet(component.editor)) {
      return `${field}: محرر النصوص المنسقة غير مسموح`;
    }
  }

  if (type === 'email') {
    // Kickbox is a paid email verification service.
    if (isObject(component.kickbox) && isSet(component.kickbox.enabled)) {
      return `${field}: خدمة التحقق من البريد غير مسموحة`;
    }
  }

  if (OPTION_TYPES.has(type)) return checkOptions(component, type, field);

  return undefined;
}

// select keeps its options in data.values; radio and selectboxes in values.
function checkOptions(
  component: UnknownObject,
  type: string,
  field: string,
): string | undefined {
  const { dataSrc, data } = component;
  if (dataSrc !== undefined && dataSrc !== 'values') {
    return `${field}: يجب إدخال الخيارات يدويًا`;
  }

  if (data !== undefined && !isObject(data)) {
    return `${field}: بيانات الخيارات غير صالحة`;
  }
  for (const source of ['url', 'resource', 'json', 'custom']) {
    if (data && isSet(data[source])) {
      return `${field}: تحميل الخيارات من مصدر خارجي غير مسموح`;
    }
  }

  const options = type === 'select' ? data?.values : component.values;
  if (!Array.isArray(options) || options.length === 0) {
    return `${field}: يجب إضافة خيار واحد على الأقل`;
  }

  for (const option of options) {
    if (
      !isObject(option) ||
      typeof option.label !== 'string' ||
      typeof option.value !== 'string' ||
      option.label.trim() === '' ||
      option.value.trim() === ''
    ) {
      return `${field}: كل خيار يجب أن يحتوي على عنوان وقيمة`;
    }
    if (option.label.length > MAX_LABEL_LENGTH) {
      return `${field}: يجب ألا يتجاوز عنوان الخيار ${MAX_LABEL_LENGTH} حرف`;
    }
  }

  return undefined;
}

// panel/fieldset: children in components.
// columns: children in columns[i].components (two levels).
function checkChildren(
  component: UnknownObject,
  type: string,
  field: string,
  depth: number,
  context: WalkContext,
): string | undefined {
  if (!ALLOWED_LAYOUT_TYPES.has(type)) {
    if (component.components !== undefined || component.columns !== undefined) {
      return `${field}: هذا النوع لا يمكن أن يحتوي على حقول أخرى`;
    }
    return undefined;
  }

  if (type === 'columns') {
    const { columns } = component;
    if (!Array.isArray(columns) || columns.length === 0) {
      return `${field}: الأعمدة غير صالحة`;
    }
    for (const column of columns) {
      if (!isObject(column) || !Array.isArray(column.components)) {
        return `${field}: الأعمدة غير صالحة`;
      }
      const error = walk(column.components, depth + 1, context);
      if (error) return error;
    }
    return undefined;
  }

  const { components } = component;
  if (!Array.isArray(components)) return `${field}: محتوى المجموعة غير صالح`;
  return walk(components, depth + 1, context);
}
