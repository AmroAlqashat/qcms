// Security policy for Form.io components saved by the builder.
// validateFormComponents() checks every component against these rules.
// The builder page will use ALLOWED_*_TYPES to configure its sidebar.

// Components that collect a value (input: true) and need a unique key.
export const ALLOWED_INPUT_TYPES: ReadonlySet<string> = new Set([
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
]);

// Components that only group other components. Their key is not in the data.
export const ALLOWED_LAYOUT_TYPES: ReadonlySet<string> = new Set([
  'panel',
  'fieldset',
  'columns',
]);

// Properties that run JavaScript, load outside data, or add raw HTML/attributes.
export const FORBIDDEN_PROPERTIES: ReadonlySet<string> = new Set([
  'calculateValue',
  'customDefaultValue',
  'customConditional',
  'calculateServer',
  'allowCalculateOverride',
  'logic',
  'attributes',
  'addons',
  'template',
  'custom',
  'url',
  'headers',
  'oauthProvider',
]);

// Properties inside component.validate that run code or JSON Logic.
export const FORBIDDEN_VALIDATE_PROPERTIES: ReadonlySet<string> = new Set([
  'custom',
  'customPrivate',
  'json',
]);

// Limits
export const MAX_TOTAL_COMPONENTS = 100;
export const MAX_DEPTH = 4;
export const MAX_LABEL_LENGTH = 200;

// Starts with a letter; then letters, digits or _ (no dots: a dot means nesting).
export const COMPONENT_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
