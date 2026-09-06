import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ListAgentRunsQueryDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  agentId?: string;
}
