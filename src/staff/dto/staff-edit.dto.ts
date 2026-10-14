import { IsDate, IsEmail, IsNumberString, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class EditStaffDto {
    @IsEmail({}, { message: 'أدخل بريدًا إلكترونيًا صالحًا' })
      @MaxLength(254, { message: 'يجب ألا يتجاوز البريد الإلكتروني 254 حرفًا' })
      @IsOptional()
      email: string;
    
      @IsString({ message: 'الاسم الكامل يجب أن يكون نصًا' })
      @MinLength(2, { message: 'يجب ألا يقل الاسم الكامل عن حرفين' })
      @MaxLength(100, { message: 'يجب ألا يتجاوز الاسم الكامل 100 حرف' })
      @IsOptional()
      fullName: string;
    
      @IsString({ message: 'المسمى الوظيفي يجب أن يكون نصًا' })
      @MinLength(2, { message: 'يجب ألا يقل المسمى الوظيفي عن حرفين' })
      @MaxLength(100, { message: 'يجب ألا يتجاوز المسمى الوظيفي 100 حرف' })
      @IsOptional()
      jobTitle: string;

      @IsDate()
      @IsOptional()
      dateOfBirth: Date;

      @IsNumberString()
      @MaxLength(15)
      @IsOptional()
      phoneNumber: string;
}