import { ScriptStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class ListScriptsQueryDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsUUID()
  contentPlanId?: string;

  @IsOptional()
  @IsUUID()
  topicId?: string;

  @IsOptional()
  @IsEnum(ScriptStatus)
  status?: ScriptStatus;
}
