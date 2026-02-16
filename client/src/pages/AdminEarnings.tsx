import { useState } from "react";
import { useAdminEarnings, useAdminWithdraw, useUpdateAdminBank } from "@/hooks/use-admin";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowUpRight, ArrowDownLeft, TrendingUp, Building2, Settings, Banknote } from "lucide-react";
import { format } from "date-fns";
import { NIGERIAN_BANKS } from "@/lib/nigerian-banks";

export default function AdminEarnings() {
  const { data: earnings, isLoading } = useAdminEarnings();
  const { mutate: withdraw, isPending: isWithdrawing } = useAdminWithdraw();
  const { mutate: updateBank, isPending: isUpdatingBank } = useUpdateAdminBank();

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [bankSettingsOpen, setBankSettingsOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");

  const selectedBank = NIGERIAN_BANKS.find(b => b.code === bankCode);

  const resetForm = () => {
    setAmount("");
    setBankCode("");
    setAccountNumber("");
    setAccountName("");
  };

  const handleWithdraw = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(amount);
    if (!val || !bankCode || !accountNumber) return;
    withdraw({
      amount: val,
      bankCode,
      bankName: selectedBank?.name || "",
      accountNumber,
      accountName: accountName || undefined,
    }, { onSuccess: () => { setWithdrawOpen(false); resetForm(); }});
  };

  const handleUpdateBank = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankCode || !accountNumber) return;
    updateBank({
      bankCode,
      bankName: selectedBank?.name || "",
      accountNumber,
      accountName: accountName || undefined,
    }, { onSuccess: () => { setBankSettingsOpen(false); resetForm(); }});
  };

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const totalEarned = earnings?.transactions
    ?.filter((t: any) => t.type === 'fee_earned')
    ?.reduce((sum: number, t: any) => sum + Math.abs(parseFloat(t.amount)), 0) || 0;

  const totalWithdrawn = earnings?.transactions
    ?.filter((t: any) => t.type === 'withdrawal')
    ?.reduce((sum: number, t: any) => sum + Math.abs(parseFloat(t.amount)), 0) || 0;

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center gap-3 mb-8">
          <TrendingUp className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-admin-title">Platform Earnings</h1>
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <Card className="rounded-2xl">
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground mb-1">Available Balance</p>
              <p className="text-3xl font-bold font-display text-primary" data-testid="text-admin-balance">
                ₦{Number(earnings?.balance || 0).toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground mb-1">Total Earned (22% fees)</p>
              <p className="text-3xl font-bold font-display text-green-600 dark:text-green-400" data-testid="text-total-earned">
                ₦{totalEarned.toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground mb-1">Total Withdrawn</p>
              <p className="text-3xl font-bold font-display text-foreground" data-testid="text-total-withdrawn">
                ₦{totalWithdrawn.toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </div>

        {earnings?.bankName && (
          <Card className="rounded-2xl mb-6 border-primary/20">
            <CardContent className="p-6 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Default Bank Account</p>
                  <p className="font-bold text-foreground" data-testid="text-default-bank">{earnings.bankName}</p>
                  <p className="text-sm text-muted-foreground">{earnings.accountNumber} {earnings.accountName ? `- ${earnings.accountName}` : ''}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-3 mb-8 flex-wrap">
          <Dialog open={withdrawOpen} onOpenChange={(v) => { setWithdrawOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="rounded-xl font-bold" data-testid="button-admin-withdraw">
                <Banknote className="mr-2 h-5 w-5" /> Withdraw to Bank
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle data-testid="text-withdraw-dialog-title">Withdraw Earnings to Bank</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleWithdraw} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Select Bank
                  </label>
                  <Select value={bankCode} onValueChange={setBankCode}>
                    <SelectTrigger className="rounded-xl" data-testid="select-admin-bank">
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
                    type="text" inputMode="numeric" pattern="[0-9]*" maxLength={10}
                    placeholder="Enter 10-digit account number"
                    value={accountNumber} onChange={e => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                    className="rounded-xl" data-testid="input-admin-account"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Account Name (optional)</label>
                  <Input 
                    type="text" placeholder="e.g. John Doe"
                    value={accountName} onChange={e => setAccountName(e.target.value)}
                    className="rounded-xl" data-testid="input-admin-account-name"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Amount (₦)</label>
                  <Input 
                    type="number" placeholder="0.00"
                    value={amount} onChange={e => setAmount(e.target.value)}
                    className="rounded-xl text-lg" data-testid="input-admin-amount"
                  />
                </div>
                {bankCode && accountNumber && amount && (
                  <Card className="bg-muted/50 border-dashed">
                    <CardContent className="p-4 space-y-1 text-sm">
                      <p className="font-semibold text-foreground">Withdrawal Summary</p>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Bank</span>
                        <span className="font-medium text-foreground">{selectedBank?.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Account</span>
                        <span className="font-medium text-foreground">{accountNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Amount</span>
                        <span className="font-bold text-primary">₦{Number(amount).toLocaleString()}</span>
                      </div>
                    </CardContent>
                  </Card>
                )}
                <Button 
                  type="submit" className="w-full rounded-xl font-bold"
                  disabled={isWithdrawing || !bankCode || !accountNumber || !amount}
                  data-testid="button-confirm-admin-withdraw"
                >
                  {isWithdrawing ? <Loader2 className="animate-spin" /> : "Confirm Withdrawal"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={bankSettingsOpen} onOpenChange={(v) => { setBankSettingsOpen(v); if (!v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="rounded-xl font-bold" data-testid="button-bank-settings">
                <Settings className="mr-2 h-4 w-4" /> Bank Settings
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Set Default Bank Account</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleUpdateBank} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Select Bank
                  </label>
                  <Select value={bankCode} onValueChange={setBankCode}>
                    <SelectTrigger className="rounded-xl">
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
                    type="text" inputMode="numeric" pattern="[0-9]*" maxLength={10}
                    placeholder="Enter 10-digit account number"
                    value={accountNumber} onChange={e => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Account Name (optional)</label>
                  <Input 
                    type="text" placeholder="e.g. John Doe"
                    value={accountName} onChange={e => setAccountName(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <Button 
                  type="submit" className="w-full rounded-xl font-bold"
                  disabled={isUpdatingBank || !bankCode || !accountNumber}
                >
                  {isUpdatingBank ? <Loader2 className="animate-spin" /> : "Save Bank Details"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="rounded-2xl border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="font-display">Earnings History</CardTitle>
          </CardHeader>
          <CardContent>
            {!earnings?.transactions || earnings.transactions.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground" data-testid="text-no-earnings">
                No earnings yet. You'll see your 22% fees from completed jobs here.
              </div>
            ) : (
              <div className="space-y-4">
                {earnings.transactions.map((tx: any) => (
                  <div key={tx.id} className="flex items-center justify-between gap-4 p-4 rounded-xl bg-muted/20 transition-colors" data-testid={`row-earning-${tx.id}`}>
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        tx.type === 'fee_earned'
                          ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                      }`}>
                        {tx.type === 'fee_earned' ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="font-bold text-foreground">
                          {tx.type === 'fee_earned' ? '22% Fee Earned' : 'Withdrawal'}
                        </p>
                        {tx.jobTitle && (
                          <p className="text-xs text-muted-foreground">Job: {tx.jobTitle}</p>
                        )}
                        {tx.bankName && (
                          <p className="text-xs text-muted-foreground">{tx.bankName} - {tx.accountNumber}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{format(new Date(tx.createdAt || Date.now()), "PP p")}</p>
                      </div>
                    </div>
                    <span className={`font-bold font-mono flex-shrink-0 ${
                      tx.type === 'fee_earned' ? "text-green-600 dark:text-green-400" : "text-foreground"
                    }`}>
                      {tx.type === 'fee_earned' ? '+' : '-'}₦{Math.abs(Number(tx.amount)).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
