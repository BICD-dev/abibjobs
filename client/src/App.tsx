import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useAdminAuth, useAdminPing } from "@/hooks/use-admin-auth";
import { Loader2 } from "lucide-react";

import Home from "@/pages/Home";
import Jobs from "@/pages/Jobs";
import JobDetails from "@/pages/JobDetails";
import Wallet from "@/pages/Wallet";
import Profile from "@/pages/Profile";
import AdminEarnings from "@/pages/AdminEarnings";
import AdminDisputes from "@/pages/AdminDisputes";
import AdminLogin from "@/pages/AdminLogin";
import AdminManagement from "@/pages/AdminManagement";
import AdminSettings from "@/pages/AdminSettings";
import Notifications from "@/pages/Notifications";
import MyJobs from "@/pages/MyJobs";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    const returnTo = encodeURIComponent(window.location.pathname);
    window.location.href = `/api/login?returnTo=${returnTo}`;
    return null;
  }

  return <Component />;
}

function AdminPingTracker() {
  const { isStaff } = useAdminAuth();
  useAdminPing(!!isStaff);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      
      <Route path="/jobs">
        {() => <ProtectedRoute component={Jobs} />}
      </Route>
      <Route path="/jobs/:id">
        {() => <ProtectedRoute component={JobDetails} />}
      </Route>
      <Route path="/my-jobs">
        {() => <ProtectedRoute component={MyJobs} />}
      </Route>
      <Route path="/wallet">
        {() => <ProtectedRoute component={Wallet} />}
      </Route>
      <Route path="/profile">
        {() => <ProtectedRoute component={Profile} />}
      </Route>
      <Route path="/admin/earnings">
        {() => <ProtectedRoute component={AdminEarnings} />}
      </Route>
      <Route path="/notifications">
        {() => <ProtectedRoute component={Notifications} />}
      </Route>
      <Route path="/admin/disputes" component={AdminDisputes} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin/staff" component={AdminManagement} />
      <Route path="/admin/settings" component={AdminSettings} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AdminPingTracker />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
