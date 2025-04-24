'use client';

import { useAuth } from '@/lib/context/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { ArrowUpRight, Users, FileText, Star, Zap } from "lucide-react"
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="container py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome to your MACRU dashboard.
          </p>
        </div>
        <ThemeToggle />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Manage your profile information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>Update your profile details and preferences.</p>
          </CardContent>
          <CardFooter>
            <Button asChild className="w-full">
              <a href="/dashboard/profile">View Profile</a>
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Files</CardTitle>
            <CardDescription>
              Manage your uploaded documents
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>No files uploaded yet.</p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full">
              Upload Files
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Settings</CardTitle>
            <CardDescription>
              Manage app settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>Configure application preferences.</p>
          </CardContent>
          <CardFooter>
            <Button asChild variant="outline" className="w-full">
              <a href="/dashboard/settings">Open Settings</a>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string
  value: string
  description: string
  icon: React.ReactNode
}

function StatCard({ title, value, description, icon }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

const activities = [
  { title: "Document uploaded", time: "10 minutes ago" },
  { title: "New user registered", time: "1 hour ago" },
  { title: "Report generated", time: "3 hours ago" },
  { title: "Settings updated", time: "Yesterday" },
]

const actions = [
  "Upload new document",
  "Create new project",
  "Invite team member",
  "Generate monthly report",
  "Update profile",
] 