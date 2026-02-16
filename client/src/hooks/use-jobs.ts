import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { CreateJobInput } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useJobs(filters?: { category?: string; status?: 'open' | 'in_progress' | 'completed' | 'cancelled'; search?: string }) {
  // Construct query key including filters to ensure refetch on filter change
  const queryKey = [api.jobs.list.path, filters?.category, filters?.status, filters?.search];
  
  return useQuery({
    queryKey,
    queryFn: async () => {
      // Build URL with query params
      const url = new URL(window.location.origin + api.jobs.list.path);
      if (filters?.category) url.searchParams.append("category", filters.category);
      if (filters?.status) url.searchParams.append("status", filters.status);
      if (filters?.search) url.searchParams.append("search", filters.search);

      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch jobs");
      
      const data = await res.json();
      return api.jobs.list.responses[200].parse(data);
    },
  });
}

export function useMyJobs(enabled = true) {
  return useQuery({
    queryKey: [api.jobs.myJobs.path],
    queryFn: async () => {
      const res = await fetch(api.jobs.myJobs.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch my jobs");
      return res.json();
    },
    enabled,
  });
}

export function useJob(id: number) {
  return useQuery({
    queryKey: [api.jobs.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.jobs.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch job details");
      return api.jobs.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useCreateJob() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateJobInput) => {
      const res = await fetch(api.jobs.create.path, {
        method: api.jobs.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create job");
      }
      return api.jobs.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.jobs.list.path] });
      toast({
        title: "Success",
        description: "Job posted successfully! Money has been held in escrow.",
        variant: "default",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useAcceptJob() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.jobs.accept.path, { id });
      const res = await fetch(url, {
        method: api.jobs.accept.method,
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to accept job");
      }
      return api.jobs.accept.responses[200].parse(await res.json());
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: [api.jobs.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.jobs.get.path, id] });
      toast({
        title: "Job Accepted",
        description: "You have accepted this job. Good luck!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useCompleteJob() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.jobs.complete.path, { id });
      const res = await fetch(url, {
        method: api.jobs.complete.method,
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to complete job");
      }
      return api.jobs.complete.responses[200].parse(await res.json());
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: [api.jobs.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.jobs.get.path, id] });
      queryClient.invalidateQueries({ queryKey: [api.wallet.get.path] });
      toast({
        title: "Job Completed",
        description: "Funds have been released to the worker(s).",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateJobProgress() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, progress }: { id: number; progress: string }) => {
      const url = buildUrl(api.jobs.updateProgress.path, { id });
      const res = await fetch(url, {
        method: api.jobs.updateProgress.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress }),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to update progress");
      }
      return res.json();
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: [api.jobs.get.path, id] });
      queryClient.invalidateQueries({ queryKey: [api.jobs.list.path] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useConfirmArrival() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.jobs.confirmArrival.path, { id });
      const res = await fetch(url, {
        method: api.jobs.confirmArrival.method,
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to confirm arrival");
      }
      return res.json();
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: [api.jobs.get.path, id] });
      toast({
        title: "Arrival Confirmed",
        description: "You've confirmed the worker has arrived at the location.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useCancelJob() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.jobs.cancel.path, { id });
      const res = await fetch(url, {
        method: api.jobs.cancel.method,
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to cancel job");
      }
      return api.jobs.cancel.responses[200].parse(await res.json());
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: [api.jobs.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.jobs.get.path, id] });
      queryClient.invalidateQueries({ queryKey: [api.wallet.get.path] });
      toast({
        title: "Job Cancelled",
        description: "Your escrow funds have been refunded to your wallet.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useReportNoShow() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, action }: { id: number; action: 'repost' | 'delete' }) => {
      const url = buildUrl(api.jobs.noShow.path, { id });
      const res = await fetch(url, {
        method: api.jobs.noShow.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to report no-show");
      }
      return res.json();
    },
    onSuccess: (data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [api.jobs.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.jobs.get.path, id] });
      queryClient.invalidateQueries({ queryKey: [api.wallet.get.path] });
      toast({
        title: "No-Show Reported",
        description: data.reposted 
          ? "The job has been reposted for new workers. Escrow refunded."
          : "The job has been removed and your escrow has been refunded.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
