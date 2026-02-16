import { useState } from "react";
import { useAdminDisputes, useResolveDispute, useDisputeMessage } from "@/hooks/use-disputes";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Loader2, Scale, CheckCircle, ArrowLeft, Send, Gavel, MessageSquare,
  Flag, AlertTriangle, ArrowUpCircle
} from "lucide-react";
import { format } from "date-fns";
import type { DisputeWithDetails, DisputeMessageWithSender } from "@shared/schema";

export default function AdminDisputes() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { data: disputesList, isLoading, isError } = useAdminDisputes(statusFilter);
  const { mutate: resolveDispute, isPending: isResolving } = useResolveDispute();
  const { mutate: sendMessage, isPending: isSendingMessage } = useDisputeMessage();

  const [resolveAmount, setResolveAmount] = useState("");
  const [resolveMessage, setResolveMessage] = useState("");
  const [adminReply, setAdminReply] = useState("");

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  if (isError) return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <Scale className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2 text-foreground">Access Denied</h2>
        <p className="text-muted-foreground">You don't have admin access to manage disputes.</p>
      </div>
    </div>
  );

  const disputes: DisputeWithDetails[] = disputesList || [];

  const statusFilters = [
    { label: "All", value: undefined },
    { label: "Open", value: "open" },
    { label: "Negotiating", value: "negotiating" },
    { label: "Escalated", value: "escalated" },
    { label: "Resolved", value: "resolved" },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400';
      case 'negotiating': return 'text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-400';
      case 'escalated': return 'text-red-600 border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400';
      case 'resolved': return 'text-green-600 border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400';
      default: return '';
    }
  };

  const handleResolve = (disputeId: number) => {
    const amount = parseFloat(resolveAmount);
    if (isNaN(amount) || amount < 0) return;
    resolveDispute({
      disputeId,
      resolvedAmount: amount,
      message: resolveMessage || undefined,
    }, {
      onSuccess: () => {
        setResolveAmount("");
        setResolveMessage("");
      }
    });
  };

  const handleAdminReply = (disputeId: number, jobId: number) => {
    if (!adminReply.trim()) return;
    sendMessage({
      disputeId,
      jobId,
      message: adminReply,
      type: 'message',
    }, {
      onSuccess: () => {
        setAdminReply("");
      }
    });
  };

  const escalatedCount = disputes.filter(d => d.status === 'escalated').length;
  const openCount = disputes.filter(d => d.status !== 'resolved').length;

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center gap-3 mb-8">
          <Scale className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-admin-disputes-title">Dispute Management</h1>
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <Card className="rounded-2xl">
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground mb-1">Active Disputes</p>
              <p className="text-3xl font-bold font-display text-foreground" data-testid="text-active-disputes">{openCount}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground mb-1">Escalated (Needs Action)</p>
              <p className="text-3xl font-bold font-display text-red-600 dark:text-red-400" data-testid="text-escalated-count">{escalatedCount}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground mb-1">Total Disputes</p>
              <p className="text-3xl font-bold font-display text-foreground" data-testid="text-total-disputes">{disputes.length}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {statusFilters.map((f) => (
            <Button
              key={f.label}
              size="sm"
              variant={statusFilter === f.value ? "default" : "outline"}
              onClick={() => setStatusFilter(f.value)}
              data-testid={`button-filter-${f.label.toLowerCase()}`}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {disputes.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground" data-testid="text-no-disputes">
            <Scale className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>No disputes found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {disputes.map((dispute) => (
              <Card key={dispute.id} className="rounded-2xl" data-testid={`card-dispute-${dispute.id}`}>
                <CardContent className="p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-bold text-foreground">{dispute.job?.title || "Unknown Job"}</h3>
                        <Badge variant="outline" className={getStatusColor(dispute.status)}>
                          {dispute.status === 'escalated' ? 'Escalated' : dispute.status.charAt(0).toUpperCase() + dispute.status.slice(1)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Dispute #{dispute.id} - Original price: {"\u20A6"}{Number(dispute.job?.price || 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {dispute.createdAt ? format(new Date(dispute.createdAt), "PP p") : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedId(expandedId === dispute.id ? null : dispute.id)}
                      data-testid={`button-expand-dispute-${dispute.id}`}
                    >
                      {expandedId === dispute.id ? "Collapse" : "View Details"}
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-6 text-sm mb-4">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6 border border-border">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {dispute.poster?.firstName?.[0] || "P"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-muted-foreground">Poster: <span className="text-foreground font-medium">{dispute.poster?.firstName || "Unknown"}</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6 border border-border">
                        <AvatarFallback className="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 text-xs">
                          {dispute.worker?.firstName?.[0] || "W"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-muted-foreground">Worker: <span className="text-foreground font-medium">{dispute.worker?.firstName || "Unknown"}</span></span>
                    </div>
                    {dispute.proposedAmount && (
                      <span className="text-muted-foreground">
                        Proposed: <span className="text-blue-600 dark:text-blue-400 font-bold">{"\u20A6"}{Number(dispute.proposedAmount).toLocaleString()}</span>
                      </span>
                    )}
                  </div>

                  {expandedId === dispute.id && (
                    <div className="mt-4 space-y-4 border-t border-border pt-4">
                      <h4 className="font-medium text-sm flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-primary" />
                        Conversation
                      </h4>

                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {dispute.messages?.map((msg: DisputeMessageWithSender) => (
                          <div key={msg.id} className={`rounded-xl p-3 ${
                            msg.type === 'proposal'
                              ? 'bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800'
                              : msg.type === 'acceptance'
                              ? 'bg-green-50 border border-green-200 dark:bg-green-950/30 dark:border-green-800'
                              : 'bg-muted/50 border border-border'
                          }`}>
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="text-xs font-medium text-foreground">
                                {msg.sender?.firstName || "User"}
                                {msg.senderId === dispute.posterId && " (Poster)"}
                                {msg.senderId === dispute.workerId && " (Worker)"}
                                {msg.senderId !== dispute.posterId && msg.senderId !== dispute.workerId && " (Admin)"}
                              </span>
                              {msg.type === 'proposal' && <Badge variant="secondary" className="text-xs">Proposal</Badge>}
                              {msg.type === 'acceptance' && <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">Accepted</Badge>}
                            </div>
                            <p className="text-sm text-foreground">{msg.message}</p>
                            {msg.amount && <p className="text-sm font-bold text-primary mt-1">{"\u20A6"}{Number(msg.amount).toLocaleString()}</p>}
                            <p className="text-xs text-muted-foreground mt-1">{msg.createdAt ? format(new Date(msg.createdAt), "PP p") : ""}</p>
                          </div>
                        ))}
                      </div>

                      {dispute.status !== 'resolved' && (
                        <div className="space-y-4">
                          <div className="flex gap-2">
                            <Input
                              placeholder="Send a message as admin..."
                              value={adminReply}
                              onChange={(e) => setAdminReply(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleAdminReply(dispute.id, dispute.jobId)}
                              data-testid={`input-admin-reply-${dispute.id}`}
                            />
                            <Button
                              size="icon"
                              onClick={() => handleAdminReply(dispute.id, dispute.jobId)}
                              disabled={isSendingMessage || !adminReply.trim()}
                              data-testid={`button-admin-reply-${dispute.id}`}
                            >
                              {isSendingMessage ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
                            </Button>
                          </div>

                          <Card className="p-4 border-primary/20">
                            <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                              <Gavel className="w-4 h-4 text-primary" />
                              Resolve Dispute
                            </h4>
                            <p className="text-xs text-muted-foreground mb-3">
                              Set the final amount for this job. The 22% platform fee will be deducted. Remaining goes to worker(s). Any difference from original price is refunded to poster.
                            </p>
                            <div className="space-y-2">
                              <div>
                                <label className="text-sm font-medium mb-1 block">Final Amount ({"\u20A6"})</label>
                                <Input
                                  type="number"
                                  placeholder={`Max: ${dispute.job?.price || '0'}`}
                                  value={resolveAmount}
                                  onChange={(e) => setResolveAmount(e.target.value)}
                                  min={0}
                                  max={Number(dispute.job?.price || 0)}
                                  data-testid={`input-resolve-amount-${dispute.id}`}
                                />
                              </div>
                              <div>
                                <label className="text-sm font-medium mb-1 block">Resolution Note (optional)</label>
                                <Textarea
                                  placeholder="Explain your decision..."
                                  value={resolveMessage}
                                  onChange={(e) => setResolveMessage(e.target.value)}
                                  className="resize-none"
                                  rows={2}
                                  data-testid={`input-resolve-message-${dispute.id}`}
                                />
                              </div>
                              {resolveAmount && (
                                <div className="bg-muted/50 p-3 rounded-lg text-sm space-y-1">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Final Amount</span>
                                    <span className="font-medium text-foreground">{"\u20A6"}{Number(resolveAmount).toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Platform Fee (22%)</span>
                                    <span className="font-medium text-foreground">{"\u20A6"}{(Number(resolveAmount) * 0.22).toLocaleString()}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Worker Payout</span>
                                    <span className="font-medium text-green-600 dark:text-green-400">{"\u20A6"}{(Number(resolveAmount) * 0.78).toLocaleString()}</span>
                                  </div>
                                  {Number(dispute.job?.price || 0) - Number(resolveAmount) > 0 && (
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Refund to Poster</span>
                                      <span className="font-medium text-blue-600 dark:text-blue-400">{"\u20A6"}{(Number(dispute.job?.price || 0) - Number(resolveAmount)).toLocaleString()}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                              <Button
                                className="w-full"
                                onClick={() => handleResolve(dispute.id)}
                                disabled={isResolving || !resolveAmount}
                                data-testid={`button-resolve-dispute-${dispute.id}`}
                              >
                                {isResolving ? <Loader2 className="animate-spin mr-2" /> : <Gavel className="mr-2 h-4 w-4" />}
                                Resolve Dispute
                              </Button>
                            </div>
                          </Card>
                        </div>
                      )}

                      {dispute.status === 'resolved' && dispute.resolvedAmount && (
                        <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 dark:border-green-900">
                          <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                          <div>
                            <p className="font-medium text-green-800 dark:text-green-200">Resolved</p>
                            <p className="text-sm text-green-700 dark:text-green-300">
                              Final amount: {"\u20A6"}{Number(dispute.resolvedAmount).toLocaleString()}
                              {dispute.resolvedBy === 'admin' ? ' (by admin)' : ' (by agreement)'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
