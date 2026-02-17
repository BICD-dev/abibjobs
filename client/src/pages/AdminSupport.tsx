import { useState, useEffect, useRef } from "react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  MessageCircle,
  Send,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  UserCircle,
  Headphones,
} from "lucide-react";
import type { SupportTicket, SupportMessage } from "@shared/schema";

function TicketStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "waiting":
      return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Waiting</Badge>;
    case "active":
      return <Badge variant="default"><CheckCircle2 className="w-3 h-3 mr-1" />Active</Badge>;
    case "resolved":
      return <Badge variant="outline"><CheckCircle2 className="w-3 h-3 mr-1" />Resolved</Badge>;
    case "closed":
      return <Badge variant="outline"><XCircle className="w-3 h-3 mr-1" />Closed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function TicketChat({ ticket, onBack }: { ticket: SupportTicket; onBack: () => void }) {
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: messages = [], isLoading } = useQuery<SupportMessage[]>({
    queryKey: ["/api/admin/support/tickets", ticket.id, "messages"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/support/tickets/${ticket.id}/messages`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 3000,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const assignTicket = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/support/tickets/${ticket.id}/assign`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/tickets", ticket.id, "messages"] });
    },
  });

  const sendMessage = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", `/api/admin/support/tickets/${ticket.id}/messages`, { message });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/tickets", ticket.id, "messages"] });
      setMessageText("");
      setTimeout(() => inputRef.current?.focus(), 100);
    },
  });

  const closeTicket = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/support/tickets/${ticket.id}/close`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support/tickets"] });
      onBack();
    },
  });

  const handleSend = () => {
    if (messageText.trim() && !sendMessage.isPending) {
      sendMessage.mutate(messageText.trim());
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      <div className="flex items-center justify-between gap-2 p-4 border-b flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Button size="icon" variant="ghost" onClick={onBack} data-testid="button-back-tickets">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{ticket.userName}</span>
              <TicketStatusBadge status={ticket.status} />
            </div>
            <p className="text-xs text-muted-foreground truncate">{ticket.ticketNumber} - {ticket.subject}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ticket.status === "waiting" && (
            <Button
              size="sm"
              onClick={() => assignTicket.mutate()}
              disabled={assignTicket.isPending}
              data-testid="button-join-chat"
            >
              {assignTicket.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Headphones className="w-4 h-4 mr-1" />}
              Join Chat
            </Button>
          )}
          {(ticket.status === "active" || ticket.status === "waiting") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => closeTicket.mutate()}
              disabled={closeTicket.isPending}
              data-testid="button-resolve-ticket"
            >
              Resolve
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm">No messages yet</p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.senderType === "admin" ? "justify-end" : "justify-start"}`}
              data-testid={`admin-message-${msg.id}`}
            >
              <div
                className={`max-w-[75%] rounded-md px-3 py-2 text-sm ${
                  msg.senderType === "admin"
                    ? "bg-primary text-primary-foreground"
                    : msg.senderType === "system"
                    ? "bg-muted text-muted-foreground text-xs italic"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {msg.senderType === "user" && (
                  <p className="text-xs font-semibold mb-0.5 opacity-80">{msg.senderName}</p>
                )}
                <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                <p className="text-[10px] opacity-60 mt-1">
                  {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {(ticket.status === "active") && (
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              placeholder="Type a reply..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={sendMessage.isPending}
              data-testid="input-admin-support-message"
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!messageText.trim() || sendMessage.isPending}
              data-testid="button-admin-send-message"
            >
              {sendMessage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminSupport() {
  const { isOwner, isStaff } = useAdminAuth();
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  if (!isOwner && !isStaff) {
    return (
      <>
        <Navbar />
        <div className="container mx-auto p-6 text-center">
          <p className="text-muted-foreground">Admin access required</p>
        </div>
      </>
    );
  }

  const { data: tickets = [], isLoading } = useQuery<SupportTicket[]>({
    queryKey: ["/api/admin/support/tickets", statusFilter],
    queryFn: async () => {
      const url = statusFilter === "all"
        ? "/api/admin/support/tickets"
        : `/api/admin/support/tickets?status=${statusFilter}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 10000,
  });

  const { data: waitingData } = useQuery<{ count: number }>({
    queryKey: ["/api/admin/support/waiting-count"],
    queryFn: async () => {
      const res = await fetch("/api/admin/support/waiting-count", { credentials: "include" });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    refetchInterval: 10000,
  });

  const waitingCount = waitingData?.count || 0;

  if (selectedTicket) {
    const freshTicket = tickets.find(t => t.id === selectedTicket.id) || selectedTicket;
    return (
      <>
        <Navbar />
        <div className="container mx-auto max-w-4xl">
          <TicketChat ticket={freshTicket} onBack={() => setSelectedTicket(null)} />
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="container mx-auto max-w-4xl p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <Headphones className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold" data-testid="text-admin-support-title">Live Support</h1>
            {waitingCount > 0 && (
              <Badge variant="destructive" data-testid="badge-waiting-count">{waitingCount} waiting</Badge>
            )}
          </div>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {["all", "waiting", "active", "resolved", "closed"].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              onClick={() => setStatusFilter(s)}
              data-testid={`button-filter-${s}`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : tickets.length === 0 ? (
          <Card className="p-8 text-center">
            <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No support tickets found</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {tickets.map((ticket) => (
              <Card
                key={ticket.id}
                className="p-4 hover-elevate cursor-pointer"
                onClick={() => setSelectedTicket(ticket)}
                data-testid={`card-ticket-${ticket.id}`}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <UserCircle className="w-9 h-9 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{ticket.userName}</span>
                        <span className="text-xs text-muted-foreground font-mono">{ticket.ticketNumber}</span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{ticket.subject}</p>
                      {ticket.assignedAdminName && (
                        <p className="text-xs text-muted-foreground">Assigned to: {ticket.assignedAdminName}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <TicketStatusBadge status={ticket.status} />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString() : ''}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
