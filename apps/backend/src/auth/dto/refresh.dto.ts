import { IsOptional, IsString } from 'class-validator';

/** 桌面端 / 测试可走 body；浏览器优先 Cookie。 */
export class RefreshDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
