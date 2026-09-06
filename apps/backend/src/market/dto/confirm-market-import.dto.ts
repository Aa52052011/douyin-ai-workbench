import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
import { MARKET_ITEM_KINDS } from '../market.constants.js';
import {
  MARKET_IMPORT_FORMATS,
  MARKET_IMPORT_MAPPING_VERSION,
  MARKET_IMPORT_MAX_ROWS,
  MARKET_IMPORT_ORIGINS,
  MARKET_IMPORT_SELECTION_METHODS,
} from '../import/market-import.constants.js';

export class ConfirmMarketImportRowDto {
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(10_000)
  rowNumber!: number;

  @IsObject()
  cells!: Record<string, unknown>;
}

export class ConfirmMarketImportDto {
  @IsIn([...MARKET_ITEM_KINDS])
  kind!: (typeof MARKET_ITEM_KINDS)[number];

  @IsOptional()
  @IsUUID()
  productBriefId?: string;

  @IsOptional()
  @IsISO8601()
  collectedAt?: string;

  @IsOptional()
  @IsBoolean()
  collectedAtAssumed?: boolean;

  @IsIn([MARKET_IMPORT_MAPPING_VERSION])
  mappingVersion!: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  fileFingerprint!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  normalizedItemsFingerprint?: string;

  @IsIn([...MARKET_IMPORT_FORMATS])
  format!: 'CSV' | 'XLSX';

  @IsObject()
  resolvedMapping!: Record<string, string>;

  @IsOptional()
  @IsIn([...MARKET_IMPORT_ORIGINS])
  origin?: (typeof MARKET_IMPORT_ORIGINS)[number];

  @IsOptional()
  @IsIn([...MARKET_IMPORT_SELECTION_METHODS])
  selectionMethod?: (typeof MARKET_IMPORT_SELECTION_METHODS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sampleScope?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceContext?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MARKET_IMPORT_MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => ConfirmMarketImportRowDto)
  rows!: ConfirmMarketImportRowDto[];
}
