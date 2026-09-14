import { IsArray, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class ApproveCropDto {
  @IsString()
  schemaVersion!: string;

  @IsUUID()
  sessionId!: string;

  @IsUUID()
  assetId!: string;

  @IsString()
  candidateId!: string;

  @IsString()
  candidateVersion!: string;

  @IsString()
  reviewPacketVersion!: string;

  @IsString()
  previewRef!: string;

  @IsString()
  previewVersion!: string;

  @IsString()
  backgroundTreatmentSelection!: string;

  @IsArray()
  @IsString({ each: true })
  acceptedWarnings!: string[];

  @IsIn(['APPROVE'])
  explicitAction!: 'APPROVE';

  @IsString()
  clientActionId!: string;

  @IsIn(['USER_UI_ACTION'])
  approvalSource!: 'USER_UI_ACTION';
}

export class RejectCropDto {
  @IsString()
  reason!: string;
}

export class RequestChangesCropDto {
  @IsString()
  request!: string;
}

export class PatchBackgroundDto {
  @IsString()
  backgroundTreatment!: string;
}

export class PatchChecklistDto {
  @IsString()
  itemId!: string;

  @IsIn(['CONFIRMED_HUMAN', 'PENDING_HUMAN'])
  interaction!: 'CONFIRMED_HUMAN' | 'PENDING_HUMAN';
}

export class RequestPreviewDto {
  @IsOptional()
  @IsIn(['REQUEST_RENDER', 'ATTACH_SYNTHETIC_READY'])
  intent?: 'REQUEST_RENDER' | 'ATTACH_SYNTHETIC_READY';

  @IsOptional()
  @IsString()
  clientRequestId?: string;

  @IsOptional()
  @IsString()
  solidColor?: string;

  @IsOptional()
  @IsUUID()
  staticImageAssetId?: string;
}

export class AuthorizeExecutionDto {
  @IsUUID()
  approvalId!: string;

  @IsOptional()
  @IsUUID()
  reviewSessionId?: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;

  @IsOptional()
  @IsString()
  candidateId?: string;

  @IsOptional()
  @IsString()
  candidateVersion?: string;

  @IsOptional()
  @IsString()
  previewVersion?: string;

  @IsOptional()
  @IsString()
  backgroundTreatment?: string;

  @IsOptional()
  @IsString()
  executionPlanVersion?: string;

  @IsString()
  clientRequestId!: string;
}
