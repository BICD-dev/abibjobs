import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@/hooks/use-notifications";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, AlertTriangle, Info, XCircle, CheckCircle, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";
import type { Notification } from "@shared/schema";

export default function Notifications() {
  const { data: notifications, isLoading } = useNotifications();
  const { mutate: markRead } = useMarkNotificationRead();
  const { mutate: markAllRead, isPending: isMarkingAll } = useMarkAllNotificationsRead();

  const typeConfig: Record<string, { icon: typeof Info; color: string; bg: string }> = {
    info: { icon: Info, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900" },
    warning: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900" },
    error: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900" },
    success: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950/30 border-green-100 dark:border-green-900" },
  };

  const unreadCount = (notifications as Notification[] | undefined)?.filter((n: Notification) => !n.isRead).length || 0;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Bell className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold font-display text-foreground" data-testid="text-notifications-title">Notifications</h1>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="bg-destructive text-destructive-foreground" data-testid="text-notifications-unread-badge">
                {unreadCount} unread
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllRead()}
              disabled={isMarkingAll}
              data-testid="button-mark-all-read"
            >
              {isMarkingAll ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCheck className="w-4 h-4 mr-1" />}
              Mark all read
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !notifications || (notifications as Notification[]).length === 0 ? (
          <Card className="p-12 text-center">
            <Bell className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No notifications yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">You'll be notified about job updates here.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {(notifications as Notification[]).map((notification: Notification) => {
              const config = typeConfig[notification.type] || typeConfig.info;
              const Icon = config.icon;
              return (
                <div
                  key={notification.id}
                  className={`p-4 rounded-xl border transition-all ${notification.isRead ? 'bg-card border-border/50 opacity-70' : config.bg}`}
                  onClick={() => { if (!notification.isRead) markRead(notification.id); }}
                  data-testid={`notification-${notification.id}`}
                >
                  <div className="flex gap-3">
                    <div className={`shrink-0 mt-0.5 ${config.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className={`font-semibold text-sm ${notification.isRead ? 'text-muted-foreground' : 'text-foreground'}`} data-testid={`notification-title-${notification.id}`}>
                          {notification.title}
                        </h3>
                        <div className="flex items-center gap-2 shrink-0">
                          {!notification.isRead && (
                            <span className="w-2 h-2 bg-primary rounded-full" data-testid={`notification-unread-dot-${notification.id}`} />
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(notification.createdAt || Date.now()), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                      <p className={`text-sm ${notification.isRead ? 'text-muted-foreground/70' : 'text-foreground/80'}`} data-testid={`notification-message-${notification.id}`}>
                        {notification.message}
                      </p>
                      {notification.jobId && (
                        <Link href={`/jobs/${notification.jobId}`}>
                          <span className="inline-block mt-2 text-xs text-primary font-medium hover:underline cursor-pointer" data-testid={`notification-job-link-${notification.id}`}>
                            View Job
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
