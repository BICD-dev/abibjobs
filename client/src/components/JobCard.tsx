import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { MapPin, Calendar, Briefcase, CheckCircle2, Clock, XCircle } from "lucide-react";
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

  return (
    <Link href={`/jobs/${job.id}`} className="block group">
      <div className="
        h-full bg-card rounded-2xl p-6 border border-border/50
        shadow-sm hover:shadow-xl hover:border-primary/20 hover:-translate-y-1
        transition-all duration-300 relative overflow-hidden
      ">
        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
          <Briefcase className="w-24 h-24 text-primary rotate-12" />
        </div>

        <div className="relative z-10 flex flex-col h-full">
          <div className="flex justify-between items-start mb-4">
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

          <div className="flex items-center text-sm text-muted-foreground mb-6">
            <MapPin className="w-4 h-4 mr-1 text-primary/70" />
            <span className="truncate">{job.location}</span>
          </div>

          <div className="mt-auto flex items-center justify-between border-t border-border/50 pt-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                {job.poster?.firstName?.[0] || 'U'}
              </div>
              <span className="text-sm font-medium text-foreground/80">
                {job.poster?.firstName || "User"}
              </span>
            </div>
            
            <div className="text-right">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Offer</p>
              <p className="text-lg font-bold text-primary">₦{Number(job.price).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
