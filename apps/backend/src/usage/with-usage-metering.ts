import { Logger } from '@nestjs/common';
import type { UsageMeteringService } from './usage-metering.service.js';
import type { CompleteUsageUnits, StartUsageInput } from './usage.types.js';

const logger = new Logger('withUsageMetering');

export async function withUsageMetering<T>(
  metering: UsageMeteringService | undefined,
  start: StartUsageInput,
  invoke: () => Promise<T>,
  complete: (result: T) => CompleteUsageUnits,
): Promise<T> {
  let eventId: string | undefined;
  if (metering) {
    try {
      eventId = (await metering.startUsage(start)).id;
    } catch (error) {
      logger.error(
        JSON.stringify({
          event: 'metering_start_failed',
          provider: start.provider,
          operationType: start.operationType,
          resourceType: start.resourceType,
        }),
      );
      void error;
    }
  }
  try {
    const result = await invoke();
    if (metering && eventId) {
      try {
        await metering.completeUsage(start.tenantId, eventId, complete(result));
      } catch (error) {
        logger.error(
          JSON.stringify({
            event: 'metering_complete_failed',
            usageEventId: eventId,
            provider: start.provider,
          }),
        );
        void error;
      }
    }
    return result;
  } catch (error) {
    if (metering && eventId) {
      try {
        await metering.failUsage(start.tenantId, eventId);
      } catch (meterError) {
        logger.error(
          JSON.stringify({
            event: 'metering_fail_failed',
            usageEventId: eventId,
            provider: start.provider,
          }),
        );
        void meterError;
      }
    }
    throw error;
  }
}
