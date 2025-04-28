import { ActionRequest, ActionExecutor, ActionResult } from '@/lib/types/action';
import { LogMessageExecutor } from './action-executors/log-message-executor';

// Type for the registry mapping action types (strings) to executors
type ActionRegistry = {
  [actionType: string]: ActionExecutor;
};

export class ActionDispatcher {
  private registry: ActionRegistry = {};

  constructor() {
    // Instantiate and register all available action executors here
    this.registerExecutor('test.logMessage', new LogMessageExecutor());
    // this.registerExecutor('notion.createPage', new NotionCreatePageExecutor());
    // TODO: Add registration for other executors as they are created
  }

  /**
   * Registers an ActionExecutor for a specific action type.
   * @param actionType - The unique string identifying the action (e.g., 'test.logMessage').
   * @param executor - An instance of a class implementing ActionExecutor.
   */
  registerExecutor(actionType: string, executor: ActionExecutor): void {
    if (this.registry[actionType]) {
      console.warn(`[ActionDispatcher] Executor for action type '${actionType}' is being overwritten.`);
    }
    console.log(`[ActionDispatcher] Registering executor for type: ${actionType}`);
    this.registry[actionType] = executor;
  }

  /**
   * Dispatches an action request to the appropriate executor.
   * @param request - The validated ActionRequest object.
   * @param userId - The ID of the user making the request.
   * @returns Promise<ActionResult> - The result from the executor.
   */
  async dispatch(request: ActionRequest, userId: string): Promise<ActionResult> {
    const executor = this.registry[request.type];

    if (!executor) {
      console.error(`[ActionDispatcher] No executor found for action type: ${request.type}`);
      return {
        success: false,
        error: `Action type '${request.type}' is not supported.`,
      };
    }

    console.log(`[ActionDispatcher] Executing action '${request.type}' for user ${userId}`);
    try {
      // The executor is responsible for validating its specific parameters
      const result = await executor.execute(request.parameters, userId, request.metadata);
      console.log(`[ActionDispatcher] Action '${request.type}' execution result:`, result);
      // TODO: Add action logging here (success/failure, parameters, result)
      return result;
    } catch (error: any) {
      console.error(`[ActionDispatcher] Uncaught error during execution of '${request.type}':`, error);
      // TODO: Add action logging here (critical failure)
      return {
        success: false,
        error: `An unexpected error occurred while executing action '${request.type}': ${error.message || 'Unknown error'}`,
      };
    }
  }

  // TODO: Add methods for rollback handling if needed, coordinating with executor.rollback?
}

// Optional: Export a singleton instance if desired for easier use across the app
// export const actionDispatcher = new ActionDispatcher(); 