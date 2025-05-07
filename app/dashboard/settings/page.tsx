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
import { ExternalLink, Link2, Unlink2, RefreshCw, CalendarDays, Mail } from 'lucide-react';
import AuditTrailViewer from '@/components/ui/audit-trail-viewer';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast as sonnerToast } from "sonner";
import { getUserProfile, Profile as UserProfileData } from '@/lib/services/user-service';
import { Database } from '@/lib/types/database.types';
import { createBrowserClient } from '@supabase/ssr';
import { updateConfirmationLevelAction } from '@/app/actions/settings';
import { useRouter, useSearchParams } from 'next/navigation';
import { GmailConnector } from '@/lib/connectors/gmail';

type ConfirmationLevel = Database['public']['Tables']['profiles']['Row']['action_confirmation_level'];
type UserProfile = Database['public']['Tables']['profiles']['Row'] & {
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
  const [notionStatus, setNotionStatus] = useState<ConnectionStatus | null>(null);
  const [calendarStatus, setCalendarStatus] = useState<ConnectionStatus | null>(null);
  const [gmailStatus, setGmailStatus] = useState<ConnectionStatus | null>(null);
  const [isLoadingNotion, setIsLoadingNotion] = useState(true);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(true);
  const [isLoadingGmail, setIsLoadingGmail] = useState(true);
  const [isConnectingNotion, setIsConnectingNotion] = useState<boolean>(false);
  const [isDisconnectingNotion, setIsDisconnectingNotion] = useState<boolean>(false);
  const [isSyncingNotion, setIsSyncingNotion] = useState<boolean>(false);
  const [isConnectingCalendar, setIsConnectingCalendar] = useState<boolean>(false);
  const [isDisconnectingCalendar, setIsDisconnectingCalendar] = useState<boolean>(false);
  const [isSyncingCalendar, setIsSyncingCalendar] = useState<boolean>(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState<boolean>(true);
  const [confirmationLevel, setConfirmationLevel] = useState<ConfirmationLevel | null>(null);
  const [isLoadingLevel, setIsLoadingLevel] = useState<boolean>(true);
  const [isUpdatingLevel, setIsUpdatingLevel] = useState<boolean>(false);
  const [isSyncingGmail, setIsSyncingGmail] = useState<boolean>(false);

  const fetchProfile = useCallback(async () => {
    setIsLoadingProfile(true);
    setIsLoadingLevel(true);
    try {
      const fetchedProfileResult = await getUserProfile(supabase);
      if (fetchedProfileResult && !('error' in fetchedProfileResult)) {
        const profileData = fetchedProfileResult as UserProfile;
        setProfile(profileData);
        const currentLevel = profileData.action_confirmation_level;
        if (currentLevel) {
          setConfirmationLevel(currentLevel);
        } else {
          setConfirmationLevel('all');
        }
      } else {
        console.error("Failed to fetch profile:", fetchedProfileResult?.error);
        setProfile(null);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      setProfile(null);
    } finally {
      setIsLoadingProfile(false);
      setIsLoadingLevel(false);
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
      setIsLoadingNotion(true);
      fetch('/api/connectors/notion/status')
        .then(res => res.json())
        .then((data: ConnectionStatus) => {
          setNotionStatus(data);
        })
        .catch(error => {
          console.error("Error fetching Notion status:", error);
          setNotionStatus({ connectorType: ConnectorType.NOTION, isConnected: false, error: 'Failed to fetch status' });
        })
        .finally(() => setIsLoadingNotion(false));

      setIsLoadingCalendar(true);
      fetch('/api/connectors/google-calendar/status')
        .then(res => res.json())
        .then((data: ConnectionStatus) => {
          setCalendarStatus(data);
        })
        .catch(error => {
          console.error("Error fetching Google Calendar status:", error);
          setCalendarStatus({ connectorType: ConnectorType.GOOGLE_CALENDAR, isConnected: false, error: 'Failed to fetch status' });
        })
        .finally(() => setIsLoadingCalendar(false));

      setIsLoadingGmail(true);
      fetch('/api/connectors/gmail/status')
        .then(res => res.json())
        .then((data: ConnectionStatus) => {
          setGmailStatus(data);
        })
        .catch(error => {
          console.error("Error fetching Gmail status:", error);
          setGmailStatus({ connectorType: ConnectorType.GMAIL, isConnected: false, error: 'Failed to fetch status' });
        })
        .finally(() => setIsLoadingGmail(false));
    }
  }, [user?.id]);

  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    const message = searchParams.get('message');

    const handleSuccess = (type: 'notion' | 'calendar' | 'gmail', toastTitle: string, fetchStatus: () => void, setLoading: (loading: boolean) => void) => {
      toast({ title: toastTitle, description: message || `${type} connection established.`, variant: "default" });
      setLoading(true);
      fetchStatus();
      router.replace('/dashboard/settings');
    };

    if (success === 'notion_connected') handleSuccess('notion', 'Notion Connected!', () => fetch('/api/connectors/notion/status').then(res => res.json()).then(setNotionStatus).finally(() => setIsLoadingNotion(false)), setIsLoadingNotion);
    if (success === 'calendar_connected') handleSuccess('calendar', 'Google Calendar Connected!', () => fetch('/api/connectors/google-calendar/status').then(res => res.json()).then(setCalendarStatus).finally(() => setIsLoadingCalendar(false)), setIsLoadingCalendar);
    if (success === 'gmail_connected') handleSuccess('gmail', 'Gmail Connected!', () => fetch('/api/connectors/gmail/status').then(res => res.json()).then(setGmailStatus).finally(() => setIsLoadingGmail(false)), setIsLoadingGmail);

    if (error) {
      let errorMessage = "Connection failed. Please try again.";
      if (error.includes('notion')) errorMessage = "Failed to connect Notion.";
      else if (error.includes('calendar')) errorMessage = "Failed to connect Google Calendar.";
      else if (error.includes('gmail')) errorMessage = "Failed to connect Gmail.";
      toast({ title: "Connection Failed", description: message || errorMessage, variant: "destructive" });
      router.replace('/dashboard/settings');
    }
  }, [searchParams, toast, router]);

  const handleNotionConnect = () => {
    setIsConnectingNotion(true);
    window.location.href = '/api/connectors/notion/auth/start';
  };

  const handleNotionDisconnect = async () => {
    if (!user) return;
    setIsDisconnectingNotion(true);
    sonnerToast.loading("Disconnecting Notion...", { id: "disconnect-notion" });
    try {
      await fetch('/api/connectors/notion/disconnect', { method: 'POST' });
      setNotionStatus({ connectorType: ConnectorType.NOTION, isConnected: false });
      sonnerToast.success("Notion Disconnected Successfully", { id: "disconnect-notion" });
    } catch (error: any) {
      console.error("Error disconnecting Notion:", error);
      sonnerToast.error(`Failed to disconnect: ${error.message}`, { id: "disconnect-notion" });
      fetch('/api/connectors/notion/status').then(res => res.json()).then(setNotionStatus);
    } finally {
      setIsDisconnectingNotion(false);
      setIsLoadingNotion(false);
    }
  };

  const handleNotionSync = async () => {
    if (!user || !notionStatus?.isConnected) return;
    setIsSyncingNotion(true);
    const syncToastId = "sync-notion";
    sonnerToast.loading("Starting Notion sync...", { id: syncToastId });
    try {
      const response = await fetch('/api/sync/notion', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Sync failed');
      }
      sonnerToast.success(`Notion Sync Complete: ${result.processedItems} items processed.`, { id: syncToastId, duration: 5000 });
    } catch (error: any) {
      console.error("Error syncing Notion:", error);
      sonnerToast.error(`Sync failed: ${error.message}`, { id: syncToastId });
    } finally {
      setIsSyncingNotion(false);
    }
  };

  const handleUpdateConfirmationLevel = async (level: ConfirmationLevel) => {
    if (!user?.id || !level) return;
    setIsUpdatingLevel(true);
    sonnerToast.loading("Updating confirmation level...", { id: "update-level" });
    try {
      const formData = new FormData();
      formData.append('level', level);
      await updateConfirmationLevelAction(formData);
      setConfirmationLevel(level);
      sonnerToast.success("Confirmation level updated successfully", { id: "update-level" });
    } catch (error: any) {
      console.error("Failed to update confirmation level:", error);
      sonnerToast.error(`Update failed: ${error.message}`, { id: "update-level" });
      fetchProfile();
    } finally {
      setIsUpdatingLevel(false);
    }
  };

  const handleConnectGoogleCalendar = () => {
    setIsConnectingCalendar(true);
    window.location.href = '/api/connectors/google-calendar/auth/start';
  };

  const handleDisconnectGoogleCalendar = async () => {
    if (!user) return;
    setIsDisconnectingCalendar(true);
    const disconnectToastId = "disconnect-gcal";
    sonnerToast.loading("Disconnecting Google Calendar...", { id: disconnectToastId });
    try {
      const response = await fetch('/api/connectors/google-calendar/disconnect', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to disconnect Google Calendar');
      setCalendarStatus({ connectorType: ConnectorType.GOOGLE_CALENDAR, isConnected: false });
      sonnerToast.success("Google Calendar Disconnected", { id: disconnectToastId });
    } catch (error: any) {
      console.error("Error disconnecting Google Calendar:", error);
      sonnerToast.error(`Failed to disconnect: ${error.message}`, { id: disconnectToastId });
      fetch('/api/connectors/google-calendar/status').then(res => res.json()).then(setCalendarStatus);
    } finally {
      setIsDisconnectingCalendar(false);
      setIsLoadingCalendar(false);
    }
  };

  const handleSyncGoogleCalendar = async () => {
    console.log("[handleSyncGoogleCalendar] Sync button clicked!");
    if (!user || !calendarStatus?.isConnected) return;
    setIsSyncingCalendar(true);
    const syncToastId = "sync-gcal";
    sonnerToast.loading("Starting Google Calendar sync...", { id: syncToastId });

    try {
       const response = await fetch('/api/sync/google-calendar', { method: 'POST' });
       const result = await response.json();

       if (!response.ok) {
            if (response.status === 207 && result.errorCount > 0) {
                sonnerToast.warning(
                    result.message || `Sync completed with ${result.errorCount} errors. Processed: ${result.processedCount}.`,
                    { id: syncToastId, duration: 8000 } 
                );
            } else {
                throw new Error(result.message || `Sync failed with status: ${response.status}`);
            }
       } else {
            sonnerToast.success(
                result.message || `Sync completed! Processed ${result.processedCount} events.`,
                { id: syncToastId, duration: 5000 }
            );
       }
    } catch (error: any) {
      console.error('[SettingsPage] Error syncing Google Calendar:', error);
      sonnerToast.error(`Sync failed: ${error.message}`, { id: syncToastId });
    } finally {
      setIsSyncingCalendar(false);
    }
  };

  const handleGmailConnect = () => {
    window.location.href = '/api/connectors/gmail/auth/start';
  };

  const handleGmailDisconnect = async () => {
    if (!user) return;
    setIsLoadingGmail(true);
    const disconnectToastId = "disconnect-gmail";
    sonnerToast.loading("Disconnecting Gmail...", { id: disconnectToastId });
    try {
      const res = await fetch('/api/connectors/gmail/disconnect', { method: 'POST' });
      const data: ConnectionStatus = await res.json();
      setGmailStatus(data);
      if (!data.isConnected && !data.error) {
        sonnerToast.success("Gmail disconnected.", { id: disconnectToastId });
      } else {
         sonnerToast.error(`Disconnect failed: ${data.error || 'Unknown error'}`, { id: disconnectToastId });
         fetch('/api/connectors/gmail/status').then(res => res.json()).then(setGmailStatus);
      }
    } catch (error: any) {
       console.error("Error disconnecting Gmail (fetch failed):", error);
       sonnerToast.error(`Disconnect failed: ${error.message || 'Network error'}`, { id: disconnectToastId });
       fetch('/api/connectors/gmail/status').then(res => res.json()).then(setGmailStatus);
    }
    setIsLoadingGmail(false);
  };

  const handleGmailSync = async () => {
    if (!user || !gmailStatus?.isConnected) return;
    setIsSyncingGmail(true);
    const syncToastId = "sync-gmail";
    sonnerToast.loading("Starting Gmail sync... This may take a while.", { id: syncToastId });
    try {
      const response = await fetch('/api/sync/gmail', { method: 'POST' });
      const result = await response.json();

      if (!response.ok) {
        if (response.status === 207 && result.errorCount > 0) {
           sonnerToast.warning(
            result.message || `Sync completed with ${result.errorCount} errors. Processed: ${result.processedCount}.`,
            { id: syncToastId, duration: 8000 }
          );
        } else {
           throw new Error(result.message || `Sync failed with status: ${response.status}`);
        }
      } else {
        sonnerToast.success(
          result.message || `Sync completed! Processed ${result.processedCount} emails.`,
          { id: syncToastId, duration: 5000 }
        );
      }
    } catch (error: any) {
      console.error('[SettingsPage] Error syncing Gmail:', error);
      sonnerToast.error(`Sync failed: ${error.message}`, { id: syncToastId });
    } finally {
      setIsSyncingGmail(false);
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
              <CardTitle>Data Connections</CardTitle>
              <CardDescription>Connect your external accounts to sync data.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-start justify-between space-x-4 p-4 border rounded-md">
                    <div className="flex items-center space-x-3">
                        <span className="font-bold text-lg">N</span>
                        <div>
                            <p className="font-medium">Notion</p>
                            <p className="text-sm text-muted-foreground">
                                {isLoadingNotion ? "Checking status..." : notionStatus?.isConnected ? `Connected as ${notionStatus.accountName || 'Workspace'}` : "Connect your Notion workspace."}
                                {notionStatus?.error && <span className='text-destructive'> Error: {notionStatus.error}</span>}
                            </p>
                        </div>
                    </div>
                    {isLoadingNotion ? (
                        <Skeleton className="h-9 w-[110px]" />
                    ) : notionStatus?.isConnected ? (
                        <div className="flex items-center space-x-2">
                            <Button variant="outline" size="sm" onClick={handleNotionSync} disabled={isSyncingNotion || isDisconnectingNotion}>
                                <RefreshCw className={`mr-2 h-4 w-4 ${isSyncingNotion ? 'animate-spin' : ''}`} />
                                {isSyncingNotion ? 'Syncing...' : 'Sync Now'}
                            </Button>
                            <Button variant="destructive" size="sm" onClick={handleNotionDisconnect}>Disconnect</Button>
                        </div>
                    ) : (
                        <Button size="sm" onClick={handleNotionConnect}>Connect Notion</Button>
                    )}
                </div>
                <div className="flex items-start justify-between space-x-4 p-4 border rounded-md">
                    <div className="flex items-center space-x-3">
                        <span className="font-bold text-lg">GC</span>
                        <div>
                            <p className="font-medium">Google Calendar</p>
                            <p className="text-sm text-muted-foreground">
                                {isLoadingCalendar ? "Checking status..." : calendarStatus?.isConnected ? `Connected as ${calendarStatus.accountName || 'Calendar'}` : "Connect your Google Calendar."}
                                {calendarStatus?.error && <span className='text-destructive'> Error: {calendarStatus.error}</span>}
                            </p>
                        </div>
                    </div>
                    {isLoadingCalendar ? (
                        <Skeleton className="h-9 w-[110px]" />
                    ) : calendarStatus?.isConnected ? (
                        <div className="flex items-center space-x-2">
                            <Button variant="outline" size="sm" onClick={handleSyncGoogleCalendar} disabled={isSyncingCalendar || isDisconnectingCalendar}>
                                <RefreshCw className={`mr-2 h-4 w-4 ${isSyncingCalendar ? 'animate-spin' : ''}`} />
                                {isSyncingCalendar ? 'Syncing...' : 'Sync Now'}
                            </Button>
                            <Button variant="destructive" size="sm" onClick={handleDisconnectGoogleCalendar}>Disconnect</Button>
                        </div>
                    ) : (
                        <Button size="sm" onClick={handleConnectGoogleCalendar}>Connect Calendar</Button>
                    )}
                </div>
                <div className="flex items-start justify-between space-x-4 p-4 border rounded-md">
                    <div className="flex items-center space-x-3">
                        <span className="font-bold text-lg">GM</span>
                        <div>
                            <p className="font-medium">Gmail</p>
                            <p className="text-sm text-muted-foreground">
                                {isLoadingGmail ? "Checking status..." : gmailStatus?.isConnected ? `Connected as ${gmailStatus.accountName || 'Gmail'}` : "Connect your Gmail account."}
                                {gmailStatus?.error && <span className='text-destructive'> Error: {gmailStatus.error}</span>}
                            </p>
                        </div>
                    </div>
                    {isLoadingGmail ? (
                        <Skeleton className="h-9 w-[110px]" />
                    ) : gmailStatus?.isConnected ? (
                        <div className="flex items-center space-x-2">
                            <Button variant="outline" size="sm" onClick={handleGmailSync} disabled={isSyncingGmail || isLoadingGmail}>
                                <RefreshCw className={`mr-2 h-4 w-4 ${isSyncingGmail ? 'animate-spin' : ''}`} />
                                {isSyncingGmail ? 'Syncing...' : 'Sync Now'}
                            </Button>
                            <Button variant="destructive" size="sm" onClick={handleGmailDisconnect}>Disconnect</Button>
                        </div>
                    ) : (
                        <Button size="sm" onClick={handleGmailConnect}>Connect Gmail</Button>
                    )}
                </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="security" className="space-y-6 mt-6">
          <Card>
             <CardHeader>
               <CardTitle>Action Confirmation</CardTitle>
               <CardDescription>Choose the level of confirmation required before executing actions.</CardDescription>
             </CardHeader>
             <CardContent>
              {isLoadingLevel ? (
                <Skeleton className="h-20 w-full" />
              ) : (
                <RadioGroup
                  value={confirmationLevel || 'secure'}
                  onValueChange={(value) => handleUpdateConfirmationLevel(value as ConfirmationLevel)}
                  disabled={isUpdatingLevel}
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
              )}
            </CardContent>
          </Card>
          <Card>
             <CardHeader>
               <CardTitle>Action Audit Trail</CardTitle>
               <CardDescription>Review logs of actions performed or attempted.</CardDescription>
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