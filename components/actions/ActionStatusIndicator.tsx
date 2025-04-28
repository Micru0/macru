import React from 'react';
import { CheckCircle2, AlertCircle, XCircle, Loader2 } from 'lucide-react'; // Example icons
import { cn } from '@/lib/utils'; // Assuming you have a utility for class names

// Define placeholder types
// TODO: Define a more specific status type if needed
type ActionStatus = 'pending' | 'executing' | 'success' | 'failed';

interface ActionStatusIndicatorProps {
  status: ActionStatus;
  message?: string; // Optional message to display alongside status
}

export const ActionStatusIndicator: React.FC<ActionStatusIndicatorProps> = ({
  status,
  message,
}) => {
  const getStatusDetails = () => {
    switch (status) {
      case 'pending':
        return { Icon: Loader2, color: 'text-muted-foreground', text: 'Pending...', spin: true };
      case 'executing':
        return { Icon: Loader2, color: 'text-blue-500', text: 'Executing...', spin: true };
      case 'success':
        return { Icon: CheckCircle2, color: 'text-green-500', text: 'Success', spin: false };
      case 'failed':
        return { Icon: XCircle, color: 'text-destructive', text: 'Failed', spin: false };
      default:
        return { Icon: AlertCircle, color: 'text-muted-foreground', text: 'Unknown', spin: false };
    }
  };

  const { Icon, color, text, spin } = getStatusDetails();

  return (
    <div className={cn('flex items-center text-sm p-2 my-2 rounded-md border',
        status === 'success' ? 'bg-green-50 border-green-200' :
        status === 'failed' ? 'bg-red-50 border-red-200' :
        'bg-muted/50 border-border'
    )}>
      <Icon className={cn('h-4 w-4 mr-2 flex-shrink-0', color, spin && 'animate-spin')} />
      <span className={cn('font-medium', color)}>{text}</span>
      {message && <span className="ml-2 text-muted-foreground">- {message}</span>}
    </div>
  );
};

export default ActionStatusIndicator; 