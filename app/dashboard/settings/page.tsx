'use client';

import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import LLMSelector from '@/components/ui/LLMSelector';
import { getDefaultLLM, UserPreferences } from '@/lib/services/user-preferences';
import { useEffect, useState, useCallback, useMemo, useTransition } from 'react';
import { ServiceType } from '@/lib/credentials';
import { Button } from "@/components/ui/button";
import { notionConnector } from '@/lib/connectors/notion';
import { ConnectionStatus, SyncStatus, ConnectorType } from '@/lib/types/data-connector';
import { useAuth } from '@/lib/context/auth-context';
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { ExternalLink, Link2, Unlink2 } from 'lucide-react';
import AuditTrailViewer from '@/components/ui/audit-trail-viewer';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast as sonnerToast } from "sonner";
import { getUserProfile } from '@/lib/services/user-service';
import { Database } from '@/lib/types/database.types';
import { createBrowserClient } from '@supabase/ssr';
import { updateConfirmationLevelAction } from '@/app/actions/settings';

type ConfirmationLevel = Database['public']['Tables']['profiles']['Row']['action_confirmation_level'];
type Profile = Database['public']['Tables']['profiles']['Row'] & {
  action_confirmation_level?: ConfirmationLevel | null;
};

export default function SettingsPage() {
  const { user, session, isLoading: authIsLoading } = useAuth();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState('general');

  const supabase = useMemo(() => 
    createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  , []);

  const [defaultLLM, setDefaultLLM] = useState<ServiceType>('gemini');
  const [notionStatus, setNotionStatus] = useState<ConnectionStatus | null>(null);
  const [isLoadingNotion, setIsLoadingNotion] = useState<boolean>(true);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isDisconnecting, setIsDisconnecting] = useState<boolean>(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState<boolean>(true);
  const [confirmationLevel, setConfirmationLevel] = useState<ConfirmationLevel>('all');

  const fetchProfile = useCallback(async () => {
    setIsLoadingProfile(true);
    try {
      const fetchedProfile = await getUserProfile(supabase);
      if (fetchedProfile) {
        const profileData = fetchedProfile as Profile;
        setProfile(profileData);
        const currentLevel = profileData.action_confirmation_level;
        if (currentLevel) {
          setConfirmationLevel(currentLevel);
        } else {
          setConfirmationLevel('all');
        }
      } else {
        setProfile(null);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      setProfile(null);
    } finally {
      setIsLoadingProfile(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (session && !authIsLoading) {
      fetchProfile();
    }
    if (!session && !authIsLoading) {
      setProfile(null);
      setIsLoadingProfile(false);
    }
  }, [session, fetchProfile, authIsLoading]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDefaultLLM(getDefaultLLM());
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setIsLoadingNotion(false);
      setNotionStatus(null);
      return;
    }

    async function fetchStatus() {
      setIsLoadingNotion(true);
      try {
        const response = await fetch('/api/connectors/notion/status');
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        const status: ConnectionStatus = await response.json();
        setNotionStatus(status);
      } catch (error: any) {
        console.error('[SettingsPage] Error fetching Notion connection status from API:', error);
        setNotionStatus(null);
        toast({ title: "Error Fetching Connection Status", description: error.message, variant: "destructive" });
      } finally {
        setIsLoadingNotion(false);
      }
    }

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('success') === 'notion_connected') {
      toast({ title: "Notion Connected Successfully!" });
      window.history.replaceState({}, document.title, window.location.pathname);
      fetchStatus();
    } else if (urlParams.get('error')?.startsWith('notion_')) {
      toast({ title: "Notion Connection Failed", description: urlParams.get('message') || "Error connecting Notion.", variant: "destructive" });
      window.history.replaceState({}, document.title, window.location.pathname);
      fetchStatus();
    } else {
      fetchStatus();
    }
  }, [user?.id]);

  const handleConnectNotion = () => {
    setIsConnecting(true);
    window.location.href = '/api/connectors/notion/auth/start';
  };

  const handleDisconnectNotion = async () => {
    if (!user) return;
    setIsDisconnecting(true);
    sonnerToast.loading("Disconnecting Notion...", { id: "disconnect-notion" });
    try {
      await fetch('/api/connectors/notion/disconnect', { method: 'POST' });
      setNotionStatus({ isConnected: false, connectorType: ConnectorType.NOTION });
      sonnerToast.success("Notion Disconnected Successfully", { id: "disconnect-notion" });
    } catch (error: any) {
      console.error('[SettingsPage] Error disconnecting Notion:', error);
      sonnerToast.error(`Failed to disconnect: ${error.message}`, { id: "disconnect-notion" });
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleSaveConfirmationLevel = (level: ConfirmationLevel) => {
    if (!profile) return;

    const originalLevel = profile.action_confirmation_level || 'all';
    setConfirmationLevel(level);

    const formData = new FormData();
    formData.append('level', level);

    startTransition(() => {
      sonnerToast.loading("Saving confirmation level...", { id: "save-level" });
      updateConfirmationLevelAction(formData).then((result) => {
        if (result.success) {
          sonnerToast.success(result.message || "Confirmation level saved!", { id: "save-level" });
        } else {
          console.error("Error saving confirmation level via Server Action:", result.error);
          sonnerToast.error(`Failed to save: ${result.error}`, { id: "save-level" });
          setConfirmationLevel(originalLevel);
        }
      });
    });
  };

  if (authIsLoading || (session && isLoadingProfile)) {
      return <SettingsSkeleton />;
  }

  if (!session || !profile) {
      return (
         <div className="container mx-auto py-8 px-4 md:px-6 lg:px-8">
            <h1 className="text-2xl font-bold mb-6">Settings</h1>
            <p className="text-muted-foreground">Please log in to view settings.</p>
         </div>
      );
  }

  return (
    <div className="container mx-auto py-8 px-4 md:px-6 lg:px-8">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <Tabs 
        defaultValue="general" 
        value={activeTab} 
        onValueChange={setActiveTab} 
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>LLM Model Selection</CardTitle>
                    <CardDescription>
                      Choose your preferred language model.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <LLMSelector />
                  </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                      <CardTitle>Data Connections</CardTitle>
                      <CardDescription>Manage external data sources.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoadingNotion ? (
                            <Skeleton className="h-16 w-full" />
                        ) : (
                            <div className="flex items-center justify-between p-4 border rounded-md">
                                <div className="flex items-center gap-3">
                                   <span className="text-2xl">N</span>
                                   <div>
                                    <p className="font-medium">Notion</p>
                                    <p className="text-sm text-muted-foreground">
                                        {notionStatus?.isConnected ? 'Connected' : 'Not Connected'}
                                    </p>
                                   </div>
                                </div>
                                {notionStatus?.isConnected ? (
                                    <Button variant="destructive" size="sm" onClick={handleDisconnectNotion} disabled={isDisconnecting}>
                                        <Unlink2 className="mr-2 h-4 w-4" />
                                        {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                                    </Button>
                                ) : (
                                    <Button variant="outline" size="sm" onClick={handleConnectNotion} disabled={isConnecting}>
                                        <Link2 className="mr-2 h-4 w-4" />
                                        {isConnecting ? 'Redirecting...' : 'Connect'}
                                    </Button>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
           </div>
        </TabsContent>
        <TabsContent value="security">
          <h2 className="text-xl font-semibold mb-4">Security Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                    <CardTitle>Action Confirmation Level</CardTitle>
                    <CardDescription>
                        Control when actions require confirmation.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <RadioGroup
                        value={confirmationLevel}
                        onValueChange={handleSaveConfirmationLevel}
                        disabled={isPending}
                        className="space-y-4"
                    >
                        <div className="flex items-center space-x-3">
                            <RadioGroupItem value="all" id="confirm-all" />
                            <Label htmlFor="confirm-all" className="font-normal cursor-pointer">
                                <span className="font-medium">Confirm All Actions (Recommended)</span>
                                <p className="text-sm text-muted-foreground">Require confirmation for every action.</p>
                            </Label>
                        </div>
                        <div className="flex items-center space-x-3">
                            <RadioGroupItem value="high" id="confirm-high" />
                            <Label htmlFor="confirm-high" className="font-normal cursor-pointer">
                                <span className="font-medium">Confirm High-Risk Actions</span>
                                <p className="text-sm text-muted-foreground">Require confirmation for high-risk actions only.</p>
                            </Label>
                        </div>
                        <div className="flex items-center space-x-3">
                            <RadioGroupItem value="medium" id="confirm-medium" />
                            <Label htmlFor="confirm-medium" className="font-normal cursor-pointer">
                                <span className="font-medium">Confirm Medium & High-Risk Actions</span>
                                <p className="text-sm text-muted-foreground">Require confirmation for medium and high-risk actions.</p>
                            </Label>
                        </div>
                         <div className="flex items-center space-x-3">
                            <RadioGroupItem value="none" id="confirm-none" />
                            <Label htmlFor="confirm-none" className="font-normal cursor-pointer">
                                <span className="font-medium text-red-600 dark:text-red-500">Confirm No Actions (Dangerous)</span>
                                <p className="text-sm text-muted-foreground">Never require confirmation. Use caution.</p>
                            </Label>
                        </div>
                    </RadioGroup>
                </CardContent>
              </Card>

              <Card>
                  <CardHeader>
                    <CardTitle>Future Security Settings</CardTitle>
                    <CardDescription>Options like password management, MFA.</CardDescription>
                  </CardHeader>
                  <CardContent>
                      <p className="text-muted-foreground">More settings coming soon.</p>
                  </CardContent>
              </Card>
          </div>

          <Card className="mt-6">
             <CardHeader>
                <CardTitle>Action Audit Trail</CardTitle>
                <CardDescription>
                    Review logged actions.
                </CardDescription>
             </CardHeader>
             <CardContent>
                <AuditTrailViewer />
             </CardContent>
          </Card>

        </TabsContent>
        <TabsContent value="billing">
          <Card>
             <CardHeader>
                <CardTitle>Billing Information</CardTitle>
                <CardDescription>Manage your subscription and payment details.</CardDescription>
             </CardHeader>
             <CardContent>
                <p className="text-muted-foreground">Billing features are not yet implemented.</p>
             </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const SettingsSkeleton = () => (
    <div className="container mx-auto py-8 px-4 md:px-6 lg:px-8">
      <Skeleton className="h-8 w-32 mb-6" /> 
      <div className="w-full mb-6">
        <div className="grid w-full grid-cols-3 gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-40 w-full" />
            </div>
            <div className="lg:col-span-1">
                 <Skeleton className="h-64 w-full" /> 
            </div>
      </div>
    </div>
); 