export type JobQueuePayload = {
  jobId: string;
};

export interface JobQueue {
  enqueue(jobId: string): Promise<void>;
}
