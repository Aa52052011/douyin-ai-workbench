import { IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class ExecuteAgentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  agentId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  agentVersion?: string;

  @IsUUID()
  projectId!: string;

  @IsObject()
  input!: Record<string, unknown>;
}
