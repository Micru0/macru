import { ActionExecutor, ActionResult } from '@/lib/types/action';
import { z } from 'zod';

// Define the specific parameters schema for this action
const logMessageParamsSchema = z.object({
  message: z.string().min(1),
  level: z.enum(['log', 'warn', 'error']).optional().default('log'),
});

export class LogMessageExecutor implements ActionExecutor {
  async execute(parameters: Record<string, any>, userId: string, metadata?: Record<string, any>): Promise<ActionResult> {
    try {
      // Validate specific parameters for this action
      const validatedParams = logMessageParamsSchema.parse(parameters);
      const { message, level } = validatedParams;

      const logPrefix = `[Action Log][User: ${userId}]`;
      const logMessage = `${logPrefix} ${message}`;

      // Execute the action (logging)
      switch (level) {
        case 'warn':
          console.warn(logMessage);
          break;
        case 'error':
          console.error(logMessage);
          break;
        case 'log':
        default:
          console.log(logMessage);
          break;
      }

      return {
        success: true,
        message: `Message logged successfully with level: ${level}`,
      };

    } catch (error: any) {
      console.error(`[LogMessageExecutor] Error:`, error);
      return {
        success: false,
        error: `Failed to execute logMessage action: ${error instanceof z.ZodError ? 'Invalid parameters' : error.message || 'Unknown error'}`,
        data: error instanceof z.ZodError ? error.errors : undefined,
      };
    }
  }
  
  // No rollback needed for simple logging
} 