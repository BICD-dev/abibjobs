import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export interface WalletTransactionInput {
  amount: number;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName?: string;
}

export function useWallet() {
  return useQuery({
    queryKey: [api.wallet.get.path],
    queryFn: async () => {
      const res = await fetch(api.wallet.get.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch wallet info");
      return api.wallet.get.responses[200].parse(await res.json());
    },
  });
}

export function useDeposit() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: WalletTransactionInput) => {
      const res = await fetch(api.wallet.deposit.path, {
        method: api.wallet.deposit.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Deposit failed");
      return api.wallet.deposit.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.wallet.get.path] });
      toast({
        title: "Deposit Successful",
        description: "Funds have been added to your wallet.",
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

export function useWithdraw() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: WalletTransactionInput) => {
      const res = await fetch(api.wallet.withdraw.path, {
        method: api.wallet.withdraw.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Withdrawal failed");
      }
      return api.wallet.withdraw.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.wallet.get.path] });
      toast({
        title: "Withdrawal Successful",
        description: "Funds have been sent to your bank account.",
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
