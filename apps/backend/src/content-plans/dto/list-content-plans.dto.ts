import { IsUUID } from 'class-validator';

export class ListContentPlansQueryDto {
  @IsUUID()
  projectId!: string;
}
