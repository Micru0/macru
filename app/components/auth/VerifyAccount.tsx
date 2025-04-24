import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function VerifyAccount() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  useEffect(() => {
    async function verifyToken() {
      if (!token) {
        setStatus("error");
        setErrorMessage("Verification token is missing");
        return;
      }

      try {
        // Here you would integrate with your authentication service
        // For example: await verifyEmail(token);
        
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // For demo purposes, let's pretend success
        setStatus("success");
      } catch (err) {
        console.error("Verification error:", err);
        setStatus("error");
        setErrorMessage("Failed to verify your account. The link may have expired or is invalid.");
      }
    }

    verifyToken();
  }, [token]);

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl text-center">Account Verification</CardTitle>
        <CardDescription className="text-center">
          Confirming your email address
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "loading" && (
          <div className="text-center py-8">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
            <p className="mt-4">Verifying your account...</p>
          </div>
        )}
        
        {status === "success" && (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                Your email has been successfully verified! Your account is now active.
              </AlertDescription>
            </Alert>
            <Button 
              onClick={() => router.push('/auth/login')}
              className="w-full"
            >
              Continue to Login
            </Button>
          </div>
        )}
        
        {status === "error" && (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
            <div className="flex flex-col space-y-2">
              <Button 
                onClick={() => router.push('/auth/login')}
                className="w-full"
              >
                Back to Login
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  // Implement resend verification logic here
                  alert("Resend verification functionality would be implemented here");
                }}
                className="w-full"
              >
                Resend Verification Email
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="text-center">
        <div className="w-full text-sm">
          Need help?{" "}
          <Link href="/support" className="text-primary underline underline-offset-4 hover:text-primary/90">
            Contact Support
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
} 