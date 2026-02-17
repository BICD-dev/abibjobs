import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Send, Loader2, Clock, CheckCircle2 } from "lucide-react";
import type { SupportTicket, SupportMessage } from "@shared/schema";

function TicketStatusBadge({ status }: { status: string }) {
  if (status === "waiting") {
    return <Badge variant="secondary" data-testid="badge-ticket-waiting"><Clock className="w-3 h-3 mr-1" />Waiting for agent</Badge>;
  }
  if (status === "active") {
    return <Badge variant="default" data-testid="badge-ticket-active"><CheckCircle2 className="w-3 h-3 mr-1" />Connected</Badge>;
  }
  return <Badge variant="outline" data-testid="badge-ticket-closed">{status}</Badge>;
}

export function SupportChat() {
  const { user, isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [messageText, setMessageText] = useState("");
  const [lastMessageId, setLastMessageId] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: activeTicket, isLoading: ticketLoading } = useQuery<SupportTicket | null>({
    queryKey: ["/api/support/active"],
    queryFn: async () => {
      const res = await fetch("/api/support/active", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isAuthenticated && isOpen,
    refetchInterval: isOpen ? 5000 : false,
  });

  const { data: messages = [] } = useQuery<SupportMessage[]>({
    queryKey: ["/api/support/tickets", activeTicket?.id, "messages"],
    queryFn: async () => {
      if (!activeTicket?.id) return [];
      const res = await fetch(`/api/support/tickets/${activeTicket.id}/messages`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeTicket?.id && isOpen,
    refetchInterval: isOpen && activeTicket ? 3000 : false,
  });

  useEffect(() => {
    if (messages.length > 0) {
      const maxId = Math.max(...messages.map(m => m.id));
      if (maxId > lastMessageId) {
        setLastMessageId(maxId);
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [messages, lastMessageId]);

  const createTicket = useMutation({
    mutationFn: async (subject: string) => {
      const res = await apiRequest("POST", "/api/support/tickets", { subject });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/active"] });
      setSubject("");
    },
  });

  const sendMessage = useMutation({
    mutationFn: async (message: string) => {
      if (!activeTicket) throw new Error("No active ticket");
      const res = await apiRequest("POST", `/api/support/tickets/${activeTicket.id}/messages`, { message });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets", activeTicket?.id, "messages"] });
      setMessageText("");
      setTimeout(() => inputRef.current?.focus(), 100);
    },
  });

  const closeTicket = useMutation({
    mutationFn: async () => {
      if (!activeTicket) throw new Error("No active ticket");
      const res = await apiRequest("POST", `/api/support/tickets/${activeTicket.id}/close`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/active"] });
    },
  });

  const handleSendMessage = useCallback(() => {
    if (messageText.trim() && !sendMessage.isPending) {
      sendMessage.mutate(messageText.trim());
    }
  }, [messageText, sendMessage]);

  if (!isAuthenticated) return null;

  return (
    <>
      {!isOpen && (
        <Button
          size="icon"
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50"
          onClick={() => setIsOpen(true)}
          data-testid="button-open-support-chat"
        >
          <MessageCircle className="w-6 h-6" />
        </Button>
      )}

      {isOpen && (
        <Card className="fixed bottom-6 right-6 w-[360px] max-w-[calc(100vw-2rem)] h-[500px] max-h-[calc(100vh-4rem)] z-50 flex flex-col shadow-xl" data-testid="container-support-chat">
          <div className="flex items-center justify-between gap-2 p-3 border-b bg-primary text-primary-foreground rounded-t-md">
            <div className="flex items-center gap-2 min-w-0">
              <MessageCircle className="w-5 h-5 flex-shrink-0" />
              <span className="font-semibold text-sm truncate">Support Chat</span>
            </div>
            <div className="flex items-center gap-1">
              {activeTicket && (activeTicket.status === 'waiting' || activeTicket.status === 'active') && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-primary-foreground h-7 text-xs no-default-hover-elevate"
                  onClick={() => closeTicket.mutate()}
                  disabled={closeTicket.isPending}
                  data-testid="button-end-chat"
                >
                  End
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="text-primary-foreground h-7 w-7 no-default-hover-elevate"
                onClick={() => setIsOpen(false)}
                data-testid="button-close-chat-panel"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {ticketLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : !activeTicket ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 px-4">
                <MessageCircle className="w-12 h-12 text-muted-foreground" />
                <div className="text-center">
                  <h3 className="font-semibold text-sm mb-1">Need help?</h3>
                  <p className="text-xs text-muted-foreground mb-4">Tell us what you need help with and a live agent will connect with you shortly.</p>
                </div>
                <div className="w-full space-y-2">
                  <Input
                    placeholder="Describe your query..."
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && subject.trim()) {
                        createTicket.mutate(subject.trim());
                      }
                    }}
                    data-testid="input-support-subject"
                  />
                  <Button
                    className="w-full"
                    disabled={!subject.trim() || createTicket.isPending}
                    onClick={() => createTicket.mutate(subject.trim())}
                    data-testid="button-start-chat"
                  >
                    {createTicket.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Start Chat
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs text-muted-foreground font-mono">{activeTicket.ticketNumber}</span>
                  <TicketStatusBadge status={activeTicket.status} />
                </div>

                {activeTicket.status === "waiting" && (
                  <div className="flex flex-col items-center gap-2 py-4 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Waiting for a live agent to connect...</p>
                    <p className="text-xs text-muted-foreground">Please hold on, you'll be connected shortly.</p>
                  </div>
                )}

                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.senderType === "user" ? "justify-end" : "justify-start"}`}
                    data-testid={`message-${msg.id}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-md px-3 py-2 text-sm ${
                        msg.senderType === "user"
                          ? "bg-primary text-primary-foreground"
                          : msg.senderType === "system"
                          ? "bg-muted text-muted-foreground text-xs italic"
                          : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {msg.senderType === "admin" && (
                        <p className="text-xs font-semibold mb-0.5 opacity-80">{msg.senderName}</p>
                      )}
                      <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                      <p className="text-[10px] opacity-60 mt-1">
                        {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {activeTicket && (activeTicket.status === "active" || activeTicket.status === "waiting") && (
            <div className="p-3 border-t">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  placeholder="Type a message..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  disabled={sendMessage.isPending}
                  data-testid="input-support-message"
                />
                <Button
                  size="icon"
                  onClick={handleSendMessage}
                  disabled={!messageText.trim() || sendMessage.isPending}
                  data-testid="button-send-support-message"
                >
                  {sendMessage.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          )}

          {activeTicket && (activeTicket.status === "resolved" || activeTicket.status === "closed") && (
            <div className="p-3 border-t text-center">
              <p className="text-xs text-muted-foreground mb-2">This chat has ended.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/support/active"] });
                }}
                data-testid="button-new-chat"
              >
                Start New Chat
              </Button>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
