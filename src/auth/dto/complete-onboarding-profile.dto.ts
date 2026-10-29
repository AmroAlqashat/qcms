import { Transform } from 'class-transformer';
import {
  IsDate,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  isISO8601,
} from 'class-validator';

export class CompleteOnboardingProfileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  jobTitle: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim()
      ? value.trim().toLowerCase()
      : undefined,
  )
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined,
  )
  nationalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined,
  )
  phone?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === '') return undefined;
    if (
      typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !isISO8601(value, { strict: true })
    ) {
      return new Date(NaN);
    }
    return new Date(`${value}T00:00:00.000Z`);
  })
  @IsDate()
  dateOfBirth?: Date;
}
