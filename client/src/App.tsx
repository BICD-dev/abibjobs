import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/use-profile";
import { useAdminAuth, useAdminPing } from "@/hooks/use-admin-auth";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

import { useGlobalVisitorTracking } from "@/hooks/use-visitor-tracking";
import Home from "@/pages/Home";
import AuthPage from "@/pages/AuthPage";
import Jobs from "@/pages/Jobs";
import JobDetails from "@/pages/JobDetails";
import Profile from "@/pages/Profile";
import VerifyPage from "@/pages/VerifyPage";
import AdminEarnings from "@/pages/AdminEarnings";
import AdminDisputes from "@/pages/AdminDisputes";
import AdminLogin from "@/pages/AdminLogin";
import AdminManagement from "@/pages/AdminManagement";
import AdminSettings from "@/pages/AdminSettings";
import AdminVerifications from "@/pages/AdminVerifications";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminProfile from "@/pages/AdminProfile";
import AdminPayroll from "@/pages/AdminPayroll";
import AdminNotifications from "@/pages/AdminNotifications";
import AdminSupport from "@/pages/AdminSupport";
import AdminSecurityRecords from "@/pages/AdminSecurityRecords";
import Notifications from "@/pages/Notifications";
import MyJobs from "@/pages/MyJobs";
import NotFound from "@/pages/not-found";
import ResetPassword from "@/pages/ResetPassword";
import PaymentCallback from "./pages/PaymentCallback";
import TransactionHistory from "./pages/TransactionHistory";
import AppealSuspension from "./pages/AppealSuspension";
import { SupportChat } from "@/components/SupportChat";
import { CallProvider } from "@/components/CallProvider";

// Redirects OIDC (non-manual) new users to /verify once per browser session.
// Manual-signup users are already redirected inline on the AuthPage.
function OidcVerifyGuard() {
  const { user, isLoading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!user) return;

    // Only redirect OIDC users (manual-signup users get the inline verify step on AuthPage)
    const isManual = (user as any).authMethod === "manual";
    if (isManual) return;

    // Only redirect from protected routes, not auth/verify itself
    const skipPaths = ["/", "/auth", "/verify", "/reset-password", "/admin"];
    if (skipPaths.some((p) => location === p || location.startsWith("/admin"))) return;

    // Only once per browser session
    const flagKey = `verified_redirect_${user.id}`;
    if (sessionStorage.getItem(flagKey)) return;

    if (profile?.verificationStatus === "unverified") {
      sessionStorage.setItem(flagKey, "1");
      setLocation("/verify");
    }
  }, [user, profile, authLoading, profileLoading, location]);

  return null;
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) {
      window.location.href = "/";
    }
  }, [isLoading, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return <Component />;
}

function AdminPingTracker() {
  const { isStaff } = useAdminAuth();
  useAdminPing(!!isStaff);
  return null;
}

// Guards admin-only pages: shows a spinner while auth resolves and, when the
// admin session is missing or has expired, redirects to the home page.
function AdminGate({ children }: { children: React.ReactNode }) {
  const { adminUser, isLoading } = useAdminAuth();

  useEffect(() => {
    if (!isLoading && !adminUser) {
      window.location.href = "/";
    }
  }, [isLoading, adminUser]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!adminUser) return null;

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/verify">
        {() => <ProtectedRoute component={VerifyPage} />}
      </Route>

      <Route path="/jobs">
        {() => <ProtectedRoute component={Jobs} />}
      </Route>
      <Route path="/jobs/:id">
        {() => <ProtectedRoute component={JobDetails} />}
      </Route>
      <Route path="/my-jobs">
        {() => <ProtectedRoute component={MyJobs} />}
      </Route>
      <Route path="/transactions">
        {() => <ProtectedRoute component={TransactionHistory} />}
      </Route>
      <Route path="/payment/callback">
        {() => <ProtectedRoute component={PaymentCallback} />}
      </Route>
      <Route path="/appeals">
        {() => <ProtectedRoute component={AppealSuspension} />}
      </Route>
      <Route path="/profile">
        {() => <ProtectedRoute component={Profile} />}
      </Route>
      <Route path="/admin/earnings">
        {() => <AdminGate><ProtectedRoute component={AdminEarnings} /></AdminGate>}
      </Route>
      <Route path="/admin/dashboard">
        {() => <AdminGate><ProtectedRoute component={AdminDashboard} /></AdminGate>}
      </Route>
      <Route path="/notifications">
        {() => <ProtectedRoute component={Notifications} />}
      </Route>
      <Route path="/admin/disputes">
        {() => <AdminGate><AdminDisputes /></AdminGate>}
      </Route>
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin/staff">
        {() => <AdminGate><AdminManagement /></AdminGate>}
      </Route>
      <Route path="/admin/settings">
        {() => <AdminGate><AdminSettings /></AdminGate>}
      </Route>
      <Route path="/admin/profile">
        {() => <AdminGate><AdminProfile /></AdminGate>}
      </Route>
      <Route path="/admin/payroll" component={AdminPayroll} />
      <Route path="/admin/notifications">
        {() => <AdminGate><AdminNotifications /></AdminGate>}
      </Route>
      <Route path="/admin/verifications">
        {() => <AdminGate><AdminVerifications /></AdminGate>}
      </Route>
      <Route path="/admin/support">
        {() => <AdminGate><AdminSupport /></AdminGate>}
      </Route>
      <Route path="/admin/security">
        {() => <AdminGate><AdminSecurityRecords /></AdminGate>}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function VisitorTracker() {
  useGlobalVisitorTracking();
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CallProvider>
          <Toaster />
          <AdminPingTracker />
          <VisitorTracker />
          <OidcVerifyGuard />
          <Router />
          <SupportChat />
        </CallProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
