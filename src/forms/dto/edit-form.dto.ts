import { CreateFormDto } from './create-form.dto';

// Editing replaces the whole form, so it needs the same fields and rules.
export class EditFormDto extends CreateFormDto {}
