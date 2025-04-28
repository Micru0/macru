import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle } from 'lucide-react'; // Example icons
import { cn } from '@/lib/utils';
import type { ProposedActionType } from '@/lib/types/action'; // Import the new type

// // Placeholder for the actual action type definition - REMOVED
// // TODO: Replace with the real Action type from Task 9.1
// interface Action {
//   id: string;
//   type: string;
//   parameters: Record<string, any>;
//   confirmation_required?: boolean; // Assuming from Task 9.1 schema
//   metadata?: {
//     riskLevel?: 'low' | 'medium' | 'high';
//     description?: string;
//     warnings?: string[];
//   };
// }

interface ActionConfirmationDialogProps {
  action: ProposedActionType | null; // Use the imported type
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (actionId: string) => void; // Callback when user confirms
  onCancel: () => void; // Callback when user cancels
}

export const ActionConfirmationDialog: React.FC<ActionConfirmationDialogProps> = ({
  action,
  isOpen,
  onOpenChange,
  onConfirm,
  onCancel,
}) => {
  if (!action) {
    return null; // Don't render if no action is provided
  }

  const riskLevel = action.riskLevel || 'medium'; // Use riskLevel from ProposedActionType
  const warnings = action.warnings || []; // Use warnings from ProposedActionType

  const handleConfirm = () => {
    onConfirm(action.id);
    onOpenChange(false); // Close dialog on confirm
  };

  const handleCancel = () => {
    onCancel();
    onOpenChange(false); // Close dialog on cancel
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Confirm Action: {action.type}</DialogTitle>
          <DialogDescription>
            {action.description || 'Please review the details below before proceeding.'} {/* Use description from ProposedActionType */}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Display Action Parameters - TODO: Improve formatting */}
          <div className="bg-muted p-3 rounded-md text-sm">
            <pre><code>{JSON.stringify(action.parameters, null, 2)}</code></pre>
          </div>

          {/* Display Warnings */}
          {warnings.length > 0 && (
            <div className="border-l-4 border-destructive p-3 bg-destructive/10 rounded-md">
              <h4 className="font-semibold text-destructive flex items-center">
                <AlertCircle className="h-4 w-4 mr-2" /> Warnings
              </h4>
              <ul className="list-disc list-inside text-sm text-destructive/90 mt-1">
                {warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            variant={riskLevel === 'high' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            // Potentially add extra confirmation for high risk?
          >
            <CheckCircle className="h-4 w-4 mr-2" /> Confirm & Execute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ActionConfirmationDialog; 