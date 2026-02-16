import { useState } from "react";
import { useWallet, useDeposit, useWithdraw } from "@/hooks/use-wallet";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, ArrowUpRight, ArrowDownLeft, Wallet as WalletIcon, Building2 } from "lucide-react";
import { format } from "date-fns";
import { NIGERIAN_BANKS } from "@/lib/nigerian-banks";

export default function Wallet() {
  const { data: wallet, isLoading } = useWallet();
  const { mutate: deposit, isPending: isDepositing } = useDeposit();
  const { mutate: withdraw, isPending: isWithdrawing } = useWithdraw();
  
  const [amount, setAmount] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [action, setAction] = useState<"deposit" | "withdraw">("deposit");
  const [open, setOpen] = useState(false);

  const selectedBank = NIGERIAN_BANKS.find(b => b.code === bankCode);

  const resetForm = () => {
    setAmount("");
    setBankCode("");
    setAccountNumber("");
    setAccountName("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(amount);
    if (!val || !bankCode || !accountNumber) return;

    const bankInfo = {
      amount: val,
      bankCode,
      bankName: selectedBank?.name || "",
      accountNumber,
      accountName: accountName || undefined,
    };

    if (action === "deposit") {
      deposit(bankInfo, { onSuccess: () => { setOpen(false); resetForm(); }});
    } else {
      withdraw(bankInfo, { onSuccess: () => { setOpen(false); resetForm(); }});
    }
  };

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-display font-bold text-foreground mb-8" data-testid="text-wallet-title">My Wallet</h1>

        <div className="grid gap-8 md:grid-cols-2">
          <div className="bg-primary rounded-3xl p-8 text-white shadow-2xl shadow-primary/30 relative overflow-hidden md:col-span-2">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <WalletIcon className="w-32 h-32" />
            </div>
            
            <p className="text-primary-foreground/80 font-medium mb-2">Available Balance</p>
            <h2 className="text-5xl font-bold font-display tracking-tight mb-8" data-testid="text-wallet-balance">
              ₦{Number(wallet?.balance || 0).toLocaleString()}
            </h2>

            <div className="flex gap-4 relative z-10">
              <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
                <DialogTrigger asChild>
                  <Button 
                    onClick={() => { setAction("deposit"); }}
                    className="bg-white text-primary font-bold px-6 rounded-xl border-2 border-transparent"
                    data-testid="button-open-deposit"
                  >
                    <Plus className="mr-2 h-5 w-5" /> Deposit Funds
                  </Button>
                </DialogTrigger>
                <DialogTrigger asChild>
                  <Button 
                    onClick={() => { setAction("withdraw"); }}
                    className="bg-primary-foreground/10 text-white font-bold px-6 rounded-xl backdrop-blur-sm border-2 border-white/20"
                    data-testid="button-open-withdraw"
                  >
                    Withdraw
                  </Button>
                </DialogTrigger>

                <DialogContent className="rounded-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle data-testid="text-dialog-title">
                      {action === "deposit" ? "Deposit Funds" : "Withdraw to Bank"}
                    </DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <Building2 className="w-4 h-4" />
                        Select Bank
                      </label>
                      <Select value={bankCode} onValueChange={setBankCode}>
                        <SelectTrigger className="rounded-xl" data-testid="select-bank">
                          <SelectValue placeholder="Choose your bank" />
                        </SelectTrigger>
                        <SelectContent>
                          {NIGERIAN_BANKS.map((bank) => (
                            <SelectItem key={bank.code} value={bank.code} data-testid={`select-bank-option-${bank.code}`}>
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
                        onChange={e => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                        className="rounded-xl"
                        data-testid="input-account-number"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Account Name (optional)</label>
                      <Input 
                        type="text"
                        placeholder="e.g. John Doe"
                        value={accountName}
                        onChange={e => setAccountName(e.target.value)}
                        className="rounded-xl"
                        data-testid="input-account-name"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Amount (₦)</label>
                      <Input 
                        type="number" 
                        placeholder="0.00" 
                        value={amount} 
                        onChange={e => setAmount(e.target.value)}
                        className="rounded-xl text-lg"
                        data-testid="input-amount"
                      />
                    </div>

                    {bankCode && accountNumber && amount && (
                      <Card className="bg-muted/50 border-dashed">
                        <CardContent className="p-4 space-y-1 text-sm">
                          <p className="font-semibold text-foreground" data-testid="text-summary-title">
                            {action === "deposit" ? "Deposit" : "Withdrawal"} Summary
                          </p>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Bank</span>
                            <span className="font-medium text-foreground" data-testid="text-summary-bank">{selectedBank?.name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Account</span>
                            <span className="font-medium text-foreground" data-testid="text-summary-account">{accountNumber}</span>
                          </div>
                          {accountName && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Name</span>
                              <span className="font-medium text-foreground" data-testid="text-summary-name">{accountName}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Amount</span>
                            <span className="font-bold text-primary" data-testid="text-summary-amount">₦{Number(amount).toLocaleString()}</span>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <Button 
                      type="submit" 
                      className="w-full rounded-xl font-bold bg-primary text-white"
                      disabled={isDepositing || isWithdrawing || !bankCode || !accountNumber || !amount}
                      data-testid="button-confirm-transaction"
                    >
                      {isDepositing || isWithdrawing ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        action === "deposit" ? "Confirm Deposit" : "Confirm Withdrawal"
                      )}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <Card className="md:col-span-2 rounded-3xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="font-display">Transaction History</CardTitle>
            </CardHeader>
            <CardContent>
              {wallet?.transactions.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground" data-testid="text-no-transactions">No transactions yet.</div>
              ) : (
                <div className="space-y-4">
                  {wallet?.transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between gap-4 p-4 rounded-xl bg-muted/20 transition-colors" data-testid={`row-transaction-${tx.id}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                          ['deposit', 'job_earning'].includes(tx.type) ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                        }`}>
                          {['deposit', 'job_earning'].includes(tx.type) ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="font-bold capitalize text-foreground">{tx.type.replace('_', ' ')}</p>
                          {(tx as any).bankName && (
                            <p className="text-xs text-muted-foreground">{(tx as any).bankName}</p>
                          )}
                          <p className="text-xs text-muted-foreground">{format(new Date(tx.createdAt || Date.now()), "PP p")}</p>
                        </div>
                      </div>
                      <span className={`font-bold font-mono flex-shrink-0 ${
                        ['deposit', 'job_earning'].includes(tx.type) ? "text-green-600 dark:text-green-400" : "text-foreground"
                      }`}>
                        {['deposit', 'job_earning'].includes(tx.type) ? "+" : "-"}₦{Math.abs(Number(tx.amount)).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
