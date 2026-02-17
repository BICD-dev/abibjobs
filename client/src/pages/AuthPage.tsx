import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Mail, UserPlus, LogIn, ArrowLeft, Eye, EyeOff } from "lucide-react";

type AuthView = "choose" | "manual-signup" | "manual-login";

export default function AuthPage() {
  const [view, setView] = useState<AuthView>("choose");
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
            onSuccess={() => setLocation("/jobs")}
          />
        )}

        {view === "manual-login" && (
          <ManualLogin
            onBack={() => setView("choose")}
            onSwitchToSignup={() => setView("manual-signup")}
            onSuccess={() => setLocation("/jobs")}
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
  onSuccess: () => void;
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
      toast({ title: "Account Created", description: "Welcome to ABIB JOBS!" });
      onSuccess();
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
  onSuccess,
}: {
  onBack: () => void;
  onSwitchToSignup: () => void;
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

          <p className="text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <button type="button" onClick={onSwitchToSignup} className="text-primary font-medium hover:underline" data-testid="link-switch-to-signup">
              Sign up
            </button>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
