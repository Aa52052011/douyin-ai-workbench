import { Global, Module } from '@nestjs/common';
import { UsageMeteringService } from './usage-metering.service.js';

@Global()
@Module({
  providers: [UsageMeteringService],
  exports: [UsageMeteringService],
})
export class UsageModule {}
