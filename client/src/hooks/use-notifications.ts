import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";

export function useNotifications() {
  return useQuery({
    queryKey: [api.notifications.list.path],
    queryFn: async () => {
      const res = await fetch(api.notifications.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
  });
}

export function useUnreadNotificationCount(enabled: boolean = true) {
  return useQuery({
    queryKey: [api.notifications.unreadCount.path],
    queryFn: async () => {
      const res = await fetch(api.notifications.unreadCount.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch unread count");
      return res.json();
    },
    refetchInterval: 30000,
    enabled,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.notifications.markRead.path, { id });
      const res = await fetch(url, {
        method: api.notifications.markRead.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to mark notification as read");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.notifications.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.notifications.unreadCount.path] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(api.notifications.markAllRead.path, {
        method: api.notifications.markAllRead.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to mark all as read");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.notifications.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.notifications.unreadCount.path] });
    },
  });
}
