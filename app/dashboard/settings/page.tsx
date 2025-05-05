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
import { ConnectionStatus, SyncStatus, ConnectorType } from '@/lib/types/data-connector';
import { useAuth } from '@/lib/context/auth-context';
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { ExternalLink, Link2, Unlink2, RefreshCw, CalendarDays } from 'lucide-react';
import AuditTrailViewer from '@/components/ui/audit-trail-viewer';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast as sonnerToast } from "sonner";
import { getUserProfile } from '@/lib/services/user-service';
import { Database } from '@/lib/types/database.types';
import { createBrowserClient } from '@supabase/ssr';
import { updateConfirmationLevelAction } from '@/app/actions/settings';
import { useRouter, useSearchParams } from 'next/navigation';

type ConfirmationLevel = Database['public']['Tables']['profiles']['Row']['action_confirmation_level'];
type Profile = Database['public']['Tables']['profiles']['Row'] & {
  action_confirmation_level?: ConfirmationLevel | null;
};

interface ConnectorConnectionStatus {
  isConnected: boolean;
  error?: string;
  accountIdentifier?: string;
}

export default function SettingsPage() {
  const { user, session, isLoading: authIsLoading } = useAuth();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState('general');
  const router = useRouter();
  const searchParams = useSearchParams();

  const supabase = useMemo(() => 
    createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  , []);

  const [defaultLLM, setDefaultLLM] = useState<ServiceType>('gemini');
  const [notionStatus, setNotionStatus] = useState<ConnectorConnectionStatus | null>(null);
  const [notionLoading, setNotionLoading] = useState(true);
  const [isConnectingNotion, setIsConnectingNotion] = useState<boolean>(false);
  const [isDisconnectingNotion, setIsDisconnectingNotion] = useState<boolean>(false);
  const [isSyncingNotion, setIsSyncingNotion] = useState<boolean>(false);

  const [gcalStatus, setGCalStatus] = useState<ConnectorConnectionStatus | null>(null);
  const [gcalLoading, setGCalLoading] = useState(true);
  const [isConnectingGCal, setIsConnectingGCal] = useState<boolean>(false);
  const [isDisconnectingGCal, setIsDisconnectingGCal] = useState<boolean>(false);
  const [isSyncingGCal, setIsSyncingGCal] = useState<boolean>(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState<boolean>(true);
  const [confirmationLevel, setConfirmationLevel] = useState<ConfirmationLevel>('all');

  const fetchProfile = useCallback(async () => {
    setIsLoadingProfile(true);
    try {
      // Explicitly handle potential error return type from getUserProfile
      const fetchedProfileResult = await getUserProfile(supabase);
      if (fetchedProfileResult && !('error' in fetchedProfileResult)) {
        // It's safe to treat fetchedProfileResult as Profile here
        const profileData = fetchedProfileResult as Profile;
        setProfile(profileData);
        const currentLevel = profileData.action_confirmation_level;
        if (currentLevel) {
          setConfirmationLevel(currentLevel);
        } else {
          // Default if null or undefined in DB
          setConfirmationLevel('all');
        }
      } else {
        // Log the error if getUserProfile returned an error object
        console.error("Failed to fetch profile:", fetchedProfileResult?.error);
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
    if (user?.id) {
      // Fetch Notion Status
      setNotionLoading(true);
      fetch('/api/connectors/notion/status')
        .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to fetch Notion status')))
        .then(data => setNotionStatus(data))
        .catch(err => {
          console.error("Error fetching Notion status:", err);
          setNotionStatus({ isConnected: false, error: err.message });
        })
        .finally(() => setNotionLoading(false));

      // Fetch Google Calendar Status
      setGCalLoading(true);
      fetch('/api/connectors/google-calendar/status')
        .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to fetch Google Calendar status')))
        .then(data => setGCalStatus(data))
        .catch(err => {
          console.error("Error fetching Google Calendar status:", err);
          setGCalStatus({ isConnected: false, error: err.message });
        })
        .finally(() => setGCalLoading(false));
    }
  }, [user?.id]);

  useEffect(() => {
    // Display toast messages based on query parameters from redirects
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    const message = searchParams.get('message');

    if (success) {
      toast({
        title: "Connection Successful",
        description: message || `${success.replace(/_/g, ' ')} connection established.`,
        variant: "default",
      });
      // Clean the URL
      router.replace('/dashboard/settings', { scroll: false });
    }
    if (error) {
      toast({
        title: "Connection Failed",
        description: message || `${error.replace(/_/g, ' ')} failed. Please try again.`,
        variant: "destructive",
      });
      // Clean the URL
      router.replace('/dashboard/settings', { scroll: false });
    }
  }, [searchParams, toast, router]);

  const handleConnectNotion = () => {
    setIsConnectingNotion(true);
    window.location.href = '/api/connectors/notion/auth/start';
  };

  const handleDisconnectNotion = async () => {
    if (!user) return;
    setIsDisconnectingNotion(true);
    sonnerToast.loading("Disconnecting Notion...", { id: "disconnect-notion" });
    try {
      await fetch('/api/connectors/notion/disconnect', { method: 'POST' });
      setNotionStatus({ isConnected: false });
      sonnerToast.success("Notion Disconnected Successfully", { id: "disconnect-notion" });
    } catch (error: any) {
      console.error('[SettingsPage] Error disconnecting Notion:', error);
      sonnerToast.error(`Failed to disconnect: ${error.message}`, { id: "disconnect-notion" });
      // Re-fetch status on error
      fetch('/api/connectors/notion/status')
        .then(res => res.ok ? res.json() : Promise.resolve({isConnected: false}))
        .then(data => setNotionStatus(data));
    } finally {
      setIsDisconnectingNotion(false);
    }
  };

  const handleSyncNotion = async () => {
    if (!user || !notionStatus?.isConnected) return;
    setIsSyncingNotion(true);
    const syncToastId = "sync-notion";
    sonnerToast.loading("Starting Notion sync... This may take a while.", { id: syncToastId });

    try {
      const response = await fetch('/api/sync/notion', { method: 'POST' });
      const result = await response.json();

      if (!response.ok) {
        if (response.status === 207 && result.errorCount > 0) {
           sonnerToast.warning(
            `Sync completed with ${result.errorCount} errors. Processed: ${result.processedCount}. First error: ${result.firstErrorMessage}`,
            { id: syncToastId, duration: 10000 }
          );
        } else {
           throw new Error(result.error || `Sync failed with status: ${response.status}`);
        }
      } else {
        sonnerToast.success(
          result.message || `Sync completed! Processed ${result.processedCount} items.`,
          { id: syncToastId, duration: 5000 }
        );
      }

    } catch (error: any) {
      console.error('[SettingsPage] Error syncing Notion:', error);
      sonnerToast.error(`Sync failed: ${error.message}`, { id: syncToastId });
    } finally {
      setIsSyncingNotion(false);
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

  const handleConnectGoogleCalendar = () => {
    setIsConnectingGCal(true);
    window.location.href = '/api/connectors/google-calendar/auth/start';
  };

  const handleDisconnectGoogleCalendar = async () => {
    if (!user) return;
    setIsDisconnectingGCal(true);
    const disconnectToastId = "disconnect-gcal";
    sonnerToast.loading("Disconnecting Google Calendar...", { id: disconnectToastId });
    try {
      const response = await fetch('/api/connectors/google-calendar/disconnect', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to disconnect Google Calendar');
      setGCalStatus({ isConnected: false });
      sonnerToast.success("Google Calendar Disconnected", { id: disconnectToastId });
    } catch (error: any) {
      console.error("Error disconnecting Google Calendar:", error);
      sonnerToast.error(`Failed to disconnect: ${error.message}`, { id: disconnectToastId });
      // Re-fetch status on error
      fetch('/api/connectors/google-calendar/status')
        .then(res => res.ok ? res.json() : Promise.resolve({isConnected: false}))
        .then(data => setGCalStatus(data));
    }
    setGCalLoading(false);
    setIsDisconnectingGCal(false);
  };

  const handleSyncGoogleCalendar = async () => {
    console.log("[handleSyncGoogleCalendar] Sync button clicked!");
    if (!user || !gcalStatus?.isConnected) return;
    setIsSyncingGCal(true);
    const syncToastId = "sync-gcal";
    sonnerToast.loading("Starting Google Calendar sync...", { id: syncToastId });

    try {
       // Make the actual API call
       const response = await fetch('/api/sync/google-calendar', { method: 'POST' });
       const result = await response.json(); // Assuming the API returns SyncResult JSON

       if (!response.ok) {
            // Handle non-2xx responses, including 207 Multi-Status for partial success
            if (response.status === 207 && result.errorCount > 0) {
                sonnerToast.warning(
                    result.message || `Sync completed with ${result.errorCount} errors. Processed: ${result.processedCount}.`,
                    { id: syncToastId, duration: 8000 } 
                );
            } else {
                throw new Error(result.message || `Sync failed with status: ${response.status}`);
            }
       } else {
            // Handle success (200 OK)
            sonnerToast.success(
                result.message || `Sync completed! Processed ${result.processedCount} events.`,
                { id: syncToastId, duration: 5000 }
            );
       }
    } catch (error: any) {
      console.error('[SettingsPage] Error syncing Google Calendar:', error);
      sonnerToast.error(`Sync failed: ${error.message}`, { id: syncToastId });
    } finally {
      setIsSyncingGCal(false);
    }
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
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
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
                      <CardTitle>Placeholder</CardTitle>
                      <CardDescription>Other general settings here.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">Coming soon...</p>
                    </CardContent>
                </Card>
           </div>
        </TabsContent>
        <TabsContent value="connections">
          <Card>
            <CardHeader>
              <CardTitle>Integrations</CardTitle>
              <CardDescription>Manage external data sources.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {notionLoading ? (
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
                        <div className="flex items-center gap-2">
                          {notionStatus?.isConnected ? (
                            <>
                              <Button variant="outline" size="sm" onClick={handleSyncNotion} disabled={isSyncingNotion || isDisconnectingNotion}>
                                  <RefreshCw className={`mr-2 h-4 w-4 ${isSyncingNotion ? 'animate-spin' : ''}`} />
                                  {isSyncingNotion ? 'Syncing...' : 'Sync Now'}
                              </Button>
                              <Button variant="destructive" size="sm" onClick={handleDisconnectNotion} disabled={isDisconnectingNotion || isSyncingNotion}>
                                  <Unlink2 className="mr-2 h-4 w-4" />
                                  {isDisconnectingNotion ? 'Disconnecting...' : 'Disconnect'}
                              </Button>
                            </>
                          ) : (
                            <Button variant="outline" size="sm" onClick={handleConnectNotion} disabled={isConnectingNotion}>
                                <Link2 className="mr-2 h-4 w-4" />
                                {isConnectingNotion ? 'Redirecting...' : 'Connect'}
                            </Button>
                          )}
                        </div>
                    </div>
                )}
                {gcalLoading ? (
                    <Skeleton className="h-16 w-full" />
                ) : (
                    <div className="flex items-start justify-between p-4 border rounded-md">
                        <div className="flex items-center gap-3">
                            <CalendarDays className="h-6 w-6 text-blue-500 flex-shrink-0 mt-px" />
                            <div>
                                <p className="font-medium">Google Calendar</p>
                                <p className="text-sm text-muted-foreground">
                                    {gcalStatus?.isConnected 
                                        ? `Connected as: ${gcalStatus.accountIdentifier || 'Connected'}` 
                                        : 'Not Connected'
                                    }
                                </p>
                                {gcalStatus?.error && <span className="text-red-500 block mt-1 text-xs">Error: {gcalStatus.error}</span>}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {gcalStatus?.isConnected ? (
                                <>
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        onClick={handleSyncGoogleCalendar}
                                        disabled={isSyncingGCal || isDisconnectingGCal}
                                    >
                                        <RefreshCw className={`mr-2 h-4 w-4 ${isSyncingGCal ? 'animate-spin' : ''}`} />
                                        {isSyncingGCal ? 'Syncing...' : 'Sync Now'}
                                    </Button>
                                    <Button 
                                        variant="destructive" 
                                        size="sm" 
                                        onClick={handleDisconnectGoogleCalendar}
                                        disabled={isDisconnectingGCal || isSyncingGCal}
                                    >
                                        {isDisconnectingGCal ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Unlink2 className="mr-2 h-4 w-4" />}
                                        {isDisconnectingGCal ? 'Disconnecting...' : 'Disconnect'}
                                    </Button>
                                </> 
                            ) : (
                                <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={handleConnectGoogleCalendar}
                                    disabled={isConnectingGCal}
                                >
                                    {isConnectingGCal ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                                    {isConnectingGCal ? 'Connecting...' : 'Connect'}
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
          </Card>
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
        <div className="grid w-full grid-cols-4 gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
             <Skeleton className="h-10 w-full" />
        </div>
      </div>
      <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-64 w-full" /> 
          </div>
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
      </div>
    </div>
); 