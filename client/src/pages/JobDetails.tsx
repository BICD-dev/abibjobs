import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useJob, useAcceptJob, useCompleteJob, useCancelJob } from "@/hooks/use-jobs";
import { useOffers, useCreateOffer, useAcceptOffer, useDeclineOffer, useCounterOffer } from "@/hooks/use-offers";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import {
  Loader2, MapPin, Calendar, ArrowLeft, CheckCircle, Shield, Users, XCircle,
  MessageSquare, ArrowUpDown, Send, Check, X, AlertTriangle, Wallet
} from "lucide-react";
import { format } from "date-fns";
import type { OfferWithSender } from "@shared/schema";

export default function JobDetails() {
  const [match, params] = useRoute("/jobs/:id");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0");
  const { data: job, isLoading, error } = useJob(id);
  const { data: offersData, isLoading: offersLoading } = useOffers(id);
  const { user } = useAuth();

  const { mutate: acceptJob, isPending: isAccepting } = useAcceptJob();
  const { mutate: completeJob, isPending: isCompleting } = useCompleteJob();
  const { mutate: cancelJob, isPending: isCancelling } = useCancelJob();

  const { mutate: createOffer, isPending: isCreatingOffer } = useCreateOffer();
  const { mutate: acceptOffer, isPending: isAcceptingOffer } = useAcceptOffer();
  const { mutate: declineOffer, isPending: isDecliningOffer } = useDeclineOffer();
  const { mutate: counterOffer, isPending: isCounteringOffer } = useCounterOffer();

  const [offerAmount, setOfferAmount] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [counterAmount, setCounterAmount] = useState("");
  const [counterMessage, setCounterMessage] = useState("");
  const [counteringOfferId, setCounteringOfferId] = useState<number | null>(null);
  const [showInsufficientFunds, setShowInsufficientFunds] = useState(false);
  const [shortfallAmount, setShortfallAmount] = useState(0);

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (error || !job) return <div className="min-h-screen bg-background flex items-center justify-center text-destructive">Job not found</div>;

  const isPoster = user?.id === job.posterId;
  const workerIds = job.workerId ? job.workerId.split(',') : [];
  const isWorker = user?.id ? workerIds.includes(user.id) : false;
  const isOpen = job.status === "open";
  const isInProgress = job.status === "in_progress";
  const isCompleted = job.status === "completed";
  const isCancelled = job.status === "cancelled";

  const offers: OfferWithSender[] = offersData || [];
  const pendingOffers = offers.filter(o => o.status === 'pending');
  const hasActivePendingOffer = pendingOffers.length > 0;

  const handleCreateOffer = () => {
    const amount = parseFloat(offerAmount);
    if (!amount || amount <= 0) return;
    createOffer({
      jobId: job.id,
      amount,
      message: offerMessage || undefined,
    }, {
      onSuccess: () => {
        setOfferAmount("");
        setOfferMessage("");
        setShowOfferForm(false);
      }
    });
  };

  const handleAcceptOffer = (offerId: number) => {
    acceptOffer({ offerId, jobId: job.id }, {
      onSuccess: (data: any) => {
        if (data.insufficientFunds) {
          setShowInsufficientFunds(true);
          setShortfallAmount(data.shortfall);
        }
      }
    });
  };

  const handleDeclineOffer = (offerId: number) => {
    declineOffer({ offerId, jobId: job.id });
  };

  const handleCounterOffer = (offerId: number) => {
    const amount = parseFloat(counterAmount);
    if (!amount || amount <= 0) return;
    counterOffer({
      offerId,
      jobId: job.id,
      amount,
      message: counterMessage || undefined,
    }, {
      onSuccess: () => {
        setCounterAmount("");
        setCounterMessage("");
        setCounteringOfferId(null);
      }
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">Pending</Badge>;
      case 'accepted': return <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Accepted</Badge>;
      case 'declined': return <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">Declined</Badge>;
      case 'countered': return <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">Countered</Badge>;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Button variant="ghost" className="mb-6 -ml-4" onClick={() => setLocation("/jobs")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Jobs
        </Button>

        <div className="bg-card border border-border/50 rounded-3xl p-8 shadow-sm">
          <div className="flex flex-col md:flex-row justify-between items-start gap-6 mb-8">
            <div className="space-y-4">
              <Badge variant="outline" className="rounded-lg px-3 py-1 font-medium bg-primary/5 text-primary border-primary/20 capitalize">
                {job.status.replace('_', ' ')}
              </Badge>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground" data-testid="text-job-title">{job.title}</h1>
              <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
                <div className="flex items-center">
                  <MapPin className="w-4 h-4 mr-1.5 text-primary" />
                  {job.location}
                </div>
                <div className="flex items-center">
                  <Calendar className="w-4 h-4 mr-1.5 text-primary" />
                  Posted {format(new Date(job.createdAt || Date.now()), "PP")}
                </div>
              </div>
            </div>

            <div className="bg-primary/5 px-8 py-6 rounded-2xl text-center min-w-[200px] border border-primary/10">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-2">Price</p>
              <p className="text-4xl font-display font-bold text-primary" data-testid="text-job-price">{"\u20A6"}{Number(job.price).toLocaleString()}</p>
              <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-primary/80 font-medium">
                <Shield className="w-3.5 h-3.5" /> Escrow Secured
              </div>
              {job.workersNeeded > 1 && (
                <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground font-medium" data-testid="text-workers-info">
                  <Users className="w-3.5 h-3.5" /> {job.workersAccepted}/{job.workersNeeded} workers
                </div>
              )}
            </div>
          </div>

          <hr className="border-border/50 my-8" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="md:col-span-2 space-y-8">
              <section>
                <h3 className="text-lg font-bold font-display mb-4">Description</h3>
                <p className="text-muted-foreground whitespace-pre-line leading-relaxed text-lg">
                  {job.description}
                </p>
              </section>

              <div className="bg-muted/30 rounded-2xl p-6 border border-border mt-8">
                <h3 className="text-lg font-bold font-display mb-4">Actions</h3>

                {isCompleted ? (
                  <div className="flex items-center text-green-600 bg-green-50 dark:bg-green-950/30 p-4 rounded-xl border border-green-100 dark:border-green-900">
                    <CheckCircle className="w-5 h-5 mr-2" />
                    This job has been completed and paid for.
                  </div>
                ) : isCancelled ? (
                  <div className="flex items-center text-red-600 bg-red-50 dark:bg-red-950/30 p-4 rounded-xl border border-red-100 dark:border-red-900">
                    <XCircle className="w-5 h-5 mr-2" />
                    This job has been cancelled. Funds were refunded.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {isPoster && (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">You posted this job.</p>
                        {isInProgress ? (
                          <Button
                            className="w-full h-12 text-lg bg-green-600 text-white rounded-xl shadow-lg shadow-green-600/20"
                            onClick={() => completeJob(job.id)}
                            disabled={isCompleting}
                            data-testid="button-complete-job"
                          >
                            {isCompleting ? <Loader2 className="animate-spin mr-2" /> : <CheckCircle className="mr-2 h-5 w-5" />}
                            Mark as Completed & Release Funds
                          </Button>
                        ) : isOpen ? (
                          <p className="text-sm font-medium text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-100 dark:border-amber-900">
                            Waiting for workers to accept your job ({job.workersAccepted}/{job.workersNeeded} joined).
                          </p>
                        ) : null}

                        {(isOpen || isInProgress) && (
                          <Button
                            variant="destructive"
                            className="w-full rounded-xl"
                            onClick={() => cancelJob(job.id)}
                            disabled={isCancelling}
                            data-testid="button-cancel-job"
                          >
                            {isCancelling ? <Loader2 className="animate-spin mr-2" /> : <XCircle className="mr-2 h-4 w-4" />}
                            Cancel Job & Get Refund
                          </Button>
                        )}
                      </div>
                    )}

                    {!isPoster && (
                      <div className="space-y-4">
                        {isOpen && !isWorker ? (
                          <>
                            <Button
                              className="w-full h-12 text-lg bg-primary text-white rounded-xl shadow-lg shadow-primary/25"
                              onClick={() => acceptJob(job.id)}
                              disabled={isAccepting}
                              data-testid="button-accept-job"
                            >
                              {isAccepting ? <Loader2 className="animate-spin mr-2" /> : "Accept This Job"}
                            </Button>
                            {user && (
                              <Button
                                variant="outline"
                                className="w-full rounded-xl"
                                onClick={() => setShowOfferForm(!showOfferForm)}
                                data-testid="button-toggle-offer-form"
                              >
                                <ArrowUpDown className="mr-2 h-4 w-4" />
                                {showOfferForm ? "Hide Offer Form" : "Suggest a Different Price"}
                              </Button>
                            )}
                          </>
                        ) : isOpen && isWorker ? (
                          <div className="text-center p-4 bg-primary/10 rounded-xl text-primary font-medium border border-primary/20">
                            You've joined this job. Waiting for more workers ({job.workersAccepted}/{job.workersNeeded}).
                          </div>
                        ) : isWorker && isInProgress ? (
                          <div className="text-center p-4 bg-primary/10 rounded-xl text-primary font-medium border border-primary/20">
                            You are working on this job. Waiting for client to confirm completion.
                          </div>
                        ) : !isOpen && !isWorker ? (
                          <div className="text-center p-4 bg-muted text-muted-foreground rounded-xl">
                            This job is already taken.
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {showOfferForm && isOpen && !isPoster && user && (
                <Card className="p-6">
                  <h4 className="font-bold font-display mb-4 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-primary" />
                    Send a Price Offer
                  </h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Current price: {"\u20A6"}{Number(job.price).toLocaleString()}. Suggest a new price below.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium mb-1 block">Your Proposed Price ({"\u20A6"})</label>
                      <Input
                        type="number"
                        placeholder="Enter your price"
                        value={offerAmount}
                        onChange={(e) => setOfferAmount(e.target.value)}
                        min={1}
                        data-testid="input-offer-amount"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Message (optional)</label>
                      <Textarea
                        placeholder="Explain why you think this price is fair..."
                        value={offerMessage}
                        onChange={(e) => setOfferMessage(e.target.value)}
                        className="resize-none"
                        rows={2}
                        data-testid="input-offer-message"
                      />
                    </div>
                    <Button
                      className="w-full rounded-xl"
                      onClick={handleCreateOffer}
                      disabled={isCreatingOffer || !offerAmount}
                      data-testid="button-send-offer"
                    >
                      {isCreatingOffer ? <Loader2 className="animate-spin mr-2" /> : <Send className="mr-2 h-4 w-4" />}
                      Send Offer
                    </Button>
                  </div>
                </Card>
              )}

              {isOpen && user && offers.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold font-display flex items-center gap-2">
                    <ArrowUpDown className="w-5 h-5 text-primary" />
                    Price Negotiations
                    {pendingOffers.length > 0 && (
                      <Badge variant="secondary">{pendingOffers.length} pending</Badge>
                    )}
                  </h3>

                  {showInsufficientFunds && (
                    <Card className="p-4 border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                        <div className="space-y-2">
                          <p className="font-medium text-amber-800 dark:text-amber-200">Insufficient Wallet Balance</p>
                          <p className="text-sm text-amber-700 dark:text-amber-300">
                            You need {"\u20A6"}{Number(shortfallAmount).toLocaleString()} more in your wallet to accept this offer.
                            Please add funds to your wallet first.
                          </p>
                          <Button
                            variant="outline"
                            className="mt-2"
                            onClick={() => setLocation("/wallet")}
                            data-testid="button-goto-wallet"
                          >
                            <Wallet className="mr-2 h-4 w-4" />
                            Go to Wallet
                          </Button>
                        </div>
                      </div>
                    </Card>
                  )}

                  <div className="space-y-3">
                    {offers.map((offer) => {
                      const isMyOffer = offer.senderId === user?.id;
                      const canRespond = offer.status === 'pending' && !isMyOffer && (isPoster || offer.senderId === job.posterId);

                      return (
                        <Card key={offer.id} className="p-4" data-testid={`card-offer-${offer.id}`}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8 border border-border">
                                <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                                  {offer.sender?.firstName?.[0] || offer.senderId.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-sm">
                                    {isMyOffer ? "You" : (offer.sender?.firstName || "User")}
                                  </span>
                                  {offer.senderId === job.posterId && (
                                    <Badge variant="secondary">Job Poster</Badge>
                                  )}
                                  {getStatusBadge(offer.status)}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {offer.createdAt ? format(new Date(offer.createdAt), "PP p") : ""}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-primary" data-testid={`text-offer-amount-${offer.id}`}>
                                {"\u20A6"}{Number(offer.amount).toLocaleString()}
                              </p>
                              {Number(offer.amount) > Number(job.price) && (
                                <p className="text-xs text-amber-600">+{"\u20A6"}{(Number(offer.amount) - Number(job.price)).toLocaleString()} above listed</p>
                              )}
                              {Number(offer.amount) < Number(job.price) && (
                                <p className="text-xs text-green-600">-{"\u20A6"}{(Number(job.price) - Number(offer.amount)).toLocaleString()} below listed</p>
                              )}
                            </div>
                          </div>

                          {offer.message && (
                            <p className="mt-3 text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                              "{offer.message}"
                            </p>
                          )}

                          {canRespond && (
                            <div className="mt-4 space-y-3">
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  className="bg-green-600 text-white"
                                  onClick={() => handleAcceptOffer(offer.id)}
                                  disabled={isAcceptingOffer}
                                  data-testid={`button-accept-offer-${offer.id}`}
                                >
                                  {isAcceptingOffer ? <Loader2 className="animate-spin mr-1 h-3 w-3" /> : <Check className="mr-1 h-3 w-3" />}
                                  Accept
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDeclineOffer(offer.id)}
                                  disabled={isDecliningOffer}
                                  data-testid={`button-decline-offer-${offer.id}`}
                                >
                                  {isDecliningOffer ? <Loader2 className="animate-spin mr-1 h-3 w-3" /> : <X className="mr-1 h-3 w-3" />}
                                  Decline
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setCounteringOfferId(counteringOfferId === offer.id ? null : offer.id)}
                                  data-testid={`button-counter-offer-${offer.id}`}
                                >
                                  <ArrowUpDown className="mr-1 h-3 w-3" />
                                  Counter
                                </Button>
                              </div>

                              {counteringOfferId === offer.id && (
                                <div className="bg-muted/50 p-3 rounded-lg space-y-2">
                                  <label className="text-sm font-medium">Your Counter Price ({"\u20A6"})</label>
                                  <Input
                                    type="number"
                                    placeholder="Enter counter price"
                                    value={counterAmount}
                                    onChange={(e) => setCounterAmount(e.target.value)}
                                    min={1}
                                    data-testid={`input-counter-amount-${offer.id}`}
                                  />
                                  <Textarea
                                    placeholder="Optional message..."
                                    value={counterMessage}
                                    onChange={(e) => setCounterMessage(e.target.value)}
                                    className="resize-none"
                                    rows={2}
                                    data-testid={`input-counter-message-${offer.id}`}
                                  />
                                  <Button
                                    size="sm"
                                    className="w-full"
                                    onClick={() => handleCounterOffer(offer.id)}
                                    disabled={isCounteringOffer || !counterAmount}
                                    data-testid={`button-send-counter-${offer.id}`}
                                  >
                                    {isCounteringOffer ? <Loader2 className="animate-spin mr-1 h-3 w-3" /> : <Send className="mr-1 h-3 w-3" />}
                                    Send Counter Offer
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-8">
              <section>
                <h3 className="text-lg font-bold font-display mb-4">Posted By</h3>
                <div className="flex items-center gap-4 bg-background p-4 rounded-xl border border-border shadow-sm">
                  <Avatar className="h-12 w-12 border border-border">
                    <AvatarImage src={undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                      {job.posterId.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-bold text-sm">User {job.posterId.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground">Verified Member</p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
