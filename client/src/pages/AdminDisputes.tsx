import { useState, useRef, useEffect } from "react";
import { useAdminDisputes, useResolveDispute, useDisputeMessage, useUploadDisputeImage } from "@/hooks/use-disputes";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Loader2, Scale, CheckCircle, Send, Gavel, MessageSquare,
  Image as ImageIcon, ArrowLeft, RefreshCw, Undo2, ArrowRight, Sliders
} from "lucide-react";
import { format } from "date-fns";
import type { DisputeWithDetails, DisputeMessageWithSender } from "@shared/schema";

export default function AdminDisputes() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [selectedDispute, setSelectedDispute] = useState<DisputeWithDetails | null>(null);
  const { data: disputesList, isLoading, isError, refetch } = useAdminDisputes(statusFilter);
  const { mutate: resolveDispute, isPending: isResolving } = useResolveDispute();
  const { mutate: sendMessage, isPending: isSendingMessage } = useDisputeMessage();
  const { mutateAsync: uploadImage, isPending: isUploading } = useUploadDisputeImage();

  const [adminReply, setAdminReply] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [resolveAction, setResolveAction] = useState<'refund_poster' | 'release_worker' | 'custom'>('release_worker');
  const [customWorkerAmount, setCustomWorkerAmount] = useState("");
  const [customPosterRefund, setCustomPosterRefund] = useState("");
  const [resolveNote, setResolveNote] = useState("");

  useEffect(() => {
    if (selectedDispute && disputesList) {
      const updated = disputesList.find((d: DisputeWithDetails) => d.id === selectedDispute.id);
      if (updated) setSelectedDispute(updated);
    }
  }, [disputesList]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedDispute?.messages]);

  const disputes: DisputeWithDetails[] = disputesList || [];

  if (isLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

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

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAdminReply = async (dispute: DisputeWithDetails) => {
    if (!adminReply.trim() && !selectedImage) return;

    let imageUrl: string | undefined;
    if (selectedImage) {
      try {
        imageUrl = await uploadImage(selectedImage);
      } catch {
        return;
      }
    }

    sendMessage({
      disputeId: dispute.id,
      jobId: dispute.jobId,
      message: adminReply.trim() || (imageUrl ? "Attached image" : ""),
      type: 'message',
      imageUrl,
    }, {
      onSuccess: () => {
        setAdminReply("");
        clearImage();
        refetch();
      }
    });
  };

  const handleResolve = (dispute: DisputeWithDetails) => {
    const originalPrice = Number(dispute.job?.price || 0);

    if (resolveAction === 'custom') {
      const wa = parseFloat(customWorkerAmount) || 0;
      const pr = parseFloat(customPosterRefund) || 0;
      if (wa + pr > originalPrice) return;
      resolveDispute({
        disputeId: dispute.id,
        action: 'custom',
        workerAmount: wa,
        posterRefund: pr,
        message: resolveNote || undefined,
      }, {
        onSuccess: () => {
          setCustomWorkerAmount("");
          setCustomPosterRefund("");
          setResolveNote("");
          refetch();
        }
      });
    } else {
      resolveDispute({
        disputeId: dispute.id,
        action: resolveAction,
        message: resolveNote || undefined,
      }, {
        onSuccess: () => {
          setResolveNote("");
          refetch();
        }
      });
    }
  };

  const escalatedCount = disputes.filter(d => d.status === 'escalated').length;
  const openCount = disputes.filter(d => d.status !== 'resolved').length;

  if (selectedDispute) {
    const dispute = selectedDispute;
    const originalPrice = Number(dispute.job?.price || 0);

    return (
      <div className="min-h-screen bg-background pb-20">
        <Navbar />
        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSelectedDispute(null); clearImage(); }}
            className="mb-4"
            data-testid="button-back-disputes"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Disputes
          </Button>

          <Card className="rounded-2xl mb-6">
            <CardContent className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h2 className="text-xl font-bold text-foreground" data-testid="text-dispute-title">{dispute.job?.title || "Unknown Job"}</h2>
                    <Badge variant="outline" className={getStatusColor(dispute.status)}>
                      {dispute.status.charAt(0).toUpperCase() + dispute.status.slice(1)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Dispute #{dispute.id} &middot; Escrowed: {"\u20A6"}{originalPrice.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {dispute.createdAt ? format(new Date(dispute.createdAt), "PPP 'at' p") : ""}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => refetch()} data-testid="button-refresh-dispute">
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8 border border-border">
                    <AvatarImage src={dispute.poster?.profileImageUrl || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {dispute.poster?.firstName?.[0] || "P"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-xs text-muted-foreground">Job Poster</p>
                    <p className="font-medium text-foreground text-sm" data-testid="text-poster-name">{dispute.poster?.firstName} {dispute.poster?.lastName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8 border border-border">
                    <AvatarImage src={dispute.worker?.profileImageUrl || undefined} />
                    <AvatarFallback className="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 text-xs">
                      {dispute.worker?.firstName?.[0] || "W"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-xs text-muted-foreground">Job Seeker</p>
                    <p className="font-medium text-foreground text-sm" data-testid="text-worker-name">{dispute.worker?.firstName} {dispute.worker?.lastName}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl mb-6">
            <CardContent className="p-4">
              <h3 className="font-medium text-sm flex items-center gap-2 mb-4 text-foreground">
                <MessageSquare className="w-4 h-4 text-primary" />
                Conversation
              </h3>

              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1" data-testid="dispute-chat">
                {dispute.messages?.map((msg: DisputeMessageWithSender) => {
                  const isPoster = msg.senderId === dispute.posterId;
                  const isWorker = msg.senderId === dispute.workerId;
                  const isAdminMsg = !isPoster && !isWorker;

                  return (
                    <div key={msg.id} className={`rounded-xl p-3 ${
                      isAdminMsg
                        ? 'bg-primary/5 border border-primary/20'
                        : msg.type === 'proposal'
                        ? 'bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800'
                        : msg.type === 'acceptance'
                        ? 'bg-green-50 border border-green-200 dark:bg-green-950/30 dark:border-green-800'
                        : 'bg-muted/50 border border-border'
                    }`} data-testid={`msg-${msg.id}`}>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Avatar className="h-5 w-5 border border-border">
                          <AvatarImage src={msg.sender?.profileImageUrl || undefined} />
                          <AvatarFallback className={`text-[10px] ${
                            isAdminMsg ? 'bg-primary/20 text-primary' :
                            isPoster ? 'bg-primary/10 text-primary' :
                            'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                          }`}>
                            {msg.sender?.firstName?.[0] || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-medium text-foreground">
                          {msg.sender?.firstName || "User"} {msg.sender?.lastName || ""}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {isAdminMsg ? "Admin" : isPoster ? "Poster" : "Worker"}
                        </Badge>
                        {msg.type === 'proposal' && <Badge variant="secondary" className="text-[10px]">Price Proposal</Badge>}
                        {msg.type === 'acceptance' && <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">Resolution</Badge>}
                      </div>
                      <p className="text-sm text-foreground mt-1">{msg.message}</p>
                      {msg.amount && (
                        <p className="text-sm font-bold text-primary mt-1">{"\u20A6"}{Number(msg.amount).toLocaleString()}</p>
                      )}
                      {msg.imageUrl && (
                        <div className="mt-2">
                          <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer">
                            <img
                              src={msg.imageUrl}
                              alt="Attached"
                              className="max-w-xs max-h-48 rounded-lg border border-border object-cover cursor-pointer"
                              data-testid={`img-msg-${msg.id}`}
                            />
                          </a>
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {msg.createdAt ? format(new Date(msg.createdAt), "PP p") : ""}
                      </p>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {dispute.status !== 'resolved' && (
                <div className="mt-4 border-t border-border pt-4">
                  {imagePreview && (
                    <div className="mb-3 relative inline-block">
                      <img src={imagePreview} alt="Preview" className="h-20 rounded-lg border border-border" />
                      <button
                        onClick={clearImage}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs"
                        data-testid="button-clear-image"
                      >
                        x
                      </button>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageSelect}
                      data-testid="input-file-upload"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      data-testid="button-attach-image"
                    >
                      {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                    </Button>
                    <Input
                      placeholder="Type a message as admin..."
                      value={adminReply}
                      onChange={(e) => setAdminReply(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAdminReply(dispute)}
                      data-testid="input-admin-message"
                    />
                    <Button
                      size="icon"
                      onClick={() => handleAdminReply(dispute)}
                      disabled={isSendingMessage || isUploading || (!adminReply.trim() && !selectedImage)}
                      data-testid="button-send-message"
                    >
                      {(isSendingMessage || isUploading) ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {dispute.status !== 'resolved' && (
            <Card className="rounded-2xl border-primary/20">
              <CardContent className="p-6">
                <h3 className="font-bold text-foreground flex items-center gap-2 mb-2">
                  <Gavel className="w-5 h-5 text-primary" />
                  Resolve Dispute
                </h3>
                <p className="text-sm text-muted-foreground mb-5">
                  Escrowed amount: <span className="font-bold text-foreground">{"\u20A6"}{originalPrice.toLocaleString()}</span>. Choose how to distribute the funds.
                </p>

                <div className="space-y-3 mb-5">
                  <button
                    onClick={() => setResolveAction('refund_poster')}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                      resolveAction === 'refund_poster'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-border hover-elevate'
                    }`}
                    data-testid="button-action-refund"
                  >
                    <div className="flex items-center gap-3">
                      <Undo2 className={`w-5 h-5 ${resolveAction === 'refund_poster' ? 'text-primary' : 'text-muted-foreground'}`} />
                      <div>
                        <p className="font-medium text-foreground">Full Refund to Poster</p>
                        <p className="text-xs text-muted-foreground">Return all {"\u20A6"}{originalPrice.toLocaleString()} to the job poster. Worker gets nothing.</p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setResolveAction('release_worker')}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                      resolveAction === 'release_worker'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-border hover-elevate'
                    }`}
                    data-testid="button-action-release"
                  >
                    <div className="flex items-center gap-3">
                      <ArrowRight className={`w-5 h-5 ${resolveAction === 'release_worker' ? 'text-primary' : 'text-muted-foreground'}`} />
                      <div>
                        <p className="font-medium text-foreground">Release to Worker</p>
                        <p className="text-xs text-muted-foreground">
                          Pay worker {"\u20A6"}{(originalPrice * 0.78).toLocaleString()} (after 22% platform fee of {"\u20A6"}{(originalPrice * 0.22).toLocaleString()}).
                        </p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setResolveAction('custom')}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                      resolveAction === 'custom'
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                        : 'border-border hover-elevate'
                    }`}
                    data-testid="button-action-custom"
                  >
                    <div className="flex items-center gap-3">
                      <Sliders className={`w-5 h-5 ${resolveAction === 'custom' ? 'text-primary' : 'text-muted-foreground'}`} />
                      <div>
                        <p className="font-medium text-foreground">Custom Split</p>
                        <p className="text-xs text-muted-foreground">Set exact amounts for the worker and poster. Remainder goes to platform.</p>
                      </div>
                    </div>
                  </button>
                </div>

                {resolveAction === 'custom' && (
                  <div className="space-y-3 mb-5 p-4 rounded-xl bg-muted/30 border border-border">
                    <div>
                      <label className="text-sm font-medium mb-1 block text-foreground">Amount to Worker ({"\u20A6"})</label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={customWorkerAmount}
                        onChange={(e) => setCustomWorkerAmount(e.target.value)}
                        min={0}
                        max={originalPrice}
                        data-testid="input-worker-amount"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block text-foreground">Refund to Poster ({"\u20A6"})</label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={customPosterRefund}
                        onChange={(e) => setCustomPosterRefund(e.target.value)}
                        min={0}
                        max={originalPrice}
                        data-testid="input-poster-refund"
                      />
                    </div>
                    {(customWorkerAmount || customPosterRefund) && (
                      <div className="bg-background p-3 rounded-lg text-sm space-y-1 border border-border">
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Worker Payout</span>
                          <span className="font-medium text-green-600 dark:text-green-400">{"\u20A6"}{(parseFloat(customWorkerAmount) || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Poster Refund</span>
                          <span className="font-medium text-blue-600 dark:text-blue-400">{"\u20A6"}{(parseFloat(customPosterRefund) || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between gap-2 border-t border-border pt-1">
                          <span className="text-muted-foreground">Platform Keeps</span>
                          <span className="font-medium text-foreground">
                            {"\u20A6"}{Math.max(0, originalPrice - (parseFloat(customWorkerAmount) || 0) - (parseFloat(customPosterRefund) || 0)).toLocaleString()}
                          </span>
                        </div>
                        {(parseFloat(customWorkerAmount) || 0) + (parseFloat(customPosterRefund) || 0) > originalPrice && (
                          <p className="text-xs text-red-500 font-medium mt-1">Total exceeds escrowed amount!</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {resolveAction === 'release_worker' && (
                  <div className="mb-5 p-4 rounded-xl bg-muted/30 border border-border">
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Worker Payout</span>
                        <span className="font-medium text-green-600 dark:text-green-400">{"\u20A6"}{(originalPrice * 0.78).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Platform Fee (22%)</span>
                        <span className="font-medium text-foreground">{"\u20A6"}{(originalPrice * 0.22).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}

                {resolveAction === 'refund_poster' && (
                  <div className="mb-5 p-4 rounded-xl bg-muted/30 border border-border">
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Full Refund to Poster</span>
                        <span className="font-medium text-blue-600 dark:text-blue-400">{"\u20A6"}{originalPrice.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Worker Payout</span>
                        <span className="font-medium text-muted-foreground">{"\u20A6"}0</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mb-4">
                  <label className="text-sm font-medium mb-1 block text-foreground">Resolution Note (optional)</label>
                  <Textarea
                    placeholder="Explain your decision to both parties..."
                    value={resolveNote}
                    onChange={(e) => setResolveNote(e.target.value)}
                    className="resize-none"
                    rows={2}
                    data-testid="input-resolve-note"
                  />
                </div>

                <Button
                  className="w-full"
                  onClick={() => handleResolve(dispute)}
                  disabled={isResolving || (resolveAction === 'custom' && (parseFloat(customWorkerAmount) || 0) + (parseFloat(customPosterRefund) || 0) > originalPrice)}
                  data-testid="button-resolve"
                >
                  {isResolving ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Gavel className="mr-2 h-4 w-4" />}
                  {resolveAction === 'refund_poster' ? 'Refund Poster' :
                   resolveAction === 'release_worker' ? 'Release to Worker' :
                   'Apply Custom Split'}
                </Button>
              </CardContent>
            </Card>
          )}

          {dispute.status === 'resolved' && dispute.resolvedAmount && (
            <Card className="rounded-2xl border-green-200 dark:border-green-900">
              <CardContent className="p-6">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-green-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold text-green-800 dark:text-green-200 text-lg">Dispute Resolved</p>
                    <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                      Resolved by: {dispute.resolvedBy === 'admin' ? 'Admin decision' : 'Mutual agreement'}
                    </p>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      Resolved amount: {"\u20A6"}{Number(dispute.resolvedAmount).toLocaleString()}
                    </p>
                    {dispute.updatedAt && (
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        {format(new Date(dispute.updatedAt), "PPP 'at' p")}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <div className="flex items-center gap-3">
            <Scale className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-admin-disputes-title">Dispute Management</h1>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} data-testid="button-refresh-all">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3 mb-8">
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground mb-1">Active Disputes</p>
              <p className="text-3xl font-bold font-display text-foreground" data-testid="text-active-disputes">{openCount}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground mb-1">Needs Your Action</p>
              <p className="text-3xl font-bold font-display text-red-600 dark:text-red-400" data-testid="text-escalated-count">{escalatedCount}</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground mb-1">Total</p>
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
          <div className="space-y-3">
            {disputes.map((dispute) => {
              const msgCount = dispute.messages?.length || 0;
              const lastMsg = dispute.messages?.[msgCount - 1];
              return (
                <Card
                  key={dispute.id}
                  className="rounded-2xl hover-elevate cursor-pointer"
                  onClick={() => setSelectedDispute(dispute)}
                  data-testid={`card-dispute-${dispute.id}`}
                >
                  <CardContent className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-bold text-foreground truncate">{dispute.job?.title || "Unknown Job"}</h3>
                          <Badge variant="outline" className={getStatusColor(dispute.status)}>
                            {dispute.status.charAt(0).toUpperCase() + dispute.status.slice(1)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {"\u20A6"}{Number(dispute.job?.price || 0).toLocaleString()} &middot; {msgCount} messages
                        </p>
                        <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
                          <span>Poster: <span className="text-foreground font-medium">{dispute.poster?.firstName}</span></span>
                          <span>Worker: <span className="text-foreground font-medium">{dispute.worker?.firstName}</span></span>
                        </div>
                        {lastMsg && (
                          <p className="text-xs text-muted-foreground mt-2 truncate max-w-md">
                            Last: {lastMsg.message}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">
                          {dispute.createdAt ? format(new Date(dispute.createdAt), "PP") : ""}
                        </p>
                        <Button size="sm" variant="outline" className="mt-2" data-testid={`button-view-dispute-${dispute.id}`}>
                          View
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
