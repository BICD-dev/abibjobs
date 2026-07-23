import { useWallet, useHeldJobs } from "@/hooks/use-wallet";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowUpRight, ArrowDownLeft, Wallet as WalletIcon, Building2, ArrowDownToLine, Clock, CheckCircle2, XCircle, MessageSquare, Lock, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { NIGERIAN_BANKS } from "@/lib/nigerian-banks";
import { useToast } from "@/hooks/use-toast";
import { FundWalletModal } from "@/components/wallet/FundWalletModal";
import { WithdrawModal } from "@/components/wallet/WithdrawModal";

export default function Wallet() {
  const { data: wallet, isLoading } = useWallet();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [heldOpen, setHeldOpen] = useState(false);
  const { data: heldJobs, isLoading: isHeldLoading } = useHeldJobs();

  // --- Admin-mediated "withdraw to new account" request (unchanged flow) ---
  const [requestOpen, setRequestOpen] = useState(false);
  const [reqAmount, setReqAmount] = useState("");
  const [reqBankCode, setReqBankCode] = useState("");
  const [reqAccountNumber, setReqAccountNumber] = useState("");
  const [reqAccountName, setReqAccountName] = useState("");
  const [reqReason, setReqReason] = useState("");

  const { data: myRequests = [] } = useQuery<any[]>({
    queryKey: ["/api/wallet/withdrawal-requests"],
    queryFn: async () => {
      const res = await fetch("/api/wallet/withdrawal-requests", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { mutate: submitRequest, isPending: isSubmitting } = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/wallet/withdrawal-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to submit request");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/withdrawal-requests"] });
      setRequestOpen(false);
      setReqAmount(""); setReqBankCode(""); setReqAccountNumber(""); setReqAccountName(""); setReqReason("");
      toast({ title: "Request Submitted", description: "An admin will review and process your withdrawal shortly." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const selectedReqBank = NIGERIAN_BANKS.find((b) => b.code === reqBankCode);
  const balance = Number(wallet?.balance || 0);
  const heldBalance = Number(wallet?.heldBalance || 0);

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-display font-bold text-foreground mb-8" data-testid="text-wallet-title">My Wallet</h1>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Available balance */}
          <div className="bg-primary rounded-3xl p-8 text-white shadow-2xl shadow-primary/30 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <WalletIcon className="w-32 h-32" />
            </div>

            <p className="text-primary-foreground/80 font-medium mb-2">Available Balance</p>
            <h2 className="text-4xl font-bold font-display tracking-tight mb-8" data-testid="text-wallet-balance">
              ₦{balance.toLocaleString()}
            </h2>

            <div className="flex gap-4 relative z-10 flex-wrap">
              <FundWalletModal />
              <WithdrawModal balance={balance} />
            </div>
          </div>

          {/* Held for pending jobs */}
          <div className="bg-muted rounded-3xl p-8 relative overflow-hidden border border-border">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Lock className="w-32 h-32" />
            </div>

            <p className="text-muted-foreground font-medium mb-2">Held for Pending Jobs</p>
            <h2 className="text-4xl font-bold font-display tracking-tight mb-8 text-foreground" data-testid="text-wallet-held-balance">
              ₦{heldBalance.toLocaleString()}
            </h2>

            <button
              onClick={() => setHeldOpen((v) => !v)}
              className="flex items-center gap-2 text-sm font-medium text-foreground relative z-10"
              data-testid="button-toggle-held-breakdown"
              disabled={heldBalance === 0}
            >
              {heldBalance === 0 ? (
                <span className="text-muted-foreground">No funds currently held</span>
              ) : (
                <>
                  View breakdown
                  <ChevronDown className={`w-4 h-4 transition-transform ${heldOpen ? "rotate-180" : ""}`} />
                </>
              )}
            </button>

            {heldOpen && heldBalance > 0 && (
              <div className="mt-4 space-y-2 relative z-10">
                {isHeldLoading ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin" /></div>
                ) : heldJobs?.jobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing held right now.</p>
                ) : (
                  heldJobs?.jobs.map((j) => (
                    <div key={j.jobId} className="flex items-center justify-between gap-2 p-3 rounded-xl bg-background/60 text-sm" data-testid={`row-held-job-${j.jobId}`}>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{j.jobTitle}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(j.createdAt), "PP")}</p>
                      </div>
                      <span className="font-bold font-mono text-foreground flex-shrink-0">₦{Number(j.amount).toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <Card className="md:col-span-2 rounded-3xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="font-display">Transaction History</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div>
              ) : wallet?.transactions.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground" data-testid="text-no-transactions">No transactions yet.</div>
              ) : (
                <div className="space-y-4">
                  {wallet?.transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between gap-4 p-4 rounded-xl bg-muted/20 transition-colors" data-testid={`row-transaction-${tx.id}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                          ["deposit", "job_earning"].includes(tx.type) ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                        }`}>
                          {["deposit", "job_earning"].includes(tx.type) ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="font-bold capitalize text-foreground">{tx.type.replace("_", " ")}</p>
                          {(tx as any).bankName && <p className="text-xs text-muted-foreground">{(tx as any).bankName}</p>}
                          <p className="text-xs text-muted-foreground">{format(new Date(tx.createdAt || Date.now()), "PP p")}</p>
                        </div>
                      </div>
                      <span className={`font-bold font-mono flex-shrink-0 ${
                        ["deposit", "job_earning"].includes(tx.type) ? "text-green-600 dark:text-green-400" : "text-foreground"
                      }`}>
                        {["deposit", "job_earning"].includes(tx.type) ? "+" : "-"}₦{Math.abs(Number(tx.amount)).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Withdrawal Request Section (admin-mediated, new bank account) */}
          <Card className="md:col-span-2 rounded-3xl border border-border shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="font-display flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  Request Withdrawal to New Account
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Want to withdraw to a different bank account? Submit a request and an admin will process it for you.
                </p>
              </div>
              <Button onClick={() => setRequestOpen(true)} className="rounded-xl flex-shrink-0" data-testid="button-open-request">
                <ArrowDownToLine className="w-4 h-4 mr-2" />
                New Request
              </Button>
            </CardHeader>

            {myRequests.length > 0 && (
              <CardContent>
                <div className="space-y-3">
                  {myRequests.map((req: any) => (
                    <div key={req.id} className="flex items-center justify-between gap-4 p-4 rounded-xl bg-muted/20" data-testid={`row-request-${req.id}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {req.status === "pending" && <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 text-xs"><Clock className="w-3 h-3 mr-1" />Pending review</Badge>}
                          {req.status === "approved" && <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 text-xs"><CheckCircle2 className="w-3 h-3 mr-1" />Approved</Badge>}
                          {req.status === "rejected" && <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 text-xs"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>}
                          <span className="text-xs text-muted-foreground">{format(new Date(req.createdAt), "PP")}</span>
                        </div>
                        <p className="text-sm font-medium text-foreground">{req.bankName} — {req.accountNumber}</p>
                        {req.adminNote && <p className="text-xs text-muted-foreground mt-1">Admin: {req.adminNote}</p>}
                      </div>
                      <span className="font-bold font-mono text-primary flex-shrink-0">₦{parseFloat(req.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      </main>

      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Request Withdrawal to New Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              Fill in the details of the bank account you want to receive funds in. An admin will review and process your request.
            </p>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Select Bank
              </label>
              <Select value={reqBankCode} onValueChange={setReqBankCode}>
                <SelectTrigger className="rounded-xl" data-testid="select-req-bank">
                  <SelectValue placeholder="Choose your bank" />
                </SelectTrigger>
                <SelectContent>
                  {NIGERIAN_BANKS.map((bank) => (
                    <SelectItem key={bank.code} value={bank.code}>{bank.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Account Number</label>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={10}
                placeholder="10-digit account number"
                value={reqAccountNumber}
                onChange={(e) => setReqAccountNumber(e.target.value.replace(/\D/g, ""))}
                className="rounded-xl"
                data-testid="input-req-account-number"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Account Name (optional)</label>
              <Input
                type="text"
                placeholder="e.g. John Doe"
                value={reqAccountName}
                onChange={(e) => setReqAccountName(e.target.value)}
                className="rounded-xl"
                data-testid="input-req-account-name"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Amount (₦)</label>
              <Input
                type="number"
                placeholder="0.00"
                value={reqAmount}
                onChange={(e) => setReqAmount(e.target.value)}
                className="rounded-xl text-lg"
                data-testid="input-req-amount"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Reason / Note (optional)</label>
              <Textarea
                placeholder="e.g. I want to change my withdrawal account..."
                value={reqReason}
                onChange={(e) => setReqReason(e.target.value)}
                className="rounded-xl resize-none"
                rows={2}
                data-testid="input-req-reason"
              />
            </div>

            {reqBankCode && reqAccountNumber && reqAmount && (
              <Card className="bg-muted/50 border-dashed">
                <CardContent className="p-4 space-y-1 text-sm">
                  <p className="font-semibold">Request Summary</p>
                  <div className="flex justify-between"><span className="text-muted-foreground">Bank</span><span className="font-medium">{selectedReqBank?.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Account</span><span className="font-medium">{reqAccountNumber}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-bold text-primary">₦{Number(reqAmount).toLocaleString()}</span></div>
                </CardContent>
              </Card>
            )}

            <Button
              className="w-full rounded-xl font-bold"
              disabled={isSubmitting || !reqBankCode || !reqAccountNumber || !reqAmount}
              onClick={() => submitRequest({
                amount: Number(reqAmount),
                bankName: selectedReqBank?.name || reqBankCode,
                bankCode: reqBankCode,
                accountNumber: reqAccountNumber,
                accountName: reqAccountName || undefined,
                reason: reqReason || undefined,
              })}
              data-testid="button-submit-request"
            >
              {isSubmitting ? <Loader2 className="animate-spin" /> : "Submit Request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}