import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Building2, X, Plus, Star, ShieldCheck, Info } from "lucide-react";
import { NIGERIAN_BANKS } from "@/lib/nigerian-banks";
import { useToast } from "@/hooks/use-toast";

interface Beneficiary {
  id: number;
  bankName: string;
  bankCode: string | null;
  accountNumber: string;
  accountName: string | null;
  isDefault: boolean;
}

interface WithdrawModalProps {
  balance: number;
  trigger?: React.ReactNode;
}

export function WithdrawModal({ balance, trigger }: WithdrawModalProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const [otpMode, setOtpMode] = useState(false);
  const [otpReference, setOtpReference] = useState("");
  const [otpCode, setOtpCode] = useState("");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const selectedBank = NIGERIAN_BANKS.find((b) => b.code === bankCode);

  const { data: beneficiaries = [] } = useQuery<Beneficiary[]>({
    queryKey: ["/api/wallet/beneficiaries"],
    queryFn: async () => {
      const res = await fetch("/api/wallet/beneficiaries", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
  });

  const isBeneficiaryAccount = useMemo(() => {
    if (selectedBeneficiaryId) return true;
    if (!bankCode || accountNumber.length !== 10) return false;
    return beneficiaries.some(
      (b) => b.bankCode === bankCode && b.accountNumber === accountNumber
    );
  }, [selectedBeneficiaryId, bankCode, accountNumber, beneficiaries]);

  const deleteBeneficiary = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/wallet/beneficiaries/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/beneficiaries"] });
      toast({ title: "Removed", description: "Beneficiary removed." });
    },
  });

  const requestOtp = useMutation({
    mutationFn: async (data: { amount: number; bankCode: string; bankName: string; accountNumber: string; accountName?: string }) => {
      const res = await fetch("/api/wallet/withdraw-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to send OTP");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setOtpReference(data.reference);
      setOtpMode(true);
      toast({ title: "OTP Sent", description: "Check your email for the verification code." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const verifyOtp = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/wallet/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reference: otpReference, otpCode }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Verification failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/beneficiaries"] });
      toast({ title: "Withdrawal Successful", description: "Your funds are on the way!" });
      setOpen(false);
      reset();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const submitWithdrawalRequest = useMutation({
    mutationFn: async (data: { amount: string; bankName: string; bankCode: string; accountNumber: string; accountName?: string; reason: string }) => {
      const res = await fetch("/api/wallet/withdrawal-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to submit request");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet"] });
      toast({ title: "Request Submitted", description: "Your withdrawal request has been sent for admin approval. You will be notified when it is processed." });
      setOpen(false);
      reset();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const reset = () => {
    setAmount("");
    setBankCode("");
    setAccountNumber("");
    setAccountName("");
    setSelectedBeneficiaryId(null);
    setReason("");
    setOtpMode(false);
    setOtpReference("");
    setOtpCode("");
  };

  const selectBeneficiary = (b: Beneficiary) => {
    setSelectedBeneficiaryId(b.id);
    setBankCode(b.bankCode || "");
    setAccountNumber(b.accountNumber);
    setAccountName(b.accountName || "");
  };

  const clearSelection = () => {
    setSelectedBeneficiaryId(null);
    setBankCode("");
    setAccountNumber("");
    setAccountName("");
  };

  const isValid =
    !!amount && Number(amount) > 0 && Number(amount) <= balance &&
    !!bankCode && accountNumber.length === 10 &&
    (isBeneficiaryAccount || reason.trim().length > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    const bankName = selectedBank?.name || "";

    if (isBeneficiaryAccount) {
      requestOtp.mutate({ amount: Number(amount), bankCode, bankName, accountNumber, accountName: accountName || undefined });
    } else {
      submitWithdrawalRequest.mutate({
        amount: Number(amount).toFixed(2),
        bankName,
        bankCode,
        accountNumber,
        accountName: accountName || undefined,
        reason: reason.trim(),
      });
    }
  };

  const isPending = requestOtp.isPending || verifyOtp.isPending || submitWithdrawalRequest.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="bg-primary-foreground/10 text-white font-bold px-6 rounded-xl border-2 border-white/20" data-testid="button-open-withdraw">
            Withdraw
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="rounded-2xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle data-testid="text-withdraw-dialog-title">
            {otpMode ? "Enter Verification Code" : "Withdraw to Bank"}
          </DialogTitle>
        </DialogHeader>

        {otpMode ? (
          <div className="space-y-4 px-6 pb-6 pt-2">
            <div className="bg-muted/50 rounded-xl p-3 text-sm space-y-1">
              <p className="font-medium">{selectedBank?.name}</p>
              <p className="text-muted-foreground">{accountNumber}{accountName ? ` — ${accountName}` : ''}</p>
              <p className="font-bold text-primary text-lg mt-2">₦{Number(amount).toLocaleString()}</p>
            </div>

            <div className="bg-green-50 dark:bg-green-950/30 rounded-xl p-3 flex items-start gap-2 text-sm text-green-700 dark:text-green-400">
              <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>A 6-digit code has been sent to your email. Enter it below to confirm.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Verification Code</label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                className="rounded-xl text-lg text-center tracking-[0.5em] font-mono"
                autoFocus
                data-testid="input-otp-code"
              />
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => { setOtpMode(false); setOtpCode(""); }}
                data-testid="button-otp-back"
              >
                Back
              </Button>
              <Button
                className="flex-1 rounded-xl font-bold"
                disabled={otpCode.length !== 6 || verifyOtp.isPending}
                onClick={() => verifyOtp.mutate()}
                data-testid="button-verify-otp"
              >
                {verifyOtp.isPending ? <Loader2 className="animate-spin" /> : "Verify & Withdraw"}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 px-6 pb-6 overflow-y-auto flex-1 min-h-0 pt-2">
            {beneficiaries.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Saved Accounts</label>
                <div className="flex flex-wrap gap-2">
                  {beneficiaries.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => selectBeneficiary(b)}
                      className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        selectedBeneficiaryId === b.id
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-muted border-border"
                      }`}
                      data-testid={`chip-beneficiary-${b.id}`}
                    >
                      {b.isDefault && <Star className="w-3 h-3 fill-current" />}
                      <span className="truncate max-w-[140px]">{b.bankName}</span>
                      <span className="opacity-60">{b.accountNumber.slice(-4)}</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); deleteBeneficiary.mutate(b.id); }}
                        className={`ml-0.5 rounded-full p-0.5 transition-opacity ${
                          selectedBeneficiaryId === b.id
                            ? "hover:bg-primary-foreground/20 opacity-70 hover:opacity-100"
                            : "hover:bg-muted opacity-0 group-hover:opacity-70 hover:!opacity-100"
                        }`}
                        data-testid={`button-delete-beneficiary-${b.id}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </button>
                  ))}
                  {selectedBeneficiaryId && (
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm border border-dashed border-border text-muted-foreground hover:bg-muted transition-colors"
                      data-testid="button-add-new-beneficiary"
                    >
                      <Plus className="w-3 h-3" />
                      New account
                    </button>
                  )}
                </div>
              </div>
            )}

            {(!selectedBeneficiaryId || beneficiaries.length === 0) && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Select Bank
                  </label>
                  <Select value={bankCode} onValueChange={setBankCode}>
                    <SelectTrigger className="rounded-xl" data-testid="select-withdraw-bank">
                      <SelectValue placeholder="Choose your bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {NIGERIAN_BANKS.map((bank) => (
                        <SelectItem key={bank.code} value={bank.code} data-testid={`select-withdraw-bank-option-${bank.code}`}>
                          {bank.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Account Number</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={10}
                    placeholder="Enter 10-digit account number"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                    className="rounded-xl"
                    data-testid="input-withdraw-account-number"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Account Name (optional)</label>
                  <Input
                    type="text"
                    placeholder="e.g. John Doe"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    className="rounded-xl"
                    data-testid="input-withdraw-account-name"
                  />
                </div>
              </>
            )}

            {selectedBeneficiaryId && (
              <div className="bg-muted/50 rounded-xl p-3 text-sm space-y-1">
                <p className="font-medium">{selectedBank?.name || bankCode}</p>
                <p className="text-muted-foreground">{accountNumber}{accountName ? ` — ${accountName}` : ''}</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Amount (₦)</label>
              <Input
                type="number"
                min="1"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="rounded-xl text-lg"
                data-testid="input-withdraw-amount"
              />
              <p className="text-xs text-muted-foreground">Available: ₦{balance.toLocaleString()}</p>
            </div>

            {bankCode && accountNumber.length === 10 && !isBeneficiaryAccount && (
              <div className="space-y-3">
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-3 flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p>This account is not saved. Withdrawals to new accounts require admin approval.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Reason for withdrawal</label>
                  <Textarea
                    placeholder="Why do you want to withdraw to this account?"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="rounded-xl min-h-[80px]"
                    data-testid="input-withdraw-reason"
                  />
                </div>
              </div>
            )}

            {bankCode && accountNumber.length === 10 && amount && (
              <Card className="bg-muted/50 border-dashed">
                <CardContent className="p-4 space-y-1 text-sm">
                  <p className="font-semibold text-foreground">
                    {isBeneficiaryAccount ? "Withdrawal Summary" : "Withdrawal Request Summary"}
                  </p>
                  <div className="flex justify-between gap-2 flex-wrap">
                    <span className="text-muted-foreground">Bank</span>
                    <span className="font-medium text-foreground">{selectedBank?.name}</span>
                  </div>
                  <div className="flex justify-between gap-2 flex-wrap">
                    <span className="text-muted-foreground">Account</span>
                    <span className="font-medium text-foreground">{accountNumber}</span>
                  </div>
                  <div className="flex justify-between gap-2 flex-wrap">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-bold text-primary">₦{Number(amount).toLocaleString()}</span>
                  </div>
                  {!isBeneficiaryAccount && reason.trim() && (
                    <div className="flex justify-between gap-2 flex-wrap">
                      <span className="text-muted-foreground">Reason</span>
                      <span className="font-medium text-foreground text-right max-w-[200px]">{reason.trim()}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {!!amount && Number(amount) > balance && (
              <p className="text-xs text-red-500">Amount exceeds available balance.</p>
            )}

            <Button
              type="submit"
              className="w-full rounded-xl font-bold"
              disabled={isPending || !isValid}
              data-testid="button-confirm-withdraw"
            >
              {isPending ? (
                <Loader2 className="animate-spin" />
              ) : isBeneficiaryAccount ? (
                "Send Verification Code"
              ) : (
                "Submit Withdrawal Request"
              )}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
