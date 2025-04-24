'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Check, ChevronsUpDown, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { getConfiguredServices, ServiceType } from '@/lib/credentials';
import { 
  getDefaultLLM, 
  setDefaultLLM, 
  getUserPreferences
} from '@/lib/services/user-preferences';

interface ModelOption {
  value: ServiceType;
  label: string;
  description: string;
  status: 'available' | 'coming-soon' | 'experimental';
}

const modelOptions: ModelOption[] = [
  { 
    value: 'gemini', 
    label: 'Gemini 2.5 Pro', 
    description: 'Google\'s most capable and multimodal model',
    status: 'available'
  },
  { 
    value: 'openai', 
    label: 'GPT-4o', 
    description: 'OpenAI\'s most advanced model',
    status: 'coming-soon'
  },
  { 
    value: 'anthropic', 
    label: 'Claude 3 Opus', 
    description: 'Anthropic\'s most powerful model',
    status: 'coming-soon'
  },
  { 
    value: 'cohere', 
    label: 'Cohere Command', 
    description: 'Optimized for enterprise use cases',
    status: 'coming-soon'
  }
];

export default function LLMSelector() {
  const [open, setOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ServiceType>('gemini');
  const [availableModels, setAvailableModels] = useState<ServiceType[]>([]);

  useEffect(() => {
    // Get selected model from user preferences
    const defaultModel = getDefaultLLM();
    setSelectedModel(defaultModel);

    // Get list of configured/available models
    if (typeof window !== 'undefined') {
      const configuredServices = getConfiguredServices();
      setAvailableModels(configuredServices);
    } else {
      setAvailableModels(['gemini'] as ServiceType[]);
    }
  }, []);

  const handleSelectModel = (model: ServiceType) => {
    setSelectedModel(model);
    setDefaultLLM(model);
    setOpen(false);
  };

  const getSelectedModel = (): ModelOption | undefined => {
    return modelOptions.find(model => model.value === selectedModel);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            {getSelectedModel()?.label || 'Select model'}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder="Search models..." />
          <CommandEmpty>No model found.</CommandEmpty>
          <CommandGroup>
            {modelOptions.map((model) => {
              const isAvailable = availableModels.includes(model.value);
              const isDisabled = model.status !== 'available' || !isAvailable;
              
              return (
                <CommandItem
                  key={model.value}
                  value={model.value}
                  onSelect={() => {
                    if (!isDisabled) handleSelectModel(model.value as ServiceType);
                  }}
                  disabled={isDisabled}
                  className={cn(
                    "flex items-start gap-2 py-3",
                    isDisabled && "cursor-not-allowed opacity-60"
                  )}
                >
                  <div className="flex flex-col gap-1 w-full">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{model.label}</span>
                      {model.value === selectedModel && <Check className="h-4 w-4" />}
                    </div>
                    <span className="text-xs text-muted-foreground">{model.description}</span>
                    <div className="flex items-center gap-2 mt-1">
                      {model.status === 'coming-soon' && (
                        <Badge variant="outline" className="text-xs">Coming Soon</Badge>
                      )}
                      {model.status === 'experimental' && (
                        <Badge variant="outline" className="text-xs bg-yellow-100">Experimental</Badge>
                      )}
                      {!isAvailable && model.status === 'available' && (
                        <Badge variant="outline" className="text-xs">API Key Required</Badge>
                      )}
                    </div>
                  </div>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
} 