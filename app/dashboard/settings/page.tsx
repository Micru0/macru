'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import LLMSelector from '@/components/ui/LLMSelector';
import { getDefaultLLM } from '@/lib/services/user-preferences';
import { useEffect, useState } from 'react';
import { ServiceType } from '@/lib/credentials';

export default function SettingsPage() {
  const [defaultLLM, setDefaultLLM] = useState<ServiceType>('gemini');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDefaultLLM(getDefaultLLM());
    }
  }, []);

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>
      
      <Tabs defaultValue="models" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="models">LLM Models</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>
        
        <TabsContent value="models">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>LLM Model Selection</CardTitle>
                  <CardDescription>
                    Choose your preferred language model for queries and responses.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="default-model">Default Model</Label>
                      <LLMSelector />
                      <p className="text-sm text-muted-foreground mt-2">
                        This model will be used for all LLM-related features unless otherwise specified.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            <div>
              <Card>
                <CardHeader>
                  <CardTitle>Current Selection</CardTitle>
                  <CardDescription>
                    Your current model preferences
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium">Default Model</h3>
                      <p className="text-sm">{defaultLLM === 'gemini' ? 'Gemini 2.5 Pro' : defaultLLM}</p>
                    </div>
                    
                    <div>
                      <h3 className="font-medium">Model Capabilities</h3>
                      <ul className="text-sm space-y-1 mt-1">
                        <li>• Natural language understanding</li>
                        <li>• Context-aware responses</li>
                        <li>• Document analysis</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle>Appearance Settings</CardTitle>
              <CardDescription>
                Customize how MACRU looks and feels
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p>Appearance settings coming soon.</p>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="api-keys">
          <Card>
            <CardHeader>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>
                Manage your API keys for various providers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p>API key management coming soon.</p>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="advanced">
          <Card>
            <CardHeader>
              <CardTitle>Advanced Settings</CardTitle>
              <CardDescription>
                Configure advanced options and experimental features
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p>Advanced settings coming soon.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 