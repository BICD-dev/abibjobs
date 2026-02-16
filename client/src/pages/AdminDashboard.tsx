import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Eye, UserPlus, ArrowUpCircle, ArrowDownCircle, TrendingUp, Calendar } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";

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

export default function AdminDashboard() {
  const { isOwner } = useAdminAuth();
  const { data, isLoading, isError } = useQuery<DashboardAnalytics>({
    queryKey: ['/api/admin/dashboard'],
    enabled: !!isOwner,
  });

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-4xl mx-auto p-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>
          <p className="text-muted-foreground mt-2">Owner access required to view the dashboard.</p>
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

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <MiniChart data={data.recentVisitsByDay} label="Visitors" />
              <MiniChart data={data.recentSignUpsByDay} label="Sign Ups" />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}