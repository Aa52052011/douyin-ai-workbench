import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { METRICS_IMPORT_FORMATS, METRICS_IMPORT_MAX_ROWS } from '../import/import-file.constants.js';
import { ImportPublicationMetricsValuesDto } from './create-import-metrics.dto.js';

export class ConfirmMetricsImportRowDto {
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(10_000)
  rowNumber!: number;

  @IsUUID()
  publicationId!: string;

  @IsISO8601()
  observedAt!: string;

  @IsOptional()
  @IsISO8601()
  providerCollectedAt?: string | null;

  @ValidateNested()
  @Type(() => ImportPublicationMetricsValuesDto)
  @IsObject()
  metrics!: ImportPublicationMetricsValuesDto;
}

export class ConfirmMetricsImportDto {
  @IsUUID()
  projectId!: string;

  @IsString()
  @MaxLength(64)
  mappingVersion!: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  fileFingerprint!: string;

  @IsIn([...METRICS_IMPORT_FORMATS])
  format!: 'CSV' | 'XLSX';

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(METRICS_IMPORT_MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => ConfirmMetricsImportRowDto)
  rows!: ConfirmMetricsImportRowDto[];
}
