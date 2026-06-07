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

export interface CardDepositInput {
  amount: number;
  paymentMethod: 'card' | 'bank_account';
  cardNumber?: string;
  cardExpiry?: string;
  cardCvv?: string;
  bankCode?: string;
  accountNumber?: string;
}

export interface VerifyOtpInput {
  sessionId: string;
  otp: string;
}

export interface ResendOtpInput {
  sessionId: string;
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

export function useCardDeposit() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CardDepositInput) => {
      const res = await fetch(api.wallet.cardDeposit.path, {
        method: api.wallet.cardDeposit.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to initiate payment");
      }
      return res.json() as Promise<{ sessionId: string; message: string; otpSentTo: string }>;
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

export function useVerifyOtp() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: VerifyOtpInput) => {
      const res = await fetch(api.wallet.verifyOtp.path, {
        method: api.wallet.verifyOtp.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "OTP verification failed");
      }
      return res.json() as Promise<{ newBalance: string; message: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.wallet.get.path] });
      toast({
        title: "Deposit Successful",
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Verification Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useResendOtp() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: ResendOtpInput) => {
      const res = await fetch(api.wallet.resendOtp.path, {
        method: api.wallet.resendOtp.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to resend OTP");
      }
      return res.json() as Promise<{ message: string; otpSentTo: string }>;
    },
    onSuccess: () => {
      toast({
        title: "OTP Resent",
        description: "A new OTP has been sent to your phone/email.",
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

export interface DepositMethod {
  bankCode: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
}

export interface WithdrawInput {
  amount: number;
  bankCode?: string;
  bankName: string;
  accountNumber: string;
  accountName?: string;
}

export function useDepositMethods() {
  return useQuery({
    queryKey: [api.wallet.depositMethods.path],
    queryFn: async () => {
      const res = await fetch(api.wallet.depositMethods.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch deposit methods");
      return res.json() as Promise<{ methods: DepositMethod[]; hasDeposits: boolean }>;
    },
  });
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
