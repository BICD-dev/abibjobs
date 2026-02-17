import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Wallet, Clock, Users, Check, AlertCircle, CreditCard } from "lucide-react";
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

export default function AdminPayroll() {
  const { isOwner, isLoading: authLoading } = useAdminAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedAdmins, setSelectedAdmins] = useState<Set<number>>(new Set());
  const [payAmounts, setPayAmounts] = useState<Record<number, string>>({});
  const [payNote, setPayNote] = useState("");

  const { data: admins, isLoading } = useQuery<PayrollAdmin[]>({
    queryKey: ["/api/admin/payroll"],
    queryFn: async () => {
      const res = await fetch("/api/admin/payroll", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!isOwner,
  });

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
        body: JSON.stringify({ payments }),
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
      toast({ title: "Payment Processed", description: `Successfully paid ${data.paid} admin(s).` });
      setSelectedAdmins(new Set());
      setPayAmounts({});
      setPayNote("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

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

                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            {admin.bankName ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-500/10 px-2 py-0.5 rounded-md">
                                <Check className="w-3 h-3" />
                                {admin.bankName} &middot; {admin.accountNumber}
                              </span>
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
    </div>
  );
}
