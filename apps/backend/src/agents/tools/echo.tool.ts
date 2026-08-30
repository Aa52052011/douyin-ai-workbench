import { ErrorCode } from '../../common/errors/app-error.js';
import { AgentError } from '../agent.errors.js';
import type { AgentContext } from '../agent.types.js';
import type { AgentTool } from './tool.types.js';

export const echoTool: AgentTool = {
  name: 'echoTool',
  description: 'Returns the provided message. Used to verify ToolRegistry.',
  async execute(input: unknown, _context: AgentContext) {
    if (!isEchoInput(input)) {
      throw new AgentError(ErrorCode.TOOL_ERROR, 'echoTool requires { message: string }');
    }
    return { echoed: input.message };
  },
};

function isEchoInput(input: unknown): input is { message: string } {
  return (
    typeof input === 'object' &&
    input !== null &&
    'message' in input &&
    typeof (input as { message: unknown }).message === 'string'
  );
}
