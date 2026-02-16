import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useAdminEarnings() {
  return useQuery({
    queryKey: [api.admin.earnings.path],
    queryFn: async () => {
      const res = await fetch(api.admin.earnings.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch earnings");
      return res.json();
    },
  });
}

export function useAdminWithdraw() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: { amount: number; bankCode: string; bankName: string; accountNumber: string; accountName?: string }) => {
      const res = await fetch(api.admin.withdraw.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Withdrawal failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.admin.earnings.path] });
      toast({ title: "Withdrawal Successful", description: "Funds sent to your bank account." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}

export function useUpdateAdminBank() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: { bankCode: string; bankName: string; accountNumber: string; accountName?: string }) => {
      const res = await fetch(api.admin.updateBank.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Update failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.admin.earnings.path] });
      toast({ title: "Bank Updated", description: "Your bank details have been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
}
