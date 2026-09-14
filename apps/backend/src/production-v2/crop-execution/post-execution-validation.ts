import { FFMPEG_EXECUTION_VALIDATION_VERSION, type FFmpegExecutionValidationResultV1 } from './execution-plan.types.js';

export function notRunPostExecutionValidation(): FFmpegExecutionValidationResultV1 {
  return {
    schemaVersion: FFMPEG_EXECUTION_VALIDATION_VERSION,
    status: 'NOT_RUN',
    exitCode: null,
    outputExists: false,
    width: null,
    height: null,
    durationWithinTolerance: null,
    videoStreamExists: null,
    audioPolicyRespected: null,
    decodeProbePass: null,
  };
}
