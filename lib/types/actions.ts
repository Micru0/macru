/**
 * Defines the risk level associated with executing an action.
 */
export enum ActionRiskLevel {
  LOW = 'low',      // e.g., Creating or updating a document, simple queries
  MEDIUM = 'medium',  // e.g., Deleting content, sharing information
  HIGH = 'high'       // e.g., Modifying permissions, deleting accounts, external API calls with cost
}

/**
 * Maps known action types (strings) to their assessed risk level.
 * This map should be updated as new actions are implemented.
 */
export const ACTION_RISK_MAP: Record<string, ActionRiskLevel> = {
  // Placeholder actions based on PRD examples - update with actual action types
  'create-document': ActionRiskLevel.LOW,
  'update-document': ActionRiskLevel.LOW,
  'query-document': ActionRiskLevel.LOW,
  'summarize-text': ActionRiskLevel.LOW,

  'delete-document': ActionRiskLevel.MEDIUM,
  'share-document': ActionRiskLevel.MEDIUM, // Assuming sharing with specific users/emails
  'send-email-draft': ActionRiskLevel.MEDIUM,

  'change-permissions': ActionRiskLevel.HIGH,
  'delete-account': ActionRiskLevel.HIGH,
  'schedule-calendar-event': ActionRiskLevel.MEDIUM, // Could be HIGH depending on calendar access scope
  'create-notion-page': ActionRiskLevel.MEDIUM, // Potential data exposure risk
  'external-api-call': ActionRiskLevel.HIGH, // Generic high-risk action
  
  // Add other specific action types here as they are defined
};

/**
 * Represents the basic structure of an action that can be proposed or executed.
 * More specific action types can extend this interface.
 */
export interface BaseAction {
  id: string; // Unique identifier for this action instance
  type: string; // The type of action (e.g., 'create-document', key in ACTION_RISK_MAP)
  parameters: Record<string, any>; // Parameters specific to the action type
  confirmationRequired?: boolean; // Whether user confirmation is needed (runtime check)
  status?: 'proposed' | 'pending' | 'executing' | 'completed' | 'failed' | 'rejected';
  timestamp?: string; // When the action was proposed or executed
  result?: any; // Result of the action execution
  error?: string; // Error message if the action failed
}

// Example of a more specific action type
export interface CreateDocumentAction extends BaseAction {
  type: 'create-document';
  parameters: {
    title: string;
    content: string;
    folderId?: string;
  };
}

// Add other specific action interfaces as needed...

export {}; // Ensure this file is treated as a module 