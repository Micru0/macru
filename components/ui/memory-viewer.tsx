"use client";

import { useState, useEffect, useMemo } from 'react';
import { MemoryService } from '@/lib/services/memory-service';
import { MemoryItem } from '@/lib/types/memory';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Trash2, AlertCircle } from 'lucide-react';

export function MemoryViewer() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Create a stable instance of the service within the component
  const memoryServiceInstance = useMemo(() => new MemoryService(), []);

  // Function to fetch memories
  const fetchMemories = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Use the component's instance of the service
      const fetchedMemories = await memoryServiceInstance.getRelevantMemories('', 50);
      setMemories(fetchedMemories);
    } catch (err: any) {
      console.error("Error fetching memories:", err);
      if (err.message.includes("User not authenticated")) {
        setError("You must be logged in to view memories.");
      } else {
        setError(err.message || "Failed to load memories.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch memories on component mount
  useEffect(() => {
    fetchMemories();
  }, [memoryServiceInstance]);

  // Function to handle deletion
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this memory?")) return;

    try {
      // Use the component's instance of the service
      const success = await memoryServiceInstance.deleteMemory(id);
      if (success) {
        setMemories(prev => prev.filter(mem => mem.id !== id));
        // TODO: Add success toast notification
      } else {
        throw new Error("Failed to delete memory.");
      }
    } catch (err: any) {
      console.error("Error deleting memory:", err);
      setError(err.message || "Failed to delete memory.");
      // TODO: Add error toast notification
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Memories</CardTitle>
        <CardDescription>Recent information stored about your preferences and interactions.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex justify-center items-center py-4">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading memories...</span>
          </div>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!isLoading && !error && memories.length === 0 && (
          <p className="text-muted-foreground text-center py-4">No memories found.</p>
        )}
        {!isLoading && !error && memories.length > 0 && (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4">
              {memories.map((memory) => (
                <Card key={memory.id} className="relative group">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <Badge variant="secondary" className="mr-2">{memory.type}</Badge>
                            {/* Map medium priority to default badge variant */}
                            <Badge variant={memory.priority === 'high' ? 'destructive' : memory.priority === 'medium' ? 'default' : 'outline'}>
                                {memory.priority}
                            </Badge>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleDelete(memory.id)}
                          aria-label="Delete memory"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                    </div>
                    <p className="text-sm mb-2">{memory.content}</p>
                    <div className="text-xs text-muted-foreground space-x-2">
                      <span>Created: {new Date(memory.created_at).toLocaleDateString()}</span>
                      {memory.last_accessed_at && 
                       <span>Last Accessed: {new Date(memory.last_accessed_at).toLocaleDateString()}</span>
                      }
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
} 