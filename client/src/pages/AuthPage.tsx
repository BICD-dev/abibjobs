import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Mail, UserPlus, LogIn, ArrowLeft, Eye, EyeOff, KeyRound, Copy, CheckCircle2, ShieldCheck, SkipForward } from "lucide-react";
import { VerificationCard } from "@/components/VerificationForm";
import { useProfile } from "@/hooks/use-profile";

type AuthView = "choose" | "manual-signup" | "manual-login" | "forgot-password" | "verify";

export default function AuthPage() {
  const initialMode = new URLSearchParams(window.location.search).get("mode");
  const initialView: AuthView = initialMode === "login" ? "manual-login" : initialMode === "signup" ? "manual-signup" : "choose";
  const [view, setView] = useState<AuthView>(initialView);
  const [newUserName, setNewUserName] = useState("");
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <img src="/logo.png" alt="ABIB JOBS" className="w-10 h-10 rounded-lg" />
            <h1 className="text-3xl font-bold font-display text-foreground">ABIB JOBS</h1>
          </div>
          <p className="text-muted-foreground">Nigeria's #1 Quick Jobs Marketplace</p>
        </div>

        {view === "choose" && (
          <ChooseMethod
            onEmailLogin={() => { window.location.href = "/api/login"; }}
            onManualSignup={() => setView("manual-signup")}
            onManualLogin={() => setView("manual-login")}
          />
        )}

        {view === "manual-signup" && (
          <ManualSignup
            onBack={() => setView("choose")}
            onSwitchToLogin={() => setView("manual-login")}
            onSuccess={(firstName) => { setNewUserName(firstName); setView("verify"); }}
          />
        )}

        {view === "manual-login" && (
          <ManualLogin
            onBack={() => setView("choose")}
            onSwitchToSignup={() => setView("manual-signup")}
            onForgotPassword={() => setView("forgot-password")}
            onSuccess={() => setLocation("/jobs")}
          />
        )}

        {view === "forgot-password" && (
          <ForgotPassword
            onBack={() => setView("manual-login")}
            onGoReset={() => setLocation("/reset-password")}
          />
        )}

        {view === "verify" && (
          <VerifyStep
            firstName={newUserName}
            onDone={() => setLocation("/jobs")}
          />
        )}
      </div>
    </div>
  );
}

function ChooseMethod({
  onEmailLogin,
  onManualSignup,
  onManualLogin,
}: {
  onEmailLogin: () => void;
  onManualSignup: () => void;
  onManualLogin: () => void;
}) {
  return (
    <Card data-testid="card-auth-choose">
      <CardHeader>
        <CardTitle className="text-center text-xl">How would you like to continue?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          className="w-full"
          size="lg"
          onClick={onEmailLogin}
          data-testid="button-login-email"
        >
          <Mail className="w-5 h-5 mr-2" />
          Continue with Email
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <Button
          className="w-full"
          size="lg"
          variant="outline"
          onClick={onManualSignup}
          data-testid="button-manual-signup"
        >
          <UserPlus className="w-5 h-5 mr-2" />
          Sign Up Manually
        </Button>

        <Button
          className="w-full"
          size="lg"
          variant="outline"
          onClick={onManualLogin}
          data-testid="button-manual-login"
        >
          <LogIn className="w-5 h-5 mr-2" />
          Log In Manually
        </Button>
      </CardContent>
    </Card>
  );
}

function ManualSignup({
  onBack,
  onSwitchToLogin,
  onSuccess,
}: {
  onBack: () => void;
  onSwitchToLogin: () => void;
  onSuccess: (firstName: string) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const registerMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; email: string; password: string; phoneNumber?: string }) => {
      const res = await apiRequest("POST", "/api/auth/register", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Account Created", description: "Welcome to ABIB JOBS! Let's verify your identity." });
      onSuccess(firstName.trim());
    },
    onError: (err: Error) => {
      toast({ title: "Registration Failed", description: err.message.replace(/^\d+:\s*/, ''), variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    registerMutation.mutate({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      password,
      phoneNumber: phoneNumber.trim() || undefined,
    });
  };

  return (
    <Card data-testid="card-manual-signup">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={onBack} data-testid="button-back-signup">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <CardTitle className="text-xl">Create Your Account</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                placeholder="John"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                data-testid="input-signup-firstname"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                placeholder="Doe"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                data-testid="input-signup-lastname"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="john@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              data-testid="input-signup-email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number (optional)</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="08012345678"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              data-testid="input-signup-phone"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                data-testid="input-signup-password"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute right-0 top-0"
                onClick={() => setShowPassword(!showPassword)}
                data-testid="button-toggle-password"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              data-testid="input-signup-confirm-password"
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={registerMutation.isPending}
            data-testid="button-submit-signup"
          >
            {registerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
            Create Account
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <button type="button" onClick={onSwitchToLogin} className="text-primary font-medium hover:underline" data-testid="link-switch-to-login">
              Log in
            </button>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

function ManualLogin({
  onBack,
  onSwitchToSignup,
  onForgotPassword,
  onSuccess,
}: {
  onBack: () => void;
  onSwitchToSignup: () => void;
  onForgotPassword: () => void;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login-manual", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Welcome Back", description: "You're now logged in." });
      onSuccess();
    },
    onError: (err: Error) => {
      toast({ title: "Login Failed", description: err.message.replace(/^\d+:\s*/, ''), variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ email: email.trim(), password });
  };

  return (
    <Card data-testid="card-manual-login">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={onBack} data-testid="button-back-login">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <CardTitle className="text-xl">Log In to Your Account</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-email">Email Address</Label>
            <Input
              id="login-email"
              type="email"
              placeholder="john@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              data-testid="input-login-email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="login-password">Password</Label>
            <div className="relative">
              <Input
                id="login-password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="input-login-password"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="absolute right-0 top-0"
                onClick={() => setShowPassword(!showPassword)}
                data-testid="button-toggle-login-password"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={loginMutation.isPending}
            data-testid="button-submit-login"
          >
            {loginMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LogIn className="w-4 h-4 mr-2" />}
            Log In
          </Button>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Don't have an account?{" "}
              <button type="button" onClick={onSwitchToSignup} className="text-primary font-medium hover:underline" data-testid="link-switch-to-signup">
                Sign up
              </button>
            </p>
            <button type="button" onClick={onForgotPassword} className="text-sm text-muted-foreground hover:text-primary hover:underline" data-testid="link-forgot-password">
              Forgot Password?
            </button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ForgotPassword({
  onBack,
  onGoReset,
}: {
  onBack: () => void;
  onGoReset: () => void;
}) {
  const [email, setEmail] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const forgotMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Request failed");
      return data;
    },
    onSuccess: (data) => {
      setResetToken(data.resetToken);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const resetLink = resetToken ? `${window.location.origin}/reset-password?token=${resetToken}` : "";

  const copyLink = () => {
    navigator.clipboard.writeText(resetLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={onBack} data-testid="button-back-forgot">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <CardTitle className="text-xl">Forgot Password</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {resetToken ? (
          <div className="space-y-4">
            <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7 text-green-600" />
            </div>
            <p className="text-sm text-center text-muted-foreground">
              Your password reset link is ready. Copy it and open it in your browser.
            </p>
            <div className="bg-muted rounded-lg p-3 break-all text-xs font-mono text-foreground select-all" data-testid="text-reset-link">
              {resetLink}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={copyLink}
                data-testid="button-copy-reset-link"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" /> : <Copy className="w-4 h-4 mr-2" />}
                {copied ? "Copied!" : "Copy Link"}
              </Button>
              <Button
                className="flex-1"
                onClick={onGoReset}
                data-testid="button-open-reset"
              >
                <KeyRound className="w-4 h-4 mr-2" />
                Reset Now
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); forgotMutation.mutate(); }}
            className="space-y-4"
          >
            <p className="text-sm text-muted-foreground">
              Enter your email address and we'll generate a password reset link for you.
            </p>
            <div className="space-y-2">
              <Label htmlFor="forgot-email">Email Address</Label>
              <Input
                id="forgot-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="input-forgot-email"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={forgotMutation.isPending}
              data-testid="button-submit-forgot"
            >
              {forgotMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />}
              Get Reset Link
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Remember your password?{" "}
              <button type="button" onClick={onBack} className="text-primary font-medium hover:underline" data-testid="link-back-login">
                Log in
              </button>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function VerifyStep({ firstName, onDone }: { firstName: string; onDone: () => void }) {
  const { data: profile } = useProfile();
  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold text-foreground">Verify Your Identity</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Hi {firstName || "there"}! To keep ABIB JOBS safe, please verify your identity before posting or accepting jobs.
        </p>
      </div>

      <VerificationCard profile={profile} onSubmitted={onDone} />

      <Button
        variant="ghost"
        className="w-full text-muted-foreground"
        onClick={onDone}
        data-testid="button-skip-verification"
      >
        <SkipForward className="w-4 h-4 mr-2" />
        Skip for now — I'll verify later
      </Button>
      <p className="text-xs text-center text-muted-foreground">
        You need to be verified before you can post or accept jobs.
      </p>
    </div>
  );
}
