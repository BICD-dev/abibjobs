import { Link } from "wouter";
import { formatDistanceToNow, format } from "date-fns";
import { MapPin, Briefcase, CheckCircle2, Clock, XCircle, Users, Lock, CalendarDays } from "lucide-react";
import type { JobWithDetails } from "@shared/schema";
import { Badge } from "@/components/ui/badge";

interface JobCardProps {
  job: JobWithDetails;
}

export function JobCard({ job }: JobCardProps) {
  const statusColors = {
    open: "bg-green-100 text-green-700 border-green-200",
    in_progress: "bg-blue-100 text-blue-700 border-blue-200",
    completed: "bg-gray-100 text-gray-700 border-gray-200",
    cancelled: "bg-red-100 text-red-700 border-red-200",
  };

  const StatusIcon = {
    open: Briefcase,
    in_progress: Clock,
    completed: CheckCircle2,
    cancelled: XCircle,
  }[job.status as keyof typeof statusColors] || Briefcase;

  const isAccepted = job.status === 'in_progress';
  const isPartiallyAccepted = job.status === 'open' && job.workersAccepted > 0;

  return (
    <Link href={`/jobs/${job.id}`} className="block group">
      <div className={`
        h-full bg-card rounded-2xl p-6 border border-border/50
        shadow-sm hover:shadow-xl hover:border-primary/20 hover:-translate-y-1
        transition-all duration-300 relative overflow-hidden
        ${isAccepted ? 'opacity-75' : ''}
      `}>
        {isAccepted && (
          <div className="absolute top-3 right-3 z-20" data-testid={`badge-accepted-${job.id}`}>
            <Badge variant="secondary" className="bg-blue-600 text-white border-blue-700">
              <Lock className="w-3 h-3 mr-1" />
              Accepted
            </Badge>
          </div>
        )}

        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
          <Briefcase className="w-24 h-24 text-primary rotate-12" />
        </div>

        <div className="relative z-10 flex flex-col h-full">
          <div className="flex justify-between items-start mb-4 gap-2">
            <Badge variant="outline" className={`capitalize rounded-lg px-3 py-1 font-medium border ${statusColors[job.status as keyof typeof statusColors]}`}>
              <StatusIcon className="w-3.5 h-3.5 mr-1.5" />
              {job.status.replace('_', ' ')}
            </Badge>
            <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
              {formatDistanceToNow(new Date(job.createdAt || Date.now()), { addSuffix: true })}
            </span>
          </div>

          <h3 className="text-xl font-bold font-display text-foreground mb-2 line-clamp-2 group-hover:text-primary transition-colors">
            {job.title}
          </h3>

          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-6">
            <div className="flex items-center">
              <MapPin className="w-4 h-4 mr-1 text-primary/70" />
              <span className="truncate">{job.location}</span>
            </div>
            {job.workersNeeded > 1 && (
              <div className="flex items-center" data-testid={`text-workers-${job.id}`}>
                <Users className="w-4 h-4 mr-1 text-primary/70" />
                <span>{job.workersAccepted}/{job.workersNeeded} workers</span>
              </div>
            )}
            {job.scheduledDate && (
              <div className="flex items-center" data-testid={`text-scheduled-${job.id}`}>
                <CalendarDays className="w-4 h-4 mr-1 text-primary/70" />
                <span>{format(new Date(job.scheduledDate), "PP p")}</span>
              </div>
            )}
          </div>

          {isAccepted && (
            <div className="mb-4 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 rounded-lg border border-blue-100 dark:border-blue-900" data-testid={`text-job-taken-${job.id}`}>
              This job has been accepted and is no longer available.
            </div>
          )}

          {isPartiallyAccepted && job.workersNeeded > 1 && (
            <div className="mb-4 text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-lg border border-amber-100 dark:border-amber-900" data-testid={`text-job-partial-${job.id}`}>
              {job.workersAccepted} of {job.workersNeeded} workers joined — still accepting!
            </div>
          )}

          <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/50 pt-4">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                {job.poster?.firstName?.[0] || 'U'}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground leading-none mb-0.5">Posted by</p>
                <span className="text-sm font-medium text-foreground/80 truncate block" data-testid={`text-poster-name-${job.id}`}>
                  {[job.poster?.firstName, job.poster?.lastName].filter(Boolean).join(' ') || "User"}
                </span>
              </div>
            </div>
            
            <div className="text-right">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                {job.workersNeeded > 1 && job.priceType === 'per_person' ? 'Per Person' : 'Offer'}
              </p>
              <p className="text-lg font-bold text-primary">{"\u20A6"}{Number(job.price).toLocaleString()}</p>
              {job.workersNeeded > 1 && (
                <p className="text-[11px] text-muted-foreground" data-testid={`text-price-breakdown-${job.id}`}>
                  {job.priceType === 'per_person' 
                    ? `${"\u20A6"}${(Number(job.price) * job.workersNeeded).toLocaleString()} total`
                    : `${"\u20A6"}${Math.round(Number(job.price) / job.workersNeeded).toLocaleString()}/person`
                  }
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
