import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from '@/components/ui/button';
import { Sparkles, Ban, Check } from 'lucide-react'; // Example icons
import { cn } from '@/lib/utils';
import type { ProposedActionType } from '@/lib/types/action'; // Import the new type

// // Placeholder for the actual action type definition - REMOVED
// // TODO: Replace with the real Action type from Task 9.1
// interface Action {
//   id: string;
//   type: string;
//   parameters: Record<string, any>;
//   metadata?: {
//     description?: string;
//     riskLevel?: 'low' | 'medium' | 'high';
//   };
// }

interface ProposedActionProps {
  action: ProposedActionType; // Use the imported type
  onConfirm: (actionId: string) => void; // Callback when user clicks initial confirm
  onReject: (actionId: string) => void; // Callback when user clicks reject
}

export const ProposedAction: React.FC<ProposedActionProps> = ({
  action,
  onConfirm,
  onReject,
}) => {
  const handleConfirm = () => {
    onConfirm(action.id);
  };

  const handleReject = () => {
    onReject(action.id);
  };

  return (
    <Card className={cn(
      "my-4 border-dashed",
      action.riskLevel === 'high' ? 'border-destructive bg-destructive/5' :
      action.riskLevel === 'medium' ? 'border-warning bg-warning/5' : // TODO: Add warning color to theme/utils
      'border-primary bg-primary/5'
    )}>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Sparkles className="h-5 w-5 mr-2 text-primary" /> Proposed Action: {action.type}
        </CardTitle>
        {action.description && (
          <CardDescription>{action.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {/* TODO: Display formatted parameters nicely */}
        <div className="bg-muted/50 p-3 rounded-md text-sm">
          <pre><code>{JSON.stringify(action.parameters, null, 2)}</code></pre>
        </div>
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={handleReject}>
          <Ban className="h-4 w-4 mr-2" /> Reject
        </Button>
        <Button size="sm" onClick={handleConfirm}>
          <Check className="h-4 w-4 mr-2" /> Review & Confirm
        </Button>
      </CardFooter>
    </Card>
  );
};

export default ProposedAction; 