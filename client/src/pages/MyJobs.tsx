import { useState } from "react";
import { useJobHistory } from "@/hooks/use-jobs";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/Navbar";
import { JobCard } from "@/components/JobCard";
import { Button } from "@/components/ui/button";
import { Loader2, Briefcase, ClipboardList, Hammer, History } from "lucide-react";

type TabType = 'all' | 'posted' | 'accepted';

export default function MyJobs() {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const { isAuthenticated } = useAuth();

  const role = activeTab === 'all' ? undefined : activeTab;
  const { data: jobs, isLoading } = useJobHistory(role, isAuthenticated);

  const tabs: { id: TabType; label: string; icon: typeof Briefcase }[] = [
    { id: 'all', label: 'All Jobs', icon: History },
    { id: 'posted', label: 'Jobs I Posted', icon: ClipboardList },
    { id: 'accepted', label: 'Jobs I Accepted', icon: Hammer },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-10">
          <h1 className="text-4xl font-display font-bold text-foreground" data-testid="text-my-jobs-title">My Jobs</h1>
          <p className="text-muted-foreground mt-2">Your complete job history — everything you've posted or worked on.</p>
        </div>

        <div className="flex gap-2 mb-8 overflow-x-auto pb-2 no-scrollbar" data-testid="tabs-job-history">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? "default" : "outline"}
                onClick={() => setActiveTab(tab.id)}
                className="rounded-xl whitespace-nowrap"
                data-testid={`tab-${tab.id}`}
              >
                <Icon className="w-4 h-4 mr-2" />
                {tab.label}
              </Button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-64 rounded-2xl bg-muted/20 animate-pulse" />
            ))}
          </div>
        ) : !jobs || jobs.length === 0 ? (
          <div className="text-center py-20 bg-muted/20 rounded-3xl border border-border">
            <Briefcase className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-bold text-foreground">
              {activeTab === 'posted' ? "You haven't posted any jobs yet" :
               activeTab === 'accepted' ? "You haven't accepted any jobs yet" :
               "No job history yet"}
            </h3>
            <p className="text-muted-foreground mt-2">
              {activeTab === 'posted' ? "Post your first job to get started." :
               activeTab === 'accepted' ? "Browse available jobs and start earning." :
               "Your posted and accepted jobs will show up here."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500" data-testid="grid-job-history">
            {jobs.map((job: any) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
