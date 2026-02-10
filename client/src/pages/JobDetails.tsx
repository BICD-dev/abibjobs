import { useRoute, useLocation } from "wouter";
import { useJob, useAcceptJob, useCompleteJob } from "@/hooks/use-jobs";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, MapPin, Calendar, ArrowLeft, CheckCircle, Shield } from "lucide-react";
import { format } from "date-fns";

export default function JobDetails() {
  const [match, params] = useRoute("/jobs/:id");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0");
  const { data: job, isLoading, error } = useJob(id);
  const { user } = useAuth();
  
  const { mutate: acceptJob, isPending: isAccepting } = useAcceptJob();
  const { mutate: completeJob, isPending: isCompleting } = useCompleteJob();

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (error || !job) return <div className="min-h-screen bg-background flex items-center justify-center text-destructive">Job not found</div>;

  const isPoster = user?.sub === job.posterId;
  const isWorker = user?.sub === job.workerId;
  const isOpen = job.status === "open";
  const isInProgress = job.status === "in_progress";
  const isCompleted = job.status === "completed";

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Button variant="ghost" className="mb-6 hover:bg-muted/50 -ml-4" onClick={() => setLocation("/jobs")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Jobs
        </Button>

        <div className="bg-card border border-border/50 rounded-3xl p-8 shadow-sm">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-8">
            <div className="space-y-4">
              <Badge variant="outline" className="rounded-lg px-3 py-1 font-medium bg-primary/5 text-primary border-primary/20 capitalize">
                {job.status.replace('_', ' ')}
              </Badge>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">{job.title}</h1>
              <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
                <div className="flex items-center">
                  <MapPin className="w-4 h-4 mr-1.5 text-primary" />
                  {job.location}
                </div>
                <div className="flex items-center">
                  <Calendar className="w-4 h-4 mr-1.5 text-primary" />
                  Posted {format(new Date(job.createdAt || Date.now()), "PP")}
                </div>
              </div>
            </div>
            
            <div className="bg-primary/5 px-8 py-6 rounded-2xl text-center min-w-[200px] border border-primary/10">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-2">Price</p>
              <p className="text-4xl font-display font-bold text-primary">₦{Number(job.price).toLocaleString()}</p>
              <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-primary/80 font-medium">
                <Shield className="w-3.5 h-3.5" /> Escrow Secured
              </div>
            </div>
          </div>

          <hr className="border-border/50 my-8" />

          {/* Content */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="md:col-span-2 space-y-8">
              <section>
                <h3 className="text-lg font-bold font-display mb-4">Description</h3>
                <p className="text-muted-foreground whitespace-pre-line leading-relaxed text-lg">
                  {job.description}
                </p>
              </section>

              {/* Actions Area */}
              <div className="bg-muted/30 rounded-2xl p-6 border border-border mt-8">
                <h3 className="text-lg font-bold font-display mb-4">Actions</h3>
                
                {isCompleted ? (
                  <div className="flex items-center text-green-600 bg-green-50 p-4 rounded-xl border border-green-100">
                    <CheckCircle className="w-5 h-5 mr-2" />
                    This job has been completed and paid for.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Poster Actions */}
                    {isPoster && (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">You posted this job.</p>
                        {isInProgress ? (
                          <Button 
                            className="w-full h-12 text-lg bg-green-600 hover:bg-green-700 text-white rounded-xl shadow-lg shadow-green-600/20"
                            onClick={() => completeJob(job.id)}
                            disabled={isCompleting}
                          >
                            {isCompleting ? <Loader2 className="animate-spin mr-2" /> : <CheckCircle className="mr-2 h-5 w-5" />}
                            Mark as Completed & Release Funds
                          </Button>
                        ) : isOpen ? (
                          <p className="text-sm font-medium text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-100">
                            Waiting for someone to accept your job.
                          </p>
                        ) : null}
                      </div>
                    )}

                    {/* Worker Actions */}
                    {!isPoster && (
                      <div className="space-y-4">
                        {isOpen ? (
                          <Button 
                            className="w-full h-12 text-lg bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/25"
                            onClick={() => acceptJob(job.id)}
                            disabled={isAccepting}
                          >
                            {isAccepting ? <Loader2 className="animate-spin mr-2" /> : "Accept This Job"}
                          </Button>
                        ) : isWorker && isInProgress ? (
                          <div className="text-center p-4 bg-primary/10 rounded-xl text-primary font-medium border border-primary/20">
                            You are working on this job. Waiting for client to confirm completion.
                          </div>
                        ) : !isOpen && !isWorker ? (
                          <div className="text-center p-4 bg-muted text-muted-foreground rounded-xl">
                            This job is already taken.
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-8">
              <section>
                <h3 className="text-lg font-bold font-display mb-4">Posted By</h3>
                <div className="flex items-center gap-4 bg-background p-4 rounded-xl border border-border shadow-sm">
                  <Avatar className="h-12 w-12 border border-border">
                    <AvatarImage src={undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                      {job.posterId.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-bold text-sm">User {job.posterId.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">Verified Member</p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
