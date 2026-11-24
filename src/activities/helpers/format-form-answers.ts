// Turns a participant's saved answers into rows staff can read:
// the question's label, and the answer in words ("باص المركز", "نعم", an
// Arabic date) instead of stored values ("bus", true, an ISO string).
// Panels and fieldsets become titled sections; columns are flattened.

type UnknownObject = Record<string, unknown>;

type FormComponent = {
  key?: string;
  type?: string;
  label?: string;
  title?: string;
  legend?: string;
  input?: boolean;
  enableTime?: boolean;
  components?: FormComponent[];
  columns?: { components?: FormComponent[] }[];
  values?: { label?: string; value?: unknown }[];
  data?: { values?: { label?: string; value?: unknown }[] };
};

export type AnswerRow = { label: string; value: string };
export type AnswerSection = { title: string | null; rows: AnswerRow[] };

const EMPTY = '—';

function isObject(value: unknown): value is UnknownObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionLabel(component: FormComponent, value: unknown) {
  const options = component.values ?? component.data?.values ?? [];
  const option = options.find((o) => String(o.value) === String(value));
  return option?.label?.trim() || String(value);
}

function formatDate(value: string, withTime: boolean) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ar-JO', {
    dateStyle: 'long',
    ...(withTime ? { timeStyle: 'short' } : {}),
    timeZone: 'Asia/Amman',
  }).format(date);
}

function formatValue(component: FormComponent, value: unknown): string {
  if (value === undefined || value === null || value === '') return EMPTY;

  switch (component.type) {
    case 'checkbox':
      return value === true ? 'نعم' : 'لا';
    case 'radio':
    case 'select':
      return optionLabel(component, value);
    case 'selectboxes': {
      if (!isObject(value)) return EMPTY;
      // In the form's option order, not the order the answers were saved.
      const checked = (component.values ?? [])
        .filter((option) => value[String(option.value)] === true)
        .map((option) => option.label?.trim() || String(option.value));
      return checked.length ? checked.join('، ') : EMPTY;
    }
    case 'datetime':
      return typeof value === 'string'
        ? formatDate(value, component.enableTime !== false)
        : EMPTY;
    default:
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean')
        return String(value);
      return JSON.stringify(value);
  }
}

export function formatFormAnswers(
  form: unknown,
  answers: unknown,
): AnswerSection[] {
  const components =
    isObject(form) && Array.isArray(form.components)
      ? (form.components as FormComponent[])
      : [];
  const data = isObject(answers) ? answers : {};
  // isGroup: made from a panel/fieldset (top-level fields never join it).
  const sections: (AnswerSection & { isGroup: boolean })[] = [];

  // `group` is the panel/fieldset we are inside, or null at the top level.
  function walk(
    list: FormComponent[],
    group: (typeof sections)[number] | null,
  ) {
    for (const component of list) {
      if (component.type === 'panel' || component.type === 'fieldset') {
        const section = {
          title: component.title?.trim() || component.legend?.trim() || null,
          rows: [],
          isGroup: true,
        };
        sections.push(section);
        walk(component.components ?? [], section);
        continue;
      }
      if (component.type === 'columns') {
        for (const column of component.columns ?? [])
          walk(column.components ?? [], group);
        continue;
      }
      if (
        component.type === 'button' ||
        component.input === false ||
        !component.key
      )
        continue;

      // A top-level field after a panel starts a new untitled section, so
      // the order on screen matches the form.
      let target = group;
      if (!target) {
        const last = sections.at(-1);
        if (last && !last.isGroup) target = last;
        else {
          target = { title: null, rows: [], isGroup: false };
          sections.push(target);
        }
      }
      target.rows.push({
        label: component.label?.trim() || component.key,
        value: formatValue(component, data[component.key]),
      });
    }
  }

  walk(components, null);
  return sections
    .filter((section) => section.rows.length > 0)
    .map(({ title, rows }) => ({ title, rows }));
}
