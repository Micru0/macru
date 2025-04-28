'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr'; // Correct client helper for client components
import type { Database } from '@/lib/types/database.types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuth } from '@/lib/context/auth-context'; // To get current user ID

// Define the type for an action log row based on database.types.ts
type ActionLog = Database['public']['Tables']['action_logs']['Row'];

const LOGS_PER_PAGE = 15;

export function AuditTrailViewer() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [filters, setFilters] = useState({ actionType: '', status: '' });
  const [searchTerm, setSearchTerm] = useState('');

  // Initialize client-side Supabase client
  const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const fetchLogs = useCallback(async (currentPage: number, currentFilters: { actionType: string; status: string }, currentSearchTerm: string) => {
    if (!user) {
      setError('User not authenticated.');
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);

    const startIndex = currentPage * LOGS_PER_PAGE;
    const endIndex = startIndex + LOGS_PER_PAGE - 1;

    try {
      let query = supabase
        .from('action_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('timestamp', { ascending: false })
        .range(startIndex, endIndex);

      // Apply filters - Only apply if filter value is not 'all' or empty
      if (currentFilters.actionType && currentFilters.actionType !== 'all') {
        query = query.eq('action_type', currentFilters.actionType);
      }
      if (currentFilters.status && currentFilters.status !== 'all') {
        const successFilter = currentFilters.status === 'success';
        query = query.eq('success', successFilter);
      }
      
      // Apply search term filter
      const trimmedSearchTerm = currentSearchTerm.trim();
      if (trimmedSearchTerm) {
          // Search across action_type, message, and error columns
          query = query.or(`action_type.ilike.%${trimmedSearchTerm}%,message.ilike.%${trimmedSearchTerm}%,error.ilike.%${trimmedSearchTerm}%`);
          // query = query.ilike('message', `%${trimmedSearchTerm}%`); // Old simplified version
      }

      const { data, error: dbError, count } = await query;

      if (dbError) {
        throw dbError;
      }

      setLogs(prevLogs => currentPage === 0 ? data : [...prevLogs, ...data]);
      setHasMore(data.length === LOGS_PER_PAGE);

    } catch (err: any) {
      console.error("Error fetching audit logs:", err);
      setError(err.message || 'Failed to fetch audit logs.');
      // Don't overwrite existing logs on error during load more
      if (currentPage === 0) setLogs([]); 
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, user?.id]); // Depend on supabase client instance and user ID

  // Initial fetch and fetch on filter/search change
  useEffect(() => {
    setPage(0); // Reset page when filters change
    setLogs([]); // Clear logs when filters change
    setHasMore(true);
    fetchLogs(0, filters, searchTerm);
  }, [fetchLogs, filters, searchTerm]);

  const loadMore = () => {
    if (!isLoading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchLogs(nextPage, filters, searchTerm);
    }
  };
  
  const handleFilterChange = (filterType: 'actionType' | 'status', value: string) => {
      setFilters(prev => ({ ...prev, [filterType]: value }));
  };
  
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      setSearchTerm(event.target.value);
  };

  // TODO: Get distinct action types for the filter dropdown
  const actionTypes = ['test-log-entry', 'rate-limit-exceeded']; // Placeholder

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Audit Trail / Activity Log</h3>
      
      {/* Filtering and Search Controls */}
      <div className="flex flex-wrap gap-4 items-center">
          <Input 
              placeholder="Search messages/errors..." 
              value={searchTerm}
              onChange={handleSearchChange}
              className="max-w-sm"
          />
          <Select onValueChange={(value) => handleFilterChange('actionType', value)} value={filters.actionType}>
              <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by Action Type" />
              </SelectTrigger>
              <SelectContent>
                  <SelectItem value="all">All Action Types</SelectItem>
                  {actionTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
              </SelectContent>
          </Select>
          <Select onValueChange={(value) => handleFilterChange('status', value)} value={filters.status}>
              <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by Status" />
              </SelectTrigger>
              <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
          </Select>
      </div>

      {error && <p className="text-red-500">Error: {error}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Timestamp</TableHead>
            <TableHead>Action Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Details</TableHead>
            <TableHead>IP Address</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page === 0 && isLoading && Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={`skel-${i}`}>
              <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
              <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
              <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
              <TableCell><Skeleton className="h-4 w-[250px]" /></TableCell>
              <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
            </TableRow>
          ))}
          {!isLoading && logs.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center">No logs found.</TableCell>
            </TableRow>
          )}
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell>{new Date(log.timestamp).toLocaleString()}</TableCell>
              <TableCell>{log.action_type}</TableCell>
              <TableCell>
                <Badge variant={log.success ? 'default' : 'destructive'}>
                  {log.success ? 'Success' : 'Failed'}
                </Badge>
              </TableCell>
              <TableCell className="max-w-md truncate" title={log.message || log.error || 'N/A'}>
                  {log.message || log.error || 'N/A'}
                  {/* TODO: Maybe show params on hover/click? */} 
              </TableCell>
              <TableCell>{log.ip_address || 'N/A'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {hasMore && (
        <div className="text-center mt-4">
          <Button onClick={loadMore} disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}
    </div>
  );
}

export default AuditTrailViewer; 