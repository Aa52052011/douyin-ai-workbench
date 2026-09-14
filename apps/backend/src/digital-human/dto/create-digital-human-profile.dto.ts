import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateDigitalHumanProfileDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsUUID()
  sourceAssetId!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsBoolean()
  consentConfirmed!: boolean;
}
