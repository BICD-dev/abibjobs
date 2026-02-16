import { useState } from "react";
import { useAdminEarnings, useAdminWithdraw, useUpdateAdminBank } from "@/hooks/use-admin";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowUpRight, ArrowDownLeft, TrendingUp, Building2, Settings, Banknote, Lock, Key } from "lucide-react";
import { format } from "date-fns";
import { NIGERIAN_BANKS } from "@/lib/nigerian-banks";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function AdminEarnings() {
  const { data: earnings, isLoading, isError, error } = useAdminEarnings();
  const { mutate: withdraw, isPending: isWithdrawing } = useAdminWithdraw();
  const { mutate: updateBank, isPending: isUpdatingBank } = useUpdateAdminBank();

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [bankSettingsOpen, setBankSettingsOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [passcode, setPasscode] = useState("");

  const selectedBank = NIGERIAN_BANKS.find(b => b.code === bankCode);

  const resetForm = () => {
    setAmount("");
    setBankCode("");
    setAccountNumber("");
    setAccountName("");
    setPasscode("");
  };

  const handleWithdraw = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(amount);
    if (!val || !bankCode || !accountNumber || !passcode || passcode.length !== 6) return;
    withdraw({
      amount: val,
      bankCode,
      bankName: selectedBank?.name || "",
      accountNumber,
      accountName: accountName || undefined,
      passcode,
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

  if (isError) return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2 text-foreground">Access Denied</h2>
        <p className="text-muted-foreground">You don't have admin access to view platform earnings.</p>
      </div>
    </div>
  );

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

        <PasscodeSetupCard />

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
                <div className="space-y-2">
                  <label className="text-sm font-medium">6-Digit Passcode</label>
                  <Input 
                    type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                    placeholder="Enter your 6-digit passcode"
                    value={passcode} onChange={e => setPasscode(e.target.value.replace(/\D/g, ''))}
                    className="rounded-xl text-center text-lg tracking-widest" data-testid="input-admin-passcode"
                  />
                  <p className="text-xs text-muted-foreground">Required for all withdrawals</p>
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
                  disabled={isWithdrawing || !bankCode || !accountNumber || !amount || passcode.length !== 6}
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

function PasscodeSetupCard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newPasscode, setNewPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);

  const { data: passcodeStatus } = useQuery<{ hasPasscode: boolean; ownerEmail: string }>({
    queryKey: ['/api/owner/passcode/status'],
    queryFn: async () => {
      const res = await fetch('/api/owner/passcode/status', { credentials: 'include' });
      if (!res.ok) return { hasPasscode: false, ownerEmail: '' };
      return res.json();
    },
  });

  const setupMutation = useMutation({
    mutationFn: async (passcode: string) => {
      const res = await fetch('/api/owner/passcode/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/owner/passcode/status'] });
      toast({ title: "Passcode Set", description: "Your 6-digit passcode has been saved." });
      setSetupOpen(false);
      setNewPasscode("");
      setConfirmPasscode("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSetup = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPasscode.length !== 6 || !/^\d{6}$/.test(newPasscode)) {
      toast({ title: "Error", description: "Passcode must be exactly 6 digits.", variant: "destructive" });
      return;
    }
    if (newPasscode !== confirmPasscode) {
      toast({ title: "Error", description: "Passcodes don't match.", variant: "destructive" });
      return;
    }
    setupMutation.mutate(newPasscode);
  };

  return (
    <Card className="rounded-2xl mb-6 border-border" data-testid="card-passcode-setup">
      <CardContent className="p-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Lock className="w-5 h-5 text-primary" />
          <div>
            <p className="text-sm text-muted-foreground">Withdrawal Passcode</p>
            <p className="font-bold text-foreground" data-testid="text-passcode-status">
              {passcodeStatus?.hasPasscode ? "Passcode is set" : "No passcode set"}
            </p>
          </div>
        </div>
        <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="rounded-xl" data-testid="button-setup-passcode">
              <Key className="w-4 h-4 mr-2" /> {passcodeStatus?.hasPasscode ? "Change Passcode" : "Set Passcode"}
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle>{passcodeStatus?.hasPasscode ? "Change" : "Set Up"} 6-Digit Passcode</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSetup} className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">New 6-Digit Passcode</label>
                <Input
                  type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                  placeholder="000000"
                  value={newPasscode}
                  onChange={e => setNewPasscode(e.target.value.replace(/\D/g, ''))}
                  className="rounded-xl text-center text-lg tracking-widest"
                  data-testid="input-new-passcode"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Confirm Passcode</label>
                <Input
                  type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                  placeholder="000000"
                  value={confirmPasscode}
                  onChange={e => setConfirmPasscode(e.target.value.replace(/\D/g, ''))}
                  className="rounded-xl text-center text-lg tracking-widest"
                  data-testid="input-confirm-passcode"
                />
              </div>
              <Button
                type="submit"
                className="w-full rounded-xl font-bold"
                disabled={setupMutation.isPending || newPasscode.length !== 6 || confirmPasscode.length !== 6}
                data-testid="button-save-passcode"
              >
                {setupMutation.isPending ? <Loader2 className="animate-spin" /> : "Save Passcode"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
