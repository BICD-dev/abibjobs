import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wallet, Clock, Users, Check, AlertCircle, CreditCard, Building2, TrendingUp, ArrowDownToLine, CheckCircle2, XCircle, User } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface PayrollAdmin {
  adminId: number;
  name: string;
  email: string;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  bankCode: string | null;
  totalSeconds: number;
  isActive: boolean;
}

interface PaymentRecord {
  id: number;
  adminId: number;
  amount: string;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  status: string;
  note: string | null;
  createdAt: string;
  adminName?: string;
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0 && minutes === 0) return "0m";
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatNaira(amount: string | number) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(num);
}

interface AdminWithdrawal {
  id: number;
  adminId: number;
  amount: string;
  bankName: string;
  bankCode: string | null;
  accountNumber: string;
  accountName: string | null;
  status: string;
  adminNote: string | null;
  processedBy: number | null;
  processedAt: string | null;
  createdAt: string;
  adminName?: string;
}

function WithdrawalStatusBadge({ status }: { status: string }) {
  if (status === 'pending') return <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
  if (status === 'approved') return <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400"><CheckCircle2 className="w-3 h-3 mr-1" />Approved</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
}

export default function AdminPayroll() {
  const { isOwner, isLoading: authLoading } = useAdminAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedAdmins, setSelectedAdmins] = useState<Set<number>>(new Set());
  const [payAmounts, setPayAmounts] = useState<Record<number, string>>({});
  const [payNote, setPayNote] = useState("");
  const [paymentSource, setPaymentSource] = useState<string>("platform_earnings");
  const [withdrawalStatusFilter, setWithdrawalStatusFilter] = useState("pending");
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<AdminWithdrawal | null>(null);
  const [withdrawalAction, setWithdrawalAction] = useState<'approved' | 'rejected' | null>(null);
  const [withdrawalNote, setWithdrawalNote] = useState("");
  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false);

  const { data: admins, isLoading } = useQuery<PayrollAdmin[]>({
    queryKey: ["/api/admin/payroll"],
    queryFn: async () => {
      const res = await fetch("/api/admin/payroll", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!isOwner,
  });

  const { data: earningsData } = useQuery<{ balance: string }>({
    queryKey: ["/api/admin/earnings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/earnings", { credentials: "include" });
      if (!res.ok) return { balance: "0" };
      return res.json();
    },
    enabled: !!isOwner,
  });

  const platformBalance = parseFloat(earningsData?.balance || "0");

  const { data: paymentHistory, isLoading: historyLoading } = useQuery<PaymentRecord[]>({
    queryKey: ["/api/admin/payroll/history"],
    queryFn: async () => {
      const res = await fetch("/api/admin/payroll/history", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!isOwner,
  });

  const payMutation = useMutation({
    mutationFn: async (payments: { adminId: number; amount: string; note?: string }[]) => {
      const res = await fetch("/api/admin/payroll/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payments, paymentSource }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payroll/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/earnings"] });
      toast({ title: "Payment Processed", description: `Successfully paid ${data.paid} admin(s).` });
      setSelectedAdmins(new Set());
      setPayAmounts({});
      setPayNote("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const { data: adminWithdrawals = [], isLoading: withdrawalsLoading } = useQuery<AdminWithdrawal[]>({
    queryKey: ["/api/admin/admin-withdrawals", withdrawalStatusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/admin-withdrawals?status=${withdrawalStatusFilter}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!isOwner,
    refetchInterval: 15000,
  });

  const processWithdrawalMutation = useMutation({
    mutationFn: async ({ id, action, adminNote }: { id: number; action: string; adminNote: string }) => {
      const res = await fetch(`/api/admin/admin-withdrawals/${id}/process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, adminNote }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to process request");
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/admin-withdrawals"] });
      setWithdrawalDialogOpen(false);
      setSelectedWithdrawal(null);
      setWithdrawalNote("");
      toast({
        title: vars.action === 'approved' ? "Withdrawal Approved" : "Withdrawal Rejected",
        description: vars.action === 'approved'
          ? "The admin has been notified that their payout was approved."
          : "The amount was returned to the admin's wallet and they've been notified.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const openWithdrawalDialog = (w: AdminWithdrawal, act: 'approved' | 'rejected') => {
    setSelectedWithdrawal(w);
    setWithdrawalAction(act);
    setWithdrawalNote("");
    setWithdrawalDialogOpen(true);
  };

  const handleConfirmWithdrawal = () => {
    if (!selectedWithdrawal || !withdrawalAction) return;
    processWithdrawalMutation.mutate({ id: selectedWithdrawal.id, action: withdrawalAction, adminNote: withdrawalNote });
  };

  const activeAdmins = admins?.filter(a => a.isActive) || [];

  const toggleAdmin = (adminId: number) => {
    const next = new Set(selectedAdmins);
    if (next.has(adminId)) {
      next.delete(adminId);
    } else {
      next.add(adminId);
    }
    setSelectedAdmins(next);
  };

  const toggleAll = () => {
    if (selectedAdmins.size === activeAdmins.length) {
      setSelectedAdmins(new Set());
    } else {
      setSelectedAdmins(new Set(activeAdmins.map(a => a.adminId)));
    }
  };

  const handlePay = () => {
    const payments = Array.from(selectedAdmins)
      .filter(id => {
        const amount = payAmounts[id];
        return amount && parseFloat(amount) > 0;
      })
      .map(id => ({
        adminId: id,
        amount: payAmounts[id],
        note: payNote || undefined,
      }));

    if (payments.length === 0) {
      toast({ title: "No Valid Payments", description: "Enter an amount for at least one selected admin.", variant: "destructive" });
      return;
    }

    payMutation.mutate(payments);
  };

  const setAllAmounts = (amount: string) => {
    const newAmounts: Record<number, string> = {};
    selectedAdmins.forEach(id => {
      newAmounts[id] = amount;
    });
    setPayAmounts(prev => ({ ...prev, ...newAmounts }));
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <Wallet className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2 text-foreground">Access Denied</h2>
          <p className="text-muted-foreground">Owner access required.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-payroll-title">Admin Payroll</h1>
            <p className="text-sm text-muted-foreground">Pay your admin staff</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            <Card data-testid="card-platform-balance">
              <CardContent className="p-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-muted-foreground">Platform Earnings Balance</p>
                    <p className="text-2xl font-bold text-foreground mt-1" data-testid="text-platform-balance">
                      {formatNaira(platformBalance)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Available for salary payments</p>
                  </div>
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center bg-green-500/10 text-green-500">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="card-admin-list">
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                      <Users className="w-4 h-4 text-blue-500" />
                    </div>
                    <CardTitle className="text-lg">Admin Staff</CardTitle>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={toggleAll}
                      data-testid="button-select-all"
                    >
                      {selectedAdmins.size === activeAdmins.length && activeAdmins.length > 0 ? "Deselect All" : "Select All"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {activeAdmins.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No staff admins found</p>
                ) : (
                  <div className="space-y-3">
                    {activeAdmins.map((admin) => (
                      <div
                        key={admin.adminId}
                        className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${
                          selectedAdmins.has(admin.adminId)
                            ? "border-primary/30 bg-primary/5"
                            : "border-border"
                        }`}
                        data-testid={`row-admin-${admin.adminId}`}
                      >
                        <Checkbox
                          checked={selectedAdmins.has(admin.adminId)}
                          onCheckedChange={() => toggleAdmin(admin.adminId)}
                          className="mt-1"
                          data-testid={`checkbox-admin-${admin.adminId}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div>
                              <p className="font-medium text-foreground" data-testid={`text-admin-name-${admin.adminId}`}>{admin.name}</p>
                              <p className="text-xs text-muted-foreground">{admin.email}</p>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Clock className="w-3.5 h-3.5" />
                              <span data-testid={`text-admin-hours-${admin.adminId}`}>{formatDuration(admin.totalSeconds)}</span>
                            </div>
                          </div>

                          <div className="mt-2 flex flex-col gap-1">
                            {admin.bankName ? (
                              <div className="p-2 rounded-lg bg-muted/30 space-y-0.5" data-testid={`card-admin-bank-${admin.adminId}`}>
                                <div className="flex items-center gap-1">
                                  <Building2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                                  <span className="text-xs font-medium text-foreground">{admin.bankName}</span>
                                </div>
                                <p className="text-xs text-muted-foreground pl-4">{admin.accountNumber}</p>
                                {admin.accountName && (
                                  <p className="text-xs text-muted-foreground pl-4">{admin.accountName}</p>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-orange-600 bg-orange-500/10 px-2 py-0.5 rounded-md">
                                <AlertCircle className="w-3 h-3" />
                                No bank account set up
                              </span>
                            )}
                          </div>

                          {selectedAdmins.has(admin.adminId) && (
                            <div className="mt-3">
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Amount to Pay</label>
                              <Input
                                type="number"
                                placeholder="Enter amount"
                                value={payAmounts[admin.adminId] || ""}
                                onChange={(e) => setPayAmounts(prev => ({ ...prev, [admin.adminId]: e.target.value }))}
                                min="0"
                                step="100"
                                data-testid={`input-pay-amount-${admin.adminId}`}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {selectedAdmins.size > 0 && (
                  <div className="mt-6 space-y-4 pt-4 border-t">
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="text-sm font-medium text-foreground">Set same amount for all selected:</label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          placeholder="Amount"
                          className="w-40"
                          onChange={(e) => setAllAmounts(e.target.value)}
                          min="0"
                          step="100"
                          data-testid="input-bulk-amount"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Payment Source</label>
                      <Select value={paymentSource} onValueChange={setPaymentSource}>
                        <SelectTrigger data-testid="select-payment-source">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="platform_earnings">
                            Platform Earnings ({formatNaira(platformBalance)})
                          </SelectItem>
                          <SelectItem value="external_bank">
                            External Bank (Manual)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {paymentSource === 'platform_earnings' && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Deducted from your platform earnings and added to each admin's in-app wallet. They withdraw it to their bank from their profile.
                        </p>
                      )}
                      {paymentSource === 'external_bank' && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Added to each admin's in-app wallet without touching your platform earnings (you fund it yourself). Don't also transfer to their bank — they withdraw from their wallet.
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Payment Note (optional)</label>
                      <Input
                        value={payNote}
                        onChange={(e) => setPayNote(e.target.value)}
                        placeholder="e.g., January salary"
                        data-testid="input-pay-note"
                      />
                    </div>

                    <Button
                      onClick={handlePay}
                      disabled={payMutation.isPending}
                      className="w-full"
                      data-testid="button-process-payment"
                    >
                      {payMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Wallet className="w-4 h-4 mr-2" />
                      )}
                      Pay {selectedAdmins.size} Admin{selectedAdmins.size !== 1 ? "s" : ""}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-admin-withdrawals">
              <CardHeader>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                      <ArrowDownToLine className="w-4 h-4 text-amber-500" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">Admin Withdrawal Requests</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Admins withdrawing salary from their wallet to their bank</p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs value={withdrawalStatusFilter} onValueChange={setWithdrawalStatusFilter} className="mb-4">
                  <TabsList className="rounded-xl">
                    <TabsTrigger value="pending" data-testid="tab-wd-pending">Pending</TabsTrigger>
                    <TabsTrigger value="approved" data-testid="tab-wd-approved">Approved</TabsTrigger>
                    <TabsTrigger value="rejected" data-testid="tab-wd-rejected">Rejected</TabsTrigger>
                  </TabsList>
                </Tabs>

                {withdrawalsLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : adminWithdrawals.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No {withdrawalStatusFilter} withdrawal requests</p>
                ) : (
                  <div className="space-y-3">
                    {adminWithdrawals.map((w) => (
                      <div key={w.id} className="p-4 rounded-xl border border-border" data-testid={`row-admin-withdrawal-${w.id}`}>
                        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-3 flex-wrap">
                              <WithdrawalStatusBadge status={w.status} />
                              <span className="text-xs text-muted-foreground">{format(new Date(w.createdAt), "MMM d, yyyy p")}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                              <span className="font-semibold text-foreground" data-testid={`text-wd-admin-${w.id}`}>{w.adminName || `Admin #${w.adminId}`}</span>
                            </div>
                            <div className="flex items-start gap-2">
                              <Building2 className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="font-medium text-foreground">{w.bankName}</p>
                                <p className="text-sm text-muted-foreground">{w.accountNumber}{w.accountName ? ` — ${w.accountName}` : ''}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">Amount:</span>
                              <span className="font-bold text-primary text-lg" data-testid={`text-wd-amount-${w.id}`}>{formatNaira(w.amount)}</span>
                            </div>
                            {w.adminNote && (
                              <div className="bg-muted/50 rounded-lg p-2 text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">Note: </span>{w.adminNote}
                              </div>
                            )}
                            {w.processedAt && (
                              <p className="text-xs text-muted-foreground">Processed: {format(new Date(w.processedAt), "MMM d, yyyy p")}</p>
                            )}
                          </div>

                          {w.status === 'pending' && (
                            <div className="flex flex-col gap-2 flex-shrink-0">
                              <Button
                                size="sm"
                                className="rounded-xl bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => openWithdrawalDialog(w, 'approved')}
                                data-testid={`button-wd-approve-${w.id}`}
                              >
                                <CheckCircle2 className="w-4 h-4 mr-1" />
                                Approve & Pay
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
                                onClick={() => openWithdrawalDialog(w, 'rejected')}
                                data-testid={`button-wd-reject-${w.id}`}
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Reject
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-payment-history">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                    <CreditCard className="w-4 h-4 text-purple-500" />
                  </div>
                  <CardTitle className="text-lg">Payment History</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {historyLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : paymentHistory && paymentHistory.length > 0 ? (
                  <div className="space-y-2">
                    {paymentHistory.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-4 p-3 rounded-xl bg-muted/20" data-testid={`row-history-${p.id}`}>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{p.adminName || `Admin #${p.adminId}`}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatNaira(p.amount)}
                            {p.bankName ? ` · ${p.bankName}` : ""}
                            {p.note ? ` · ${p.note}` : ""}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="text-xs font-medium text-green-600 bg-green-500/10 px-2 py-1 rounded-md">{p.status}</span>
                          <p className="text-xs text-muted-foreground mt-1">
                            {p.createdAt ? format(new Date(p.createdAt), "MMM d, yyyy") : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">No payments made yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>

      <Dialog open={withdrawalDialogOpen} onOpenChange={setWithdrawalDialogOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {withdrawalAction === 'approved' ? 'Approve Withdrawal' : 'Reject Withdrawal'}
            </DialogTitle>
          </DialogHeader>

          {selectedWithdrawal && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Admin</span>
                  <span className="font-medium">{selectedWithdrawal.adminName || `Admin #${selectedWithdrawal.adminId}`}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-bold text-primary">{formatNaira(selectedWithdrawal.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">To</span>
                  <span className="font-medium">{selectedWithdrawal.bankName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Account</span>
                  <span className="font-medium">{selectedWithdrawal.accountNumber}</span>
                </div>
              </div>

              {withdrawalAction === 'approved' ? (
                <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-xl text-sm text-green-700 dark:text-green-400">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p>The amount was already held from the admin's wallet. Approving confirms you've sent it to their bank account.</p>
                </div>
              ) : (
                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl text-sm text-amber-700 dark:text-amber-400">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p>Rejecting returns {formatNaira(selectedWithdrawal.amount)} back to the admin's wallet.</p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Note to admin (optional)</label>
                <Textarea
                  placeholder="Add a note explaining the decision..."
                  value={withdrawalNote}
                  onChange={(e) => setWithdrawalNote(e.target.value)}
                  className="rounded-xl resize-none"
                  rows={3}
                  data-testid="input-wd-note"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => setWithdrawalDialogOpen(false)}
                  data-testid="button-wd-cancel"
                >
                  Cancel
                </Button>
                <Button
                  className={`flex-1 rounded-xl text-white ${withdrawalAction === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-destructive hover:bg-destructive/90'}`}
                  onClick={handleConfirmWithdrawal}
                  disabled={processWithdrawalMutation.isPending}
                  data-testid="button-wd-confirm"
                >
                  {processWithdrawalMutation.isPending ? <Loader2 className="animate-spin" /> : withdrawalAction === 'approved' ? 'Confirm & Pay' : 'Reject Request'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
