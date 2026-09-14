export const JOB_QUEUE = Symbol('JOB_QUEUE');

export const ACF_JOB_QUEUE_NAME = 'acf-jobs';

export function resolveJobQueueName(): string {
  const override = process.env.ACF_JOB_QUEUE_NAME?.trim();
  return override || ACF_JOB_QUEUE_NAME;
}

export const ACF_QUEUE_JOB_NAME = 'run';
