import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateVoiceProfileDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsIn(['CUSTOM', 'CLONED'])
  type!: 'CUSTOM' | 'CLONED';

  @IsUUID()
  sampleAssetId!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsBoolean()
  consentConfirmed!: boolean;
}
