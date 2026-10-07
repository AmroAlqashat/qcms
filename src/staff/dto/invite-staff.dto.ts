import { IsEmail, IsString, MaxLength, MinLength, IsNotEmpty } from 'class-validator';

export class InviteStaffDto {
  @IsEmail({}, { message: 'أدخل بريدًا إلكترونيًا صالحًا' })
  @MaxLength(254, { message: 'يجب ألا يتجاوز البريد الإلكتروني 254 حرفًا' })
  @IsNotEmpty({ message: 'البريد الإلكتروني مطلوب' })
  email: string;

  @IsString({ message: 'الاسم الكامل يجب أن يكون نصًا' })
  @MinLength(2, { message: 'يجب ألا يقل الاسم الكامل عن حرفين' })
  @MaxLength(100, { message: 'يجب ألا يتجاوز الاسم الكامل 100 حرف' })
  @IsNotEmpty({ message: 'الاسم الكامل مطلوب' })
  fullName: string;

  @IsString({ message: 'المسمى الوظيفي يجب أن يكون نصًا' })
  @MinLength(2, { message: 'يجب ألا يقل المسمى الوظيفي عن حرفين' })
  @MaxLength(100, { message: 'يجب ألا يتجاوز المسمى الوظيفي 100 حرف' })
  @IsNotEmpty({ message: 'المسمى الوظيفي مطلوب' })
  jobTitle: string;
}
