import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-8">
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Check Your Email</CardTitle>
          <CardDescription className="text-center">
            We've sent you a verification link
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription>
              Please check your email for a verification link. Click the link to verify your account and complete the registration process.
            </AlertDescription>
          </Alert>
          <p className="text-center text-sm text-muted-foreground">
            If you don't see the email in your inbox, please check your spam folder.
          </p>
        </CardContent>
      </Card>
    </main>
  );
} 