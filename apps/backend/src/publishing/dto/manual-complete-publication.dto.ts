import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ManualCompletePublicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  externalPostId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  externalUrl?: string;
}
