import { useLocation } from "wouter";
import { useProfile } from "@/hooks/use-profile";
import { useAuth } from "@/hooks/use-auth";
import { VerificationCard } from "@/components/VerificationForm";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, SkipForward } from "lucide-react";

export default function VerifyPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    setLocation("/auth");
    return null;
  }

  const isAlreadyVerified = profile?.verificationStatus === "verified" || profile?.verificationStatus === "pending";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <img src="/logo.png" alt="ABIB JOBS" className="w-10 h-10 rounded-lg" />
            <h1 className="text-3xl font-bold font-display text-foreground">ABIB JOBS</h1>
          </div>
          <div className="flex items-center justify-center gap-2 mt-4 mb-1">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">Verify Your Identity</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Hi {user.firstName}! To keep ABIB JOBS safe, we need to verify your identity before you can post or accept jobs.
          </p>
        </div>

        {isAlreadyVerified ? (
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-2xl p-6 text-center space-y-3">
            <ShieldCheck className="w-10 h-10 text-green-600 mx-auto" />
            <p className="font-medium text-green-700 dark:text-green-400">
              {profile?.verificationStatus === "verified" ? "You're already verified!" : "Your documents are under review."}
            </p>
            <Button className="w-full" onClick={() => setLocation("/jobs")} data-testid="button-continue-to-jobs">
              Continue to Jobs
            </Button>
          </div>
        ) : (
          <>
            <VerificationCard
              profile={profile}
              onSubmitted={() => setLocation("/jobs")}
            />
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => setLocation("/jobs")}
              data-testid="button-skip-verification"
            >
              <SkipForward className="w-4 h-4 mr-2" />
              Skip for now — I'll verify later
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              You need to be verified before you can post or accept jobs.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
