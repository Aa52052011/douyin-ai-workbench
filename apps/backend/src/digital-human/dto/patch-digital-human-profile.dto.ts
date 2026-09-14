import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class PatchDigitalHumanProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsIn(['CONFIRMED', 'REVOKED'])
  consentStatus?: 'CONFIRMED' | 'REVOKED';

  @IsOptional()
  @IsIn(['DISABLED'])
  status?: 'DISABLED';
}
