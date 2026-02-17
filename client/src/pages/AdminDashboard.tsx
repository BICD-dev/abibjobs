import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Eye, UserPlus, ArrowUpCircle, ArrowDownCircle, TrendingUp, CalendarIcon, Clock, Briefcase, Users } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { format, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";

interface DashboardAnalytics {
  totalVisitors: number;
  totalSignUps: number;
  totalTopUps: string;
  totalPaidOut: string;
  todayVisitors: number;
  todaySignUps: number;
  recentVisitsByDay: { date: string; count: number }[];
  recentSignUpsByDay: { date: string; count: number }[];
}

interface HoursWorkedData {
  totalHours: number;
  totalJobs: number;
  jobBreakdown: { jobId: number; title: string; hours: number; worker: string; completedAt: string }[];
}

interface AdminHoursEntry {
  adminId: number;
  name: string;
  email: string;
  date: string;
  secondsWorked: number;
}

function formatNaira(amount: string | number) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(num);
}

function StatCard({ title, value, subtitle, icon: Icon, color }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  color: string;
}) {
  return (
    <Card data-testid={`card-stat-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1 truncate" data-testid={`text-stat-${title.toLowerCase().replace(/\s+/g, '-')}`}>{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniChart({ data, label }: { data: { date: string; count: number }[]; label: string }) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label} (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No data yet</p>
        </CardContent>
      </Card>
    );
  }

  const maxCount = Math.max(...data.map(d => d.count), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label} (Last 30 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-[2px] h-24">
          {data.map((d) => {
            const height = Math.max((d.count / maxCount) * 100, 4);
            return (
              <div
                key={d.date}
                className="flex-1 bg-primary/70 rounded-t-sm min-w-[3px] transition-all relative group"
                style={{ height: `${height}%` }}
                title={`${d.date}: ${d.count}`}
              >
                <div className="invisible group-hover:visible absolute -top-8 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground border rounded px-2 py-0.5 text-xs whitespace-nowrap z-10">
                  {d.date.slice(5)}: {d.count}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-[10px] text-muted-foreground">{data[0]?.date.slice(5)}</span>
          <span className="text-[10px] text-muted-foreground">{data[data.length - 1]?.date.slice(5)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function formatHours(hours: number) {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes}m`;
  }
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default function AdminDashboard() {
  const { isOwner, isAdmin } = useAdminAuth();
  const hasAccess = isOwner || isAdmin;
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  const { data, isLoading, isError } = useQuery<DashboardAnalytics>({
    queryKey: ['/api/admin/dashboard'],
    enabled: !!hasAccess,
  });

  const { data: hoursData, isLoading: isHoursLoading } = useQuery<HoursWorkedData>({
    queryKey: ['/api/admin/hours-worked', dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      if (!dateRange?.from || !dateRange?.to) return { totalHours: 0, totalJobs: 0, jobBreakdown: [] };
      const params = new URLSearchParams({
        startDate: dateRange.from.toISOString(),
        endDate: dateRange.to.toISOString(),
      });
      const res = await fetch(`/api/admin/hours-worked?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch hours data");
      return res.json();
    },
    enabled: !!hasAccess && !!dateRange?.from && !!dateRange?.to,
  });

  const { data: adminHours } = useQuery<AdminHoursEntry[]>({
    queryKey: ['/api/admin/hours'],
    enabled: !!isOwner,
  });

  const adminHoursGrouped = adminHours ? adminHours.reduce((acc, entry) => {
    if (!acc[entry.adminId]) {
      acc[entry.adminId] = { name: entry.name, email: entry.email, totalSeconds: 0 };
    }
    acc[entry.adminId].totalSeconds += entry.secondsWorked;
    return acc;
  }, {} as Record<number, { name: string; email: string; totalSeconds: number }>) : {};

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-4xl mx-auto p-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>
          <p className="text-muted-foreground mt-2">Admin access required to view the dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-dashboard-title">Dashboard Overview</h1>
            <p className="text-sm text-muted-foreground">Platform analytics and key metrics</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-destructive">Failed to load dashboard data. Please try again.</p>
            </CardContent>
          </Card>
        ) : data ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard
                title="Total Visitors"
                value={data.totalVisitors.toLocaleString()}
                subtitle={`${data.todayVisitors.toLocaleString()} today`}
                icon={Eye}
                color="bg-blue-500/10 text-blue-500"
              />
              <StatCard
                title="Total Sign Ups"
                value={data.totalSignUps.toLocaleString()}
                subtitle={`${data.todaySignUps.toLocaleString()} today`}
                icon={UserPlus}
                color="bg-green-500/10 text-green-500"
              />
              <StatCard
                title="Total Top Ups"
                value={formatNaira(data.totalTopUps)}
                subtitle="All user deposits"
                icon={ArrowUpCircle}
                color="bg-purple-500/10 text-purple-500"
              />
              <StatCard
                title="Total Paid Out"
                value={formatNaira(data.totalPaidOut)}
                subtitle="Earnings + withdrawals"
                icon={ArrowDownCircle}
                color="bg-orange-500/10 text-orange-500"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              <MiniChart data={data.recentVisitsByDay} label="Visitors" />
              <MiniChart data={data.recentSignUpsByDay} label="Sign Ups" />
            </div>

            {isOwner && Object.keys(adminHoursGrouped).length > 0 && (
              <Card className="mb-8" data-testid="card-admin-hours">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
                      <Users className="w-5 h-5 text-green-500" />
                    </div>
                    <div>
                      <CardTitle>Admin Staff Hours</CardTitle>
                      <p className="text-sm text-muted-foreground mt-0.5">Total hours worked by each admin</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(adminHoursGrouped).map(([id, info]) => (
                      <div key={id} className="flex items-center justify-between gap-4 p-3 rounded-xl bg-muted/20" data-testid={`row-admin-hours-${id}`}>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground text-sm">{info.name}</p>
                          <p className="text-xs text-muted-foreground">{info.email}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-foreground">{formatHours(info.totalSeconds / 3600)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="mb-8" data-testid="card-hours-worked">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Clock className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle data-testid="text-hours-title">Total Hours Worked</CardTitle>
                      <p className="text-sm text-muted-foreground mt-0.5">Select a date range to view work hours</p>
                    </div>
                  </div>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "justify-start text-left font-normal",
                          !dateRange && "text-muted-foreground"
                        )}
                        data-testid="button-date-range-picker"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange?.from ? (
                          dateRange.to ? (
                            <>
                              {format(dateRange.from, "MMM d, yyyy")} - {format(dateRange.to, "MMM d, yyyy")}
                            </>
                          ) : (
                            format(dateRange.from, "MMM d, yyyy")
                          )
                        ) : (
                          <span>Pick a date range</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={dateRange?.from}
                        selected={dateRange}
                        onSelect={setDateRange}
                        numberOfMonths={2}
                        data-testid="calendar-date-range"
                      />
                      <div className="flex flex-wrap gap-2 p-3 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDateRange({ from: subDays(new Date(), 7), to: new Date() })}
                          data-testid="button-last-7-days"
                        >
                          Last 7 days
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDateRange({ from: subDays(new Date(), 30), to: new Date() })}
                          data-testid="button-last-30-days"
                        >
                          Last 30 days
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDateRange({ from: subDays(new Date(), 90), to: new Date() })}
                          data-testid="button-last-90-days"
                        >
                          Last 90 days
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const now = new Date();
                            setDateRange({ from: new Date(now.getFullYear(), 0, 1), to: now });
                          }}
                          data-testid="button-this-year"
                        >
                          This year
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </CardHeader>
              <CardContent>
                {isHoursLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : hoursData ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-muted/30">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <Clock className="w-4 h-4" />
                          <span className="text-sm font-medium">Total Hours</span>
                        </div>
                        <p className="text-3xl font-bold text-foreground" data-testid="text-total-hours">
                          {formatHours(hoursData.totalHours)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {hoursData.totalHours > 0 ? `${hoursData.totalHours.toFixed(2)} hours total` : "No completed jobs in this period"}
                        </p>
                      </div>
                      <div className="p-4 rounded-xl bg-muted/30">
                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                          <Briefcase className="w-4 h-4" />
                          <span className="text-sm font-medium">Jobs Completed</span>
                        </div>
                        <p className="text-3xl font-bold text-foreground" data-testid="text-total-jobs-completed">
                          {hoursData.totalJobs}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {hoursData.totalJobs > 0 && hoursData.totalHours > 0
                            ? `Avg ${formatHours(hoursData.totalHours / hoursData.totalJobs)} per job`
                            : "Within selected range"}
                        </p>
                      </div>
                    </div>

                    {hoursData.jobBreakdown.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-foreground mb-3">Job Breakdown</h4>
                        <div className="space-y-2 max-h-72 overflow-y-auto">
                          {hoursData.jobBreakdown.map((job) => (
                            <div
                              key={job.jobId}
                              className="flex items-center justify-between gap-4 p-3 rounded-xl bg-muted/20"
                              data-testid={`row-job-hours-${job.jobId}`}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-foreground text-sm truncate">{job.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  Completed {format(new Date(job.completedAt), "MMM d, yyyy 'at' h:mm a")}
                                </p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="font-bold text-foreground">{formatHours(job.hours)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {hoursData.totalJobs === 0 && (
                      <div className="text-center py-6">
                        <Clock className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                        <p className="text-muted-foreground text-sm">No completed jobs found in this date range</p>
                        <p className="text-muted-foreground text-xs mt-1">Try selecting a different period</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">Select a date range to view hours worked</div>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}
