import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

import Home from "@/pages/Home";
import Jobs from "@/pages/Jobs";
import JobDetails from "@/pages/JobDetails";
import Wallet from "@/pages/Wallet";
import Profile from "@/pages/Profile";
import AdminEarnings from "@/pages/AdminEarnings";
import NotFound from "@/pages/not-found";

// Higher-order component for protected routes
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
    window.location.href = "/api/login";
    return null;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      
      {/* Protected Routes */}
      <Route path="/jobs">
        {() => <ProtectedRoute component={Jobs} />}
      </Route>
      <Route path="/jobs/:id">
        {() => <ProtectedRoute component={JobDetails} />}
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

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
