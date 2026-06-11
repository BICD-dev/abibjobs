import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useDisputeByJob(jobId: number, enablePolling = false) {
  return useQuery({
    queryKey: ['/api/jobs', jobId, 'dispute'],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${jobId}/dispute`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch dispute");
      return res.json();
    },
    enabled: !!jobId,
    // Live-sync the dispute so both poster AND worker see it appear the moment
    // a concern is raised, and see new chat messages without reloading. We stop
    // once the dispute is resolved (nothing left to update).
    refetchInterval: (query) => {
      if (!enablePolling) return false;
      const data = query.state.data as any;
      if (data && data.status === 'resolved') return false;
      return 5000;
    },
  });
}

export function useDispute(disputeId: number) {
  return useQuery({
    queryKey: ['/api/disputes', disputeId],
    queryFn: async () => {
      const res = await fetch(`/api/disputes/${disputeId}`, { credentials: "include" });
      if (res.status === 423) {
        const data = await res.json();
        const err = new Error(data.message || "This dispute is locked") as any;
        err.status = 423;
        err.lockedBy = data.lockedBy;
        err.daysRemaining = data.daysRemaining;
        throw err;
      }
      if (!res.ok) throw new Error("Failed to fetch dispute");
      return res.json();
    },
    enabled: !!disputeId,
    retry: false,
  });
}

export function useAdminDisputes(status?: string) {
  return useQuery({
    queryKey: ['/api/admin/disputes', status],
    queryFn: async () => {
      const url = status ? `/api/admin/disputes?status=${status}` : '/api/admin/disputes';
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch disputes");
      return res.json();
    },
  });
}

export function useCreateDispute() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ jobId, workerId, message }: { jobId: number; workerId: string; message: string }) => {
      const res = await fetch(`/api/jobs/${jobId}/dispute`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId, message }),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create dispute");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', vars.jobId, 'dispute'] });
      queryClient.invalidateQueries({ queryKey: [api.jobs.get.path, vars.jobId] });
      toast({ title: "Dispute Raised", description: "Your concern has been submitted. The worker will be notified." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useDisputeMessage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ disputeId, jobId, message, type, amount, imageUrl }: { disputeId: number; jobId: number; message: string; type?: string; amount?: number; imageUrl?: string }) => {
      const res = await fetch(`/api/disputes/${disputeId}/message`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, type: type || 'message', amount, imageUrl }),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to send message");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', vars.jobId, 'dispute'] });
      queryClient.invalidateQueries({ queryKey: ['/api/disputes', vars.disputeId] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/disputes'] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useAcceptProposal() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ disputeId, jobId }: { disputeId: number; jobId: number }) => {
      const res = await fetch(`/api/disputes/${disputeId}/accept-proposal`, {
        method: 'POST',
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to accept proposal");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', vars.jobId, 'dispute'] });
      queryClient.invalidateQueries({ queryKey: ['/api/disputes', vars.disputeId] });
      queryClient.invalidateQueries({ queryKey: [api.jobs.get.path, vars.jobId] });
      queryClient.invalidateQueries({ queryKey: [api.wallet.get.path] });
      toast({ title: "Proposal Accepted", description: "The dispute has been resolved and funds distributed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useConfirmDisputePayment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ disputeId, jobId }: { disputeId: number; jobId: number }) => {
      const res = await fetch(`/api/disputes/${disputeId}/confirm-payment`, {
        method: 'POST',
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to confirm payment");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', vars.jobId, 'dispute'] });
      queryClient.invalidateQueries({ queryKey: ['/api/disputes', vars.disputeId] });
      queryClient.invalidateQueries({ queryKey: [api.jobs.get.path, vars.jobId] });
      queryClient.invalidateQueries({ queryKey: [api.wallet.get.path] });
      toast({ title: "Payment Confirmed", description: "Funds have been released to the worker." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useEscalateDispute() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ disputeId, jobId }: { disputeId: number; jobId: number }) => {
      const res = await fetch(`/api/disputes/${disputeId}/escalate`, {
        method: 'POST',
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to escalate dispute");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', vars.jobId, 'dispute'] });
      queryClient.invalidateQueries({ queryKey: ['/api/disputes', vars.disputeId] });
      toast({ title: "Dispute Escalated", description: "An admin will review and resolve this dispute." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useResolveDispute() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ disputeId, action, workerAmount, posterRefund, message }: {
      disputeId: number;
      action: 'refund_poster' | 'release_worker' | 'custom';
      workerAmount?: number;
      posterRefund?: number;
      message?: string;
    }) => {
      const res = await fetch(`/api/disputes/${disputeId}/resolve`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, workerAmount, posterRefund, message }),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to resolve dispute");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/disputes', vars.disputeId] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/disputes'] });
      toast({ title: "Dispute Resolved", description: "The dispute has been resolved and funds distributed." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useUploadDisputeImage() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      const metaRes = await fetch('/api/uploads/request-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
        credentials: 'include',
      });
      if (!metaRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await metaRes.json();

      const uploadRes = await fetch(uploadURL, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Failed to upload image");

      return objectPath;
    },
    onError: (error: Error) => {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    },
  });
}
