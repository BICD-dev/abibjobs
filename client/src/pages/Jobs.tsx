import { useState } from "react";
import { useJobs } from "@/hooks/use-jobs";
import { Navbar } from "@/components/Navbar";
import { JobCard } from "@/components/JobCard";
import { CreateJobDialog } from "@/components/CreateJobDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, Filter } from "lucide-react";

export default function Jobs() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | undefined>(undefined);
  const { data: jobs, isLoading, error } = useJobs({ search, category, status: 'open' });

  const categories = [
    { id: "cleaning", label: "Cleaning" },
    { id: "ac_repair", label: "AC Repair" },
    { id: "phone_repair", label: "Phone Repair" },
    { id: "escort", label: "Escort" },
    { id: "other", label: "Other" },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div>
            <h1 className="text-4xl font-display font-bold text-foreground">Available Jobs</h1>
            <p className="text-muted-foreground mt-2">Find work that fits your schedule.</p>
          </div>
          <CreateJobDialog />
        </div>

        {/* Filters */}
        <div className="bg-card rounded-2xl p-4 shadow-sm border border-border/50 mb-8 space-y-4 md:space-y-0 md:flex md:items-center md:gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-12 rounded-xl border-border bg-background"
            />
          </div>
          
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
            <Button
              variant={category === undefined ? "default" : "outline"}
              onClick={() => setCategory(undefined)}
              className="rounded-xl h-12 whitespace-nowrap"
            >
              All
            </Button>
            {categories.map((cat) => (
              <Button
                key={cat.id}
                variant={category === cat.id ? "default" : "outline"}
                onClick={() => setCategory(cat.id === category ? undefined : cat.id)}
                className="rounded-xl h-12 whitespace-nowrap"
              >
                {cat.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Job Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-64 rounded-2xl bg-muted/20 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20 bg-destructive/5 rounded-3xl border border-destructive/20">
            <p className="text-destructive font-semibold">Failed to load jobs.</p>
          </div>
        ) : jobs?.length === 0 ? (
          <div className="text-center py-20 bg-muted/20 rounded-3xl border border-border">
            <Filter className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-bold text-foreground">No jobs found</h3>
            <p className="text-muted-foreground">Try adjusting your filters or search terms.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {jobs?.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
