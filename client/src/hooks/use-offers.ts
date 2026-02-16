import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useOffers(jobId: number) {
  return useQuery({
    queryKey: ['/api/jobs', jobId, 'offers'],
    queryFn: async () => {
      const res = await fetch(`/api/jobs/${jobId}/offers`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch offers");
      return res.json();
    },
    enabled: !!jobId,
  });
}

export function useCreateOffer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ jobId, amount, message }: { jobId: number; amount: number; message?: string }) => {
      const res = await fetch(`/api/jobs/${jobId}/offers`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, message }),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to send offer");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', vars.jobId, 'offers'] });
      toast({ title: "Offer Sent", description: "Your price offer has been sent to the job poster." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useAcceptOffer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ offerId, jobId }: { offerId: number; jobId: number }) => {
      const res = await fetch(`/api/offers/${offerId}/accept`, {
        method: 'POST',
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to accept offer");
      }
      return res.json();
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', vars.jobId, 'offers'] });
      queryClient.invalidateQueries({ queryKey: [api.jobs.get.path, vars.jobId] });
      queryClient.invalidateQueries({ queryKey: [api.wallet.get.path] });
      if (data.insufficientFunds) {
        toast({
          title: "Insufficient Funds",
          description: `You need ₦${Number(data.shortfall).toLocaleString()} more in your wallet to accept this offer. Please add funds first.`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Offer Accepted", description: "The new price has been agreed upon." });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useDeclineOffer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ offerId, jobId }: { offerId: number; jobId: number }) => {
      const res = await fetch(`/api/offers/${offerId}/decline`, {
        method: 'POST',
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to decline offer");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', vars.jobId, 'offers'] });
      toast({ title: "Offer Declined", description: "The offer has been declined." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useCounterOffer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ offerId, jobId, amount, message }: { offerId: number; jobId: number; amount: number; message?: string }) => {
      const res = await fetch(`/api/offers/${offerId}/counter`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, message }),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to send counter offer");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs', vars.jobId, 'offers'] });
      toast({ title: "Counter Offer Sent", description: "Your counter offer has been sent." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}
