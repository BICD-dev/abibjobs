import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, AlertTriangle, Info, XCircle, CheckCircle, Loader2, Scale, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import type { AdminNotification } from "@shared/schema";

export default function AdminNotifications() {
  const { isStaff, isOwner } = useAdminAuth();
  const queryClient = useQueryClient();

  const { data: notifications, isLoading } = useQuery<AdminNotification[]>({
    queryKey: ["/api/admin/notifications"],
    queryFn: async () => {
      const res = await fetch("/api/admin/notifications", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!isStaff || !!isOwner,
  });

  const markRead = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/notifications/${id}/read`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications/unread-count"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/notifications/read-all", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/notifications/unread-count"] });
    },
  });

  const typeConfig: Record<string, { icon: typeof Info; color: string; bg: string }> = {
    info: { icon: Info, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900" },
    warning: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900" },
    error: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900" },
    success: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30 border-green-100 dark:border-green-900" },
  };

  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;

  if (!isStaff && !isOwner) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2 text-foreground">Access Denied</h2>
          <p className="text-muted-foreground">Admin access required.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between gap-4 mb-8 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground" data-testid="text-admin-notifications-title">Admin Notifications</h1>
              <p className="text-sm text-muted-foreground">Stay updated on disputes, payments & changes</p>
            </div>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="bg-destructive text-destructive-foreground" data-testid="text-admin-unread-badge">
                {unreadCount} unread
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              data-testid="button-admin-mark-all-read"
            >
              {markAllRead.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCheck className="w-4 h-4 mr-1" />}
              Mark all read
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !notifications || notifications.length === 0 ? (
          <Card className="p-12 text-center">
            <Bell className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No notifications yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">You'll be notified about disputes, payments, and account changes here.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => {
              const config = typeConfig[notification.type] || typeConfig.info;
              const Icon = config.icon;
              return (
                <div
                  key={notification.id}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${notification.isRead ? 'bg-card border-border/50 opacity-70' : config.bg}`}
                  onClick={() => { if (!notification.isRead) markRead.mutate(notification.id); }}
                  data-testid={`admin-notification-${notification.id}`}
                >
                  <div className="flex gap-3">
                    <div className={`shrink-0 mt-0.5 ${config.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className={`font-semibold text-sm ${notification.isRead ? 'text-muted-foreground' : 'text-foreground'}`} data-testid={`admin-notification-title-${notification.id}`}>
                          {notification.title}
                        </h3>
                        <div className="flex items-center gap-2 shrink-0">
                          {!notification.isRead && (
                            <span className="w-2 h-2 bg-primary rounded-full" data-testid={`admin-notification-unread-dot-${notification.id}`} />
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(notification.createdAt || Date.now()), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                      <p className={`text-sm ${notification.isRead ? 'text-muted-foreground/70' : 'text-foreground/80'}`} data-testid={`admin-notification-message-${notification.id}`}>
                        {notification.message}
                      </p>
                      {notification.disputeId && (
                        <Link href={`/admin/disputes`}>
                          <span className="inline-flex items-center gap-1 mt-2 text-xs text-primary font-medium hover:underline cursor-pointer" data-testid={`admin-notification-dispute-link-${notification.id}`}>
                            <Scale className="w-3 h-3" />
                            View Disputes
                          </span>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
