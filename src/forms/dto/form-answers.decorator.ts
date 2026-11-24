import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsObject } from 'class-validator';

// The answers to an activity's form. A JSON request sends an object; an HTML
// form (manual registration dialog) sends the same object as JSON text in a
// hidden input, so text is parsed first. Anything that isn't an object fails.
// The answers themselves are checked against the form in the service
// (validateFormAnswers).
export function FormAnswers() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => {
      if (typeof value !== 'string') return value;
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return value;
      }
    }),
    IsObject({ message: 'إجابات النموذج غير صالحة' }),
  );
}
