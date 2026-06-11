import { useState, useRef, useMemo, useCallback } from "react";
import LiveWorkerMap from "@/components/LiveWorkerMap";
import WorkerLocationTracker from "@/components/WorkerLocationTracker";
import { useRoute, useLocation } from "wouter";
import { useJob, useAcceptJob, useCompleteJob, useCancelJob, useUpdateJobProgress, useConfirmArrival, useReportNoShow } from "@/hooks/use-jobs";
import { useOffers, useCreateOffer, useAcceptOffer, useDeclineOffer, useCounterOffer } from "@/hooks/use-offers";
import { useDisputeByJob, useCreateDispute, useDisputeMessage, useAcceptProposal, useEscalateDispute, useUploadDisputeImage } from "@/hooks/use-disputes";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import {
  Loader2, MapPin, Calendar, ArrowLeft, CheckCircle, Shield, Users, XCircle,
  MessageSquare, ArrowUpDown, Send, Check, X, AlertTriangle, Wallet,
  Flag, Scale, ArrowUpCircle, Image as ImageIcon, Navigation, Clock, MapPinCheck, UserX, Lock,
  RefreshCw, Trash2, CalendarPlus, LocateFixed, Radio, Camera, ChevronLeft, ChevronRight
} from "lucide-react";
import { Dialog as LightboxDialog, DialogContent as LightboxContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { OfferWithSender, DisputeMessageWithSender } from "@shared/schema";

function generateIcsFile(job: { title: string; description: string; location: string; scheduledDate: string | Date }) {
  const start = new Date(job.scheduledDate);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatDate = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ABIB JOBS//EN',
    'BEGIN:VEVENT',
    `DTSTART:${formatDate(start)}`,
    `DTEND:${formatDate(end)}`,
    `SUMMARY:${job.title}`,
    `DESCRIPTION:${job.description.replace(/\n/g, '\\n')}`,
    `LOCATION:${job.location}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${job.title.replace(/[^a-zA-Z0-9]/g, '_')}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function JobDetails() {
  const [match, params] = useRoute("/jobs/:id");
  const [, setLocation] = useLocation();
  const id = parseInt(params?.id || "0");
  const { data: job, isLoading, error } = useJob(id);
  const { data: offersData, isLoading: offersLoading } = useOffers(id);
  const { data: disputeData, isLoading: disputeLoading } = useDisputeByJob(id);
  const { user } = useAuth();

  const { mutate: acceptJob, isPending: isAccepting } = useAcceptJob();
  const { mutate: completeJob, isPending: isCompleting } = useCompleteJob();
  const { mutate: cancelJob, isPending: isCancelling } = useCancelJob();
  const { mutate: updateProgress, isPending: isUpdatingProgress } = useUpdateJobProgress();
  const { mutate: confirmArrival, isPending: isConfirmingArrival } = useConfirmArrival();
  const { mutate: reportNoShow, isPending: isReportingNoShow } = useReportNoShow();

  const { mutate: createOffer, isPending: isCreatingOffer } = useCreateOffer();
  const { mutate: acceptOffer, isPending: isAcceptingOffer } = useAcceptOffer();
  const { mutate: declineOffer, isPending: isDecliningOffer } = useDeclineOffer();
  const { mutate: counterOffer, isPending: isCounteringOffer } = useCounterOffer();

  const { mutate: createDispute, isPending: isCreatingDispute } = useCreateDispute();
  const { mutate: sendDisputeMessage, isPending: isSendingMessage } = useDisputeMessage();
  const { mutateAsync: uploadDisputeImage, isPending: isUploadingImage } = useUploadDisputeImage();
  const { mutate: acceptProposal, isPending: isAcceptingProposal } = useAcceptProposal();
  const { mutate: escalateDispute, isPending: isEscalating } = useEscalateDispute();

  const [offerAmount, setOfferAmount] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [counterAmount, setCounterAmount] = useState("");
  const [counterMessage, setCounterMessage] = useState("");
  const [counteringOfferId, setCounteringOfferId] = useState<number | null>(null);
  const [showInsufficientFunds, setShowInsufficientFunds] = useState(false);
  const [shortfallAmount, setShortfallAmount] = useState(0);
  const [confirmingNoShow, setConfirmingNoShow] = useState(false);
  const [noShowStep, setNoShowStep] = useState<'confirm' | 'choose'>('confirm');
  const [showPenaltyConfirm, setShowPenaltyConfirm] = useState(false);

  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeMessage, setDisputeMessage] = useState("");
  const [disputeWorkerId, setDisputeWorkerId] = useState("");
  const [disputeReplyMessage, setDisputeReplyMessage] = useState("");
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [proposalAmount, setProposalAmount] = useState("");
  const [proposalMessage, setProposalMessage] = useState("");
  const [disputeImage, setDisputeImage] = useState<File | null>(null);
  const [disputeImagePreview, setDisputeImagePreview] = useState<string | null>(null);

  // Live location
  const { toast } = useToast();
  const queryClientRef = useQueryClient();

  // Image lightbox
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const noShowAvailability = useMemo(() => {
    if (!job?.acceptedAt) return { canReport: true, remainingText: '' };
    const acceptedTime = new Date(job.acceptedAt).getTime();
    const now = Date.now();
    const twelveHours = 12 * 60 * 60 * 1000;
    const elapsed = now - acceptedTime;
    if (elapsed >= twelveHours) return { canReport: true, remainingText: '' };
    const remainingMs = twelveHours - elapsed;
    const hours = Math.floor(remainingMs / (60 * 60 * 1000));
    const minutes = Math.ceil((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
    return { canReport: false, remainingText: `${hours}h ${minutes}m remaining` };
  }, [job?.acceptedAt]);

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (error || !job) return <div className="min-h-screen bg-background flex items-center justify-center text-destructive">Job not found</div>;

  const isPoster = user?.id === job.posterId;
  const workerIds = job.workerId ? job.workerId.split(',') : [];
  const isWorker = user?.id ? workerIds.includes(user.id) : false;
  const isOpen = job.status === "open";
  const isInProgress = job.status === "in_progress";
  const isCompleted = job.status === "completed";
  const isCancelled = job.status === "cancelled";
  const isDisputed = job.status === "disputed";

  const offers: OfferWithSender[] = offersData || [];
  const pendingOffers = offers.filter(o => o.status === 'pending');

  const dispute = disputeData;
  const isDisputeParticipant = dispute && user && (dispute.posterId === user.id || dispute.workerId === user.id);

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

  const handleCreateDispute = () => {
    if (!disputeMessage.trim()) return;
    const targetWorker = disputeWorkerId || workerIds[0];
    if (!targetWorker) return;
    createDispute({
      jobId: job.id,
      workerId: targetWorker,
      message: disputeMessage,
    }, {
      onSuccess: () => {
        setDisputeMessage("");
        setShowDisputeForm(false);
        setDisputeWorkerId("");
      }
    });
  };

  const handleSendDisputeReply = async () => {
    if ((!disputeReplyMessage.trim() && !disputeImage) || !dispute) return;

    let imageUrl: string | undefined;
    if (disputeImage) {
      try {
        imageUrl = await uploadDisputeImage(disputeImage);
      } catch {
        return;
      }
    }

    sendDisputeMessage({
      disputeId: dispute.id,
      jobId: job.id,
      message: disputeReplyMessage.trim() || (imageUrl ? "Attached image" : ""),
      type: 'message',
      imageUrl,
    }, {
      onSuccess: () => {
        setDisputeReplyMessage("");
        setDisputeImage(null);
        setDisputeImagePreview(null);
      }
    });
  };

  const handleSendProposal = () => {
    const amount = parseFloat(proposalAmount);
    if (!amount || amount <= 0 || !dispute) return;
    sendDisputeMessage({
      disputeId: dispute.id,
      jobId: job.id,
      message: proposalMessage || `Proposing adjusted price of \u20A6${amount.toLocaleString()}`,
      type: 'proposal',
      amount,
    }, {
      onSuccess: () => {
        setProposalAmount("");
        setProposalMessage("");
        setShowProposalForm(false);
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

  const getDisputeStatusBadge = (status: string) => {
    switch (status) {
      case 'open': return <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400">Open</Badge>;
      case 'negotiating': return <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-400">Negotiating</Badge>;
      case 'escalated': return <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 dark:text-red-400">Escalated to Admin</Badge>;
      case 'resolved': return <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400">Resolved</Badge>;
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
              <Badge variant="outline" className={`rounded-lg px-3 py-1 font-medium capitalize ${
                isDisputed 
                  ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800' 
                  : 'bg-primary/5 text-primary border-primary/20'
              }`}>
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
                {job.scheduledDate && (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center text-primary font-medium" data-testid="text-scheduled-date">
                      <Clock className="w-4 h-4 mr-1.5" />
                      Needed: {format(new Date(job.scheduledDate), "PPP 'at' p")}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => generateIcsFile(job)}
                      data-testid="button-add-to-calendar"
                    >
                      <CalendarPlus className="w-4 h-4 mr-1" /> Add to Calendar
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-primary/5 px-8 py-6 rounded-2xl text-center min-w-[200px] border border-primary/10">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-2">
                {job.workersNeeded > 1 && job.priceType === 'per_person' ? 'Price Per Person' : 'Price'}
              </p>
              <p className="text-4xl font-display font-bold text-primary" data-testid="text-job-price">{"\u20A6"}{Number(job.price).toLocaleString()}</p>
              {job.workersNeeded > 1 && (
                <p className="text-sm text-muted-foreground mt-1" data-testid="text-price-breakdown">
                  {job.priceType === 'per_person'
                    ? `₦${(Number(job.price) * job.workersNeeded).toLocaleString()} total for ${job.workersNeeded} workers`
                    : `₦${Math.round(Number(job.price) / job.workersNeeded).toLocaleString()} per person`
                  }
                </p>
              )}
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

              {/* Job Photos Gallery */}
              {job.images && job.images.length > 0 && (
                <section data-testid="section-job-photos">
                  <h3 className="text-lg font-bold font-display mb-3 flex items-center gap-2">
                    <Camera className="w-5 h-5 text-primary" />
                    Job Photos
                  </h3>
                  <div className={`grid gap-2 ${job.images.length === 1 ? 'grid-cols-1' : job.images.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    {job.images.map((imgPath, i) => (
                      <button
                        key={i}
                        className="aspect-square rounded-xl overflow-hidden border border-border hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary"
                        onClick={() => setLightboxIndex(i)}
                        data-testid={`button-job-photo-${i}`}
                      >
                        <img
                          src={imgPath}
                          alt={`Job photo ${i + 1}`}
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Job Location Map */}
              {job.latitude && job.longitude && (
                <section data-testid="section-job-map">
                  <h3 className="text-lg font-bold font-display mb-3 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-primary" />
                    Job Location
                  </h3>
                  <div className="rounded-2xl overflow-hidden border border-border shadow-sm">
                    <iframe
                      title="Job location map"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${parseFloat(String(job.longitude))-0.01},${parseFloat(String(job.latitude))-0.01},${parseFloat(String(job.longitude))+0.01},${parseFloat(String(job.latitude))+0.01}&layer=mapnik&marker=${job.latitude},${job.longitude}`}
                      width="100%"
                      height="240"
                      style={{ border: 0 }}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${job.latitude}&mlon=${job.longitude}#map=16/${job.latitude}/${job.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary underline mt-1 inline-block"
                  >
                    Open in Maps ↗
                  </a>
                </section>
              )}

              {/* Worker Live Location (for poster — if worker has shared their location) */}
              {isPoster && isInProgress && job.workerLatitude && job.workerLongitude && (
                <section data-testid="section-worker-live-map">
                  <h3 className="text-lg font-bold font-display mb-3 flex items-center gap-2">
                    <Radio className="w-5 h-5 text-green-600 animate-pulse" />
                    Worker's Live Location
                    {job.workerLocationUpdatedAt && (
                      <span className="text-xs font-normal text-muted-foreground ml-auto">
                        Updated {format(new Date(job.workerLocationUpdatedAt), "p")}
                      </span>
                    )}
                  </h3>
                  <div className="rounded-2xl overflow-hidden border border-green-200 dark:border-green-800 shadow-sm">
                    <LiveWorkerMap
                      lat={parseFloat(String(job.workerLatitude))}
                      lng={parseFloat(String(job.workerLongitude))}
                      updatedAt={job.workerLocationUpdatedAt ? String(job.workerLocationUpdatedAt) : null}
                    />
                  </div>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${job.workerLatitude}&mlon=${job.workerLongitude}#map=17/${job.workerLatitude}/${job.workerLongitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary underline mt-1 inline-block"
                  >
                    Open worker's location in Maps ↗
                  </a>
                </section>
              )}


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
                ) : isDisputed ? (
                  <div className="flex items-center text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-4 rounded-xl border border-amber-100 dark:border-amber-900">
                    <Flag className="w-5 h-5 mr-2 shrink-0" />
                    <span>This job is under dispute. Funds remain in escrow until resolved.</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {isPoster && (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">You posted this job.</p>
                        {isInProgress ? (
                          <>
                            {/* Worker Progress Tracker for Poster (single worker only) */}
                            {workerIds.length === 1 && (
                            <div className="bg-muted/50 rounded-xl p-4 border border-border space-y-3" data-testid="section-poster-progress-view">
                              <p className="text-sm font-medium text-foreground">Worker Progress</p>
                              <div className="flex items-center gap-2">
                                {[
                                  { key: 'getting_ready', label: 'Getting Ready', icon: Clock },
                                  { key: 'on_the_way', label: 'On the Way', icon: Navigation },
                                  { key: 'at_location', label: 'At Location', icon: MapPinCheck },
                                ].map((step, idx) => {
                                  const progressOrder = ['getting_ready', 'on_the_way', 'at_location'];
                                  const currentIdx = job.workerProgress ? progressOrder.indexOf(job.workerProgress) : -1;
                                  const stepIdx = progressOrder.indexOf(step.key);
                                  const isActive = stepIdx <= currentIdx;
                                  const StepIcon = step.icon;
                                  return (
                                    <div key={step.key} className="flex items-center gap-2 flex-1" data-testid={`poster-progress-step-${step.key}`}>
                                      <div className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${isActive ? 'bg-green-500 text-white' : 'bg-muted-foreground/20 text-muted-foreground'}`}>
                                        <StepIcon className="w-4 h-4" />
                                      </div>
                                      <span className={`text-xs font-medium ${isActive ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>{step.label}</span>
                                      {idx < 2 && <div className={`h-0.5 flex-1 ${stepIdx < currentIdx ? 'bg-green-500' : 'bg-muted-foreground/20'}`} />}
                                    </div>
                                  );
                                })}
                              </div>
                              {!job.workerProgress && (
                                <p className="text-xs text-muted-foreground">Worker hasn't started yet.</p>
                              )}
                            </div>
                            )}

                            {/* Poster Confirm Arrival (single worker only) */}
                            {workerIds.length === 1 && job.workerProgress === 'at_location' && !job.posterConfirmedArrival && (
                              <Button
                                className="w-full h-12 text-lg bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-600/20"
                                onClick={() => confirmArrival(job.id)}
                                disabled={isConfirmingArrival}
                                data-testid="button-confirm-arrival"
                              >
                                {isConfirmingArrival ? <Loader2 className="animate-spin mr-2" /> : <MapPinCheck className="mr-2 h-5 w-5" />}
                                Confirm Worker Has Arrived
                              </Button>
                            )}
                            {workerIds.length === 1 && job.posterConfirmedArrival && (
                              <div className="flex items-center text-green-600 bg-green-50 dark:bg-green-950/30 p-3 rounded-xl border border-green-100 dark:border-green-900 text-sm">
                                <CheckCircle className="w-4 h-4 mr-2 shrink-0" />
                                You confirmed the worker has arrived.
                              </div>
                            )}

                            {job.posterMarkedComplete ? (
                              <div className="flex items-center text-green-600 bg-green-50 dark:bg-green-950/30 p-3 rounded-xl border border-green-100 dark:border-green-900 text-sm" data-testid="text-poster-marked-complete">
                                <CheckCircle className="w-4 h-4 mr-2 shrink-0" />
                                You've confirmed completion. Waiting for the worker to confirm.
                              </div>
                            ) : (
                              <Button
                                className="w-full h-12 text-lg bg-green-600 text-white rounded-xl shadow-lg shadow-green-600/20"
                                onClick={() => completeJob(job.id)}
                                disabled={isCompleting}
                                data-testid="button-complete-job"
                              >
                                {isCompleting ? <Loader2 className="animate-spin mr-2" /> : <CheckCircle className="mr-2 h-5 w-5" />}
                                Mark as Completed & Release Funds
                              </Button>
                            )}
                            {job.workerMarkedComplete && !job.posterMarkedComplete && (
                              <div className="flex items-center text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-100 dark:border-amber-900 text-sm" data-testid="text-worker-waiting-poster">
                                <CheckCircle className="w-4 h-4 mr-2 shrink-0" />
                                The worker has already confirmed — tap above to release their payment!
                              </div>
                            )}
                            {!confirmingNoShow ? (
                              noShowAvailability.canReport ? (
                                <Button
                                  variant="destructive"
                                  className="w-full rounded-xl"
                                  onClick={() => { setConfirmingNoShow(true); setNoShowStep('confirm'); }}
                                  data-testid="button-no-show"
                                >
                                  <UserX className="mr-2 h-4 w-4" />
                                  Worker Didn't Show Up
                                </Button>
                              ) : (
                                <div className="p-3 bg-muted rounded-xl text-center space-y-1" data-testid="section-no-show-timer">
                                  <p className="text-sm text-muted-foreground">You can report a no-show after 12 hours</p>
                                  <p className="text-sm font-medium flex items-center justify-center gap-1">
                                    <Clock className="h-4 w-4" /> {noShowAvailability.remainingText}
                                  </p>
                                </div>
                              )
                            ) : noShowStep === 'confirm' ? (
                              <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800 space-y-3" data-testid="section-confirm-no-show">
                                <p className="text-sm font-medium text-red-700 dark:text-red-300">
                                  Are you sure the worker didn't show up? This will refund your escrow and the worker will receive a warning.
                                </p>
                                <div className="flex gap-2">
                                  <Button
                                    variant="destructive"
                                    className="flex-1 rounded-xl"
                                    onClick={() => setNoShowStep('choose')}
                                    data-testid="button-confirm-no-show"
                                  >
                                    <UserX className="mr-2 h-4 w-4" />
                                    Yes, Report No-Show
                                  </Button>
                                  <Button
                                    variant="outline"
                                    className="rounded-xl"
                                    onClick={() => setConfirmingNoShow(false)}
                                    data-testid="button-cancel-no-show"
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : noShowStep === 'choose' ? (
                              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 space-y-3" data-testid="section-noshow-choose">
                                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                                  What would you like to do with this job?
                                </p>
                                <div className="flex flex-col gap-2">
                                  <Button
                                    variant="default"
                                    className="w-full rounded-xl"
                                    onClick={() => { reportNoShow({ id: job.id, action: 'repost' }); setConfirmingNoShow(false); }}
                                    disabled={isReportingNoShow}
                                    data-testid="button-noshow-repost"
                                  >
                                    {isReportingNoShow ? <Loader2 className="animate-spin mr-2" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                    Repost Job for New Workers
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    className="w-full rounded-xl"
                                    onClick={() => { reportNoShow({ id: job.id, action: 'delete' }); setConfirmingNoShow(false); }}
                                    disabled={isReportingNoShow}
                                    data-testid="button-noshow-delete"
                                  >
                                    {isReportingNoShow ? <Loader2 className="animate-spin mr-2" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                    Delete Job
                                  </Button>
                                  <Button
                                    variant="outline"
                                    className="w-full rounded-xl"
                                    onClick={() => { setConfirmingNoShow(false); setNoShowStep('confirm'); }}
                                    data-testid="button-back-no-show"
                                  >
                                    Go Back
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                            <Button
                              variant="outline"
                              className="w-full rounded-xl text-amber-600 border-amber-200 dark:border-amber-800"
                              onClick={() => setShowDisputeForm(!showDisputeForm)}
                              data-testid="button-toggle-dispute-form"
                            >
                              <Flag className="mr-2 h-4 w-4" />
                              {showDisputeForm ? "Cancel" : "Not Satisfied? Raise a Concern"}
                            </Button>
                          </>
                        ) : isOpen ? (
                          <p className="text-sm font-medium text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-100 dark:border-amber-900">
                            Waiting for workers to accept your job ({job.workersAccepted}/{job.workersNeeded} joined).
                          </p>
                        ) : null}

                        {(isOpen || isInProgress) && (() => {
                          const workerEnRoute = job.workerProgress === 'on_the_way' || job.workerProgress === 'at_location';
                          const price = parseFloat(job.price);
                          const escrowAmount = job.priceType === 'per_person' ? price * job.workersNeeded : price;
                          const penalty = Math.round(escrowAmount * 0.1 * 100) / 100;
                          const refundAmount = escrowAmount - penalty;

                          if (workerEnRoute && showPenaltyConfirm) {
                            return (
                              <div className="space-y-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5" data-testid="section-penalty-confirm">
                                <p className="text-sm font-medium text-destructive">Cancellation Penalty</p>
                                <p className="text-sm text-muted-foreground">
                                  The worker is already on the way. If you cancel now, 10% of the job price
                                  (₦{penalty.toLocaleString()}) will be sent to the worker as compensation within 24 hours.
                                  You will receive ₦{refundAmount.toLocaleString()} back immediately.
                                </p>
                                <div className="flex gap-2">
                                  <Button
                                    variant="destructive"
                                    className="flex-1 rounded-xl"
                                    onClick={() => { setShowPenaltyConfirm(false); cancelJob(job.id); }}
                                    disabled={isCancelling}
                                    data-testid="button-confirm-penalty-cancel"
                                  >
                                    {isCancelling ? <Loader2 className="animate-spin mr-2" /> : <XCircle className="mr-2 h-4 w-4" />}
                                    Yes, Cancel & Pay Penalty
                                  </Button>
                                  <Button
                                    variant="outline"
                                    className="rounded-xl"
                                    onClick={() => setShowPenaltyConfirm(false)}
                                    data-testid="button-cancel-penalty-dialog"
                                  >
                                    Go Back
                                  </Button>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <Button
                              variant="destructive"
                              className="w-full rounded-xl"
                              onClick={() => workerEnRoute ? setShowPenaltyConfirm(true) : cancelJob(job.id)}
                              disabled={isCancelling}
                              data-testid="button-cancel-job"
                            >
                              {isCancelling ? <Loader2 className="animate-spin mr-2" /> : <XCircle className="mr-2 h-4 w-4" />}
                              {workerEnRoute ? "Cancel Job (10% Penalty)" : "Cancel Job & Get Refund"}
                            </Button>
                          );
                        })()}
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
                        ) : isWorker && isInProgress && workerIds.length === 1 ? (
                          <div className="space-y-4" data-testid="section-worker-progress">
                            <p className="text-sm font-medium text-foreground">Update your progress:</p>
                            <div className="space-y-3">
                              {[
                                { key: 'getting_ready', label: 'Getting Ready', description: 'Preparing for the job', icon: Clock },
                                { key: 'on_the_way', label: 'On the Way', description: 'Heading to the location', icon: Navigation },
                                { key: 'at_location', label: 'At Location', description: 'Arrived at the job site', icon: MapPinCheck },
                              ].map((step) => {
                                const progressOrder = ['getting_ready', 'on_the_way', 'at_location'];
                                const currentIdx = job.workerProgress ? progressOrder.indexOf(job.workerProgress) : -1;
                                const stepIdx = progressOrder.indexOf(step.key);
                                const isDone = stepIdx <= currentIdx;
                                const canClick = stepIdx > currentIdx;
                                const StepIcon = step.icon;
                                return (
                                  <div key={step.key} className={`flex items-center gap-3 p-3 rounded-xl border ${isDone ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800' : canClick ? 'bg-primary/5 border-primary/20' : 'bg-muted/30 border-border'}`} data-testid={`worker-progress-step-${step.key}`}>
                                    <div className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 ${isDone ? 'bg-green-500 text-white' : canClick ? 'bg-primary/20 text-primary' : 'bg-muted-foreground/10 text-muted-foreground'}`}>
                                      {isDone ? <Check className="w-5 h-5" /> : <StepIcon className="w-5 h-5" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className={`text-sm font-medium ${isDone ? 'text-green-700 dark:text-green-300' : 'text-foreground'}`}>{step.label}</p>
                                      <p className="text-xs text-muted-foreground">{step.description}</p>
                                    </div>
                                    {canClick && (
                                      <Button
                                        size="sm"
                                        onClick={() => updateProgress({ id: job.id, progress: step.key })}
                                        disabled={isUpdatingProgress}
                                        data-testid={`button-progress-${step.key}`}
                                      >
                                        {isUpdatingProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : <StepIcon className="w-4 h-4 mr-1" />}
                                        {step.label}
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            {(job.workerProgress === 'on_the_way' || job.workerProgress === 'at_location') && (
                              <div className="space-y-3">
                                <div className="flex items-center text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-100 dark:border-amber-900 text-sm">
                                  <AlertTriangle className="w-4 h-4 mr-2 shrink-0" />
                                  If the poster cancels now, you will receive 10% compensation within 24 hours.
                                </div>
                                <WorkerLocationTracker
                                  jobId={job.id}
                                  workerProgress={job.workerProgress}
                                  onLocationUpdate={() => queryClientRef.invalidateQueries({ queryKey: ['/api/jobs/:id', id] })}
                                />
                              </div>
                            )}
                            {job.workerProgress === 'at_location' && (
                              <div className="flex items-center text-blue-600 bg-blue-50 dark:bg-blue-950/30 p-3 rounded-xl border border-blue-100 dark:border-blue-900 text-sm">
                                <MapPinCheck className="w-4 h-4 mr-2 shrink-0" />
                                {job.posterConfirmedArrival ? "The poster has confirmed your arrival." : "Waiting for the poster to confirm your arrival."}
                              </div>
                            )}

                            {/* Worker completion button — dual-confirmation */}
                            {job.workerMarkedComplete ? (
                              <div className="flex items-center text-green-600 bg-green-50 dark:bg-green-950/30 p-3 rounded-xl border border-green-100 dark:border-green-900 text-sm" data-testid="text-worker-marked-complete">
                                <CheckCircle className="w-4 h-4 mr-2 shrink-0" />
                                You marked this job as complete. Waiting for the poster to confirm.
                              </div>
                            ) : (
                              <Button
                                className="w-full h-12 text-lg bg-green-600 text-white rounded-xl shadow-lg shadow-green-600/20"
                                onClick={() => completeJob(job.id)}
                                disabled={isCompleting}
                                data-testid="button-worker-complete-job"
                              >
                                {isCompleting ? <Loader2 className="animate-spin mr-2" /> : <CheckCircle className="mr-2 h-5 w-5" />}
                                Mark Job as Done
                              </Button>
                            )}
                            {job.posterMarkedComplete && !job.workerMarkedComplete && (
                              <div className="flex items-center text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-100 dark:border-amber-900 text-sm" data-testid="text-poster-waiting-worker">
                                <CheckCircle className="w-4 h-4 mr-2 shrink-0" />
                                The poster already confirmed — tap above to release your payment!
                              </div>
                            )}
                          </div>
                        ) : isWorker && isInProgress && workerIds.length > 1 ? (
                          <div className="space-y-3 p-4 bg-primary/10 rounded-xl border border-primary/20">
                            <p className="text-primary font-medium text-center">You are working on this job.</p>
                            {job.workerMarkedComplete ? (
                              <div className="flex items-center text-green-600 bg-green-50 dark:bg-green-950/30 p-3 rounded-xl border border-green-100 dark:border-green-900 text-sm" data-testid="text-worker-marked-complete-multi">
                                <CheckCircle className="w-4 h-4 mr-2 shrink-0" />
                                You marked this job as complete. Waiting for the poster.
                              </div>
                            ) : (
                              <Button
                                className="w-full rounded-xl bg-green-600 text-white"
                                onClick={() => completeJob(job.id)}
                                disabled={isCompleting}
                                data-testid="button-worker-complete-job-multi"
                              >
                                {isCompleting ? <Loader2 className="animate-spin mr-2" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                                Mark Job as Done
                              </Button>
                            )}
                          </div>
                        ) : !isOpen && !isWorker ? (
                          <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900" data-testid="text-job-taken">
                            <div className="flex items-center gap-2 mb-2">
                              <Lock className="w-5 h-5 text-blue-600" />
                              <span className="font-semibold text-blue-700 dark:text-blue-300">This job has been accepted</span>
                            </div>
                            <p className="text-sm text-blue-600 dark:text-blue-400">
                              This job is no longer available for new workers. Browse other open jobs to find work.
                            </p>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {showDisputeForm && isPoster && isInProgress && !dispute && (
                <Card className="p-6">
                  <h4 className="font-bold font-display mb-4 flex items-center gap-2">
                    <Flag className="w-5 h-5 text-amber-600" />
                    Raise a Concern
                  </h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Describe your concern about the work. The worker will be notified and you can negotiate a fair resolution.
                  </p>
                  <div className="space-y-3">
                    {workerIds.length > 1 && (
                      <div>
                        <label className="text-sm font-medium mb-1 block">Select Worker</label>
                        <select
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                          value={disputeWorkerId}
                          onChange={(e) => setDisputeWorkerId(e.target.value)}
                          data-testid="select-dispute-worker"
                        >
                          <option value="">Select a worker...</option>
                          {workerIds.map((wId) => (
                            <option key={wId} value={wId}>{wId}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="text-sm font-medium mb-1 block">What's the issue?</label>
                      <Textarea
                        placeholder="Describe the problem with the work..."
                        value={disputeMessage}
                        onChange={(e) => setDisputeMessage(e.target.value)}
                        className="resize-none"
                        rows={3}
                        data-testid="input-dispute-message"
                      />
                    </div>
                    <Button
                      className="w-full rounded-xl"
                      variant="destructive"
                      onClick={handleCreateDispute}
                      disabled={isCreatingDispute || !disputeMessage.trim()}
                      data-testid="button-submit-dispute"
                    >
                      {isCreatingDispute ? <Loader2 className="animate-spin mr-2" /> : <Flag className="mr-2 h-4 w-4" />}
                      Submit Concern
                    </Button>
                  </div>
                </Card>
              )}

              {dispute && isDisputeParticipant && (
                <div className="space-y-4" data-testid="section-dispute">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-bold font-display flex items-center gap-2">
                      <Scale className="w-5 h-5 text-amber-600" />
                      Dispute Resolution
                    </h3>
                    {getDisputeStatusBadge(dispute.status)}
                  </div>

                  {dispute.status === 'resolved' && dispute.resolvedAmount && (
                    <Card className="p-4 border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-900">
                      <div className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-medium text-green-800 dark:text-green-200">Dispute Resolved</p>
                          <p className="text-sm text-green-700 dark:text-green-300">
                            Final amount: {"\u20A6"}{Number(dispute.resolvedAmount).toLocaleString()}
                            {dispute.resolvedBy === 'admin' ? ' (decided by admin)' : ' (agreed by both parties)'}
                          </p>
                        </div>
                      </div>
                    </Card>
                  )}

                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {dispute.messages?.map((msg: DisputeMessageWithSender) => {
                      const isMe = msg.senderId === user?.id;
                      return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`} data-testid={`dispute-message-${msg.id}`}>
                          <div className={`max-w-[80%] rounded-2xl p-4 ${
                            msg.type === 'proposal' 
                              ? 'bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800' 
                              : msg.type === 'acceptance'
                              ? 'bg-green-50 border border-green-200 dark:bg-green-950/30 dark:border-green-800'
                              : isMe 
                              ? 'bg-primary/10 border border-primary/20' 
                              : 'bg-muted/50 border border-border'
                          }`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium text-foreground">
                                {isMe ? "You" : (msg.sender?.firstName || "User")}
                              </span>
                              {msg.type === 'proposal' && (
                                <Badge variant="secondary" className="text-xs">Price Proposal</Badge>
                              )}
                              {msg.type === 'acceptance' && (
                                <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300">Accepted</Badge>
                              )}
                            </div>
                            <p className="text-sm text-foreground">{msg.message}</p>
                            {msg.amount && (
                              <p className="text-lg font-bold text-primary mt-1">{"\u20A6"}{Number(msg.amount).toLocaleString()}</p>
                            )}
                            {msg.imageUrl && (
                              <div className="mt-2">
                                <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer">
                                  <img src={msg.imageUrl} alt="Attached" className="max-w-xs max-h-48 rounded-lg border border-border object-cover cursor-pointer" />
                                </a>
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              {msg.createdAt ? format(new Date(msg.createdAt), "PP p") : ""}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {dispute.status !== 'resolved' && (
                    <div className="space-y-3">
                      {dispute.proposedAmount && dispute.workerId === user?.id && dispute.status === 'negotiating' && (
                        <Card className="p-4 border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800">
                          <div className="flex items-start gap-3">
                            <Scale className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                            <div className="space-y-2 w-full">
                              <p className="font-medium text-blue-800 dark:text-blue-200">Price Proposal</p>
                              <p className="text-sm text-blue-700 dark:text-blue-300">
                                The poster is proposing {"\u20A6"}{Number(dispute.proposedAmount).toLocaleString()} instead of the original {"\u20A6"}{Number(job.price).toLocaleString()}.
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  className="bg-green-600 text-white"
                                  onClick={() => acceptProposal({ disputeId: dispute.id, jobId: job.id })}
                                  disabled={isAcceptingProposal}
                                  data-testid="button-accept-proposal"
                                >
                                  {isAcceptingProposal ? <Loader2 className="animate-spin mr-1 h-3 w-3" /> : <Check className="mr-1 h-3 w-3" />}
                                  Accept Proposal
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => escalateDispute({ disputeId: dispute.id, jobId: job.id })}
                                  disabled={isEscalating}
                                  data-testid="button-escalate-from-proposal"
                                >
                                  <ArrowUpCircle className="mr-1 h-3 w-3" />
                                  Escalate to Admin
                                </Button>
                              </div>
                            </div>
                          </div>
                        </Card>
                      )}

                      {disputeImagePreview && (
                        <div className="relative inline-block">
                          <img src={disputeImagePreview} alt="Preview" className="h-16 rounded-lg border border-border" />
                          <button
                            onClick={() => { setDisputeImage(null); setDisputeImagePreview(null); }}
                            className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs"
                          >
                            x
                          </button>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          id="dispute-file-input"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file && file.type.startsWith('image/')) {
                              setDisputeImage(file);
                              setDisputeImagePreview(URL.createObjectURL(file));
                            }
                          }}
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => document.getElementById('dispute-file-input')?.click()}
                          disabled={isUploadingImage}
                          data-testid="button-attach-dispute-image"
                        >
                          {isUploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                        </Button>
                        <Input
                          placeholder="Type your message..."
                          value={disputeReplyMessage}
                          onChange={(e) => setDisputeReplyMessage(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendDisputeReply()}
                          data-testid="input-dispute-reply"
                        />
                        <Button
                          size="icon"
                          onClick={handleSendDisputeReply}
                          disabled={isSendingMessage || isUploadingImage || (!disputeReplyMessage.trim() && !disputeImage)}
                          data-testid="button-send-dispute-reply"
                        >
                          {(isSendingMessage || isUploadingImage) ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />}
                        </Button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {isPoster && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowProposalForm(!showProposalForm)}
                            data-testid="button-toggle-proposal"
                          >
                            <Scale className="mr-1 h-3 w-3" />
                            {showProposalForm ? "Cancel" : "Propose Adjusted Price"}
                          </Button>
                        )}
                        {dispute.status !== 'escalated' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-200 dark:border-red-800"
                            onClick={() => escalateDispute({ disputeId: dispute.id, jobId: job.id })}
                            disabled={isEscalating}
                            data-testid="button-escalate"
                          >
                            {isEscalating ? <Loader2 className="animate-spin mr-1 h-3 w-3" /> : <ArrowUpCircle className="mr-1 h-3 w-3" />}
                            Escalate to Admin
                          </Button>
                        )}
                      </div>

                      {showProposalForm && isPoster && (
                        <Card className="p-4">
                          <h4 className="font-medium text-sm mb-3">Propose a new price</h4>
                          <div className="space-y-2">
                            <Input
                              type="number"
                              placeholder="Enter proposed amount"
                              value={proposalAmount}
                              onChange={(e) => setProposalAmount(e.target.value)}
                              min={0}
                              max={Number(job.price)}
                              data-testid="input-proposal-amount"
                            />
                            <Textarea
                              placeholder="Explain your proposal (optional)"
                              value={proposalMessage}
                              onChange={(e) => setProposalMessage(e.target.value)}
                              className="resize-none"
                              rows={2}
                              data-testid="input-proposal-message"
                            />
                            <Button
                              size="sm"
                              className="w-full"
                              onClick={handleSendProposal}
                              disabled={isSendingMessage || !proposalAmount}
                              data-testid="button-send-proposal"
                            >
                              {isSendingMessage ? <Loader2 className="animate-spin mr-1 h-3 w-3" /> : <Send className="mr-1 h-3 w-3" />}
                              Send Price Proposal
                            </Button>
                          </div>
                        </Card>
                      )}

                      {dispute.status === 'escalated' && (
                        <div className="text-center p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-100 dark:border-amber-900 text-amber-700 dark:text-amber-300 text-sm">
                          This dispute has been escalated. An admin will review and make a final decision.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

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

            <div className="space-y-6">
              <section>
                <h3 className="text-lg font-bold font-display mb-4">Job Details</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Category</span>
                    <span className="text-sm font-medium capitalize text-foreground">{job.category}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Workers Needed</span>
                    <span className="text-sm font-medium text-foreground">{job.workersNeeded}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <span className="text-sm font-medium capitalize text-foreground">{job.status.replace('_', ' ')}</span>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-lg font-bold font-display mb-4">Posted By</h3>
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 border border-border">
                    <AvatarImage src={job.poster?.profileImageUrl || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                      {job.poster?.firstName?.[0] || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Job poster</p>
                    <p className="font-medium text-foreground" data-testid="text-poster-fullname">
                      {[job.poster?.firstName, job.poster?.lastName].filter(Boolean).join(' ') || "Unknown"}
                    </p>
                  </div>
                </div>
              </section>

              {(job.status === 'in_progress' || job.status === 'completed') && job.worker && (
                <section>
                  <h3 className="text-lg font-bold font-display mb-4">Accepted By</h3>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border border-border">
                      <AvatarImage src={job.worker?.profileImageUrl || undefined} />
                      <AvatarFallback className="bg-green-500/10 text-green-600 font-bold">
                        {job.worker?.firstName?.[0] || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Worker</p>
                      <p className="font-medium text-foreground" data-testid="text-worker-fullname">
                        {[job.worker?.firstName, job.worker?.lastName].filter(Boolean).join(' ') || "Unknown"}
                      </p>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Photo Lightbox */}
      {job.images && job.images.length > 0 && lightboxIndex !== null && (
        <LightboxDialog open={lightboxIndex !== null} onOpenChange={(open) => { if (!open) setLightboxIndex(null); }}>
          <LightboxContent className="max-w-3xl p-0 bg-black/95 border-none rounded-2xl overflow-hidden">
            <div className="relative w-full">
              <img
                src={job.images[lightboxIndex]}
                alt={`Job photo ${lightboxIndex + 1}`}
                className="w-full max-h-[80vh] object-contain"
                data-testid="img-lightbox"
              />
              {job.images.length > 1 && (
                <>
                  <button
                    onClick={() => setLightboxIndex(i => i !== null ? (i - 1 + job.images!.length) % job.images!.length : 0)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/80 text-white rounded-full flex items-center justify-center transition-colors"
                    data-testid="button-lightbox-prev"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setLightboxIndex(i => i !== null ? (i + 1) % job.images!.length : 0)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/50 hover:bg-black/80 text-white rounded-full flex items-center justify-center transition-colors"
                    data-testid="button-lightbox-next"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {job.images.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setLightboxIndex(i)}
                        className={`w-2 h-2 rounded-full transition-colors ${i === lightboxIndex ? 'bg-white' : 'bg-white/40 hover:bg-white/60'}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </LightboxContent>
        </LightboxDialog>
      )}
    </div>
  );
}
