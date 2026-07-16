import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export interface InitializeFundingInput {
  amount: number;
}
export interface VerifyFundingInput {
  reference: string;
}
export interface InitializeFundingResponse {
  checkoutUrl: string;
  reference: string;
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

export function useInitializeFunding() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (
      input: InitializeFundingInput
    ): Promise<InitializeFundingResponse> => {
      const res = await fetch(api.wallet.initializeFunding.path, {
        method: api.wallet.initializeFunding.method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.message || "Unable to initialize payment.");
      }

      return api.wallet.initializeFunding.responses[200].parse(body);
    },

    onError(error: Error) {
      toast({
        title: "Unable to start payment",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useVerifyFunding(reference: string | undefined) {
  return useQuery({
    enabled: !!reference,
    queryKey: [api.wallet.verifyFunding.path, reference],

    queryFn: async () => {
      const path = api.wallet.verifyFunding.path.replace(
        ":reference",
        reference!
      );

      const res = await fetch(path, {
        credentials: "include",
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.message || "Payment verification failed.");
      }

      return api.wallet.verifyFunding.responses[200].parse(body);
    },
  });
}

export interface WithdrawInput {
  amount: number;
  bankCode?: string;
  bankName: string;
  accountNumber: string;
  accountName?: string;
}


export function useWithdraw() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: WithdrawInput) => {
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
