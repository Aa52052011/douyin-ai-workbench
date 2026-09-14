export class InferenceCallGuard {
  private count = 0;

  constructor(private readonly maxCalls = 1) {}

  get calls(): number {
    return this.count;
  }

  beforeCall(): void {
    if (this.count >= this.maxCalls) {
      throw new Error('SMOKE_INFERENCE_LIMIT_EXCEEDED');
    }
    this.count += 1;
  }
}
