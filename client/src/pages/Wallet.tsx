import { useState } from "react";
import { useWallet, useDeposit, useWithdraw } from "@/hooks/use-wallet";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Plus, ArrowUpRight, ArrowDownLeft, Wallet as WalletIcon } from "lucide-react";
import { format } from "date-fns";

export default function Wallet() {
  const { data: wallet, isLoading } = useWallet();
  const { mutate: deposit, isPending: isDepositing } = useDeposit();
  const { mutate: withdraw, isPending: isWithdrawing } = useWithdraw();
  
  const [amount, setAmount] = useState("");
  const [action, setAction] = useState<"deposit" | "withdraw">("deposit");
  const [open, setOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(amount);
    if (!val) return;

    if (action === "deposit") {
      deposit(val, { onSuccess: () => { setOpen(false); setAmount(""); }});
    } else {
      withdraw(val, { onSuccess: () => { setOpen(false); setAmount(""); }});
    }
  };

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-display font-bold text-foreground mb-8">My Wallet</h1>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Balance Card */}
          <div className="bg-primary rounded-3xl p-8 text-white shadow-2xl shadow-primary/30 relative overflow-hidden md:col-span-2">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <WalletIcon className="w-32 h-32" />
            </div>
            
            <p className="text-primary-foreground/80 font-medium mb-2">Available Balance</p>
            <h2 className="text-5xl font-bold font-display tracking-tight mb-8">
              ₦{Number(wallet?.balance || 0).toLocaleString()}
            </h2>

            <div className="flex gap-4 relative z-10">
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button 
                    onClick={() => { setAction("deposit"); }}
                    className="bg-white text-primary hover:bg-white/90 font-bold px-6 h-12 rounded-xl border-2 border-transparent"
                  >
                    <Plus className="mr-2 h-5 w-5" /> Deposit Funds
                  </Button>
                </DialogTrigger>
                <DialogTrigger asChild>
                  <Button 
                    onClick={() => { setAction("withdraw"); }}
                    className="bg-primary-foreground/10 text-white hover:bg-primary-foreground/20 font-bold px-6 h-12 rounded-xl backdrop-blur-sm border-2 border-white/20"
                  >
                    Withdraw
                  </Button>
                </DialogTrigger>

                <DialogContent className="rounded-2xl">
                  <DialogHeader>
                    <DialogTitle>{action === "deposit" ? "Add Funds" : "Withdraw Funds"}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Amount (₦)</label>
                      <Input 
                        type="number" 
                        placeholder="0.00" 
                        value={amount} 
                        onChange={e => setAmount(e.target.value)}
                        className="rounded-xl h-12 text-lg"
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full h-12 rounded-xl font-bold bg-primary text-white"
                      disabled={isDepositing || isWithdrawing}
                    >
                      {isDepositing || isWithdrawing ? <Loader2 className="animate-spin" /> : "Confirm"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Transactions */}
          <Card className="md:col-span-2 rounded-3xl border border-border shadow-sm">
            <CardHeader>
              <CardTitle className="font-display">Transaction History</CardTitle>
            </CardHeader>
            <CardContent>
              {wallet?.transactions.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">No transactions yet.</div>
              ) : (
                <div className="space-y-4">
                  {wallet?.transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between p-4 rounded-xl bg-muted/20 hover:bg-muted/40 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          ['deposit', 'job_earning'].includes(tx.type) ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                        }`}>
                          {['deposit', 'job_earning'].includes(tx.type) ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                        </div>
                        <div>
                          <p className="font-bold capitalize text-foreground">{tx.type.replace('_', ' ')}</p>
                          <p className="text-xs text-muted-foreground">{format(new Date(tx.createdAt || Date.now()), "PP p")}</p>
                        </div>
                      </div>
                      <span className={`font-bold font-mono ${
                        ['deposit', 'job_earning'].includes(tx.type) ? "text-green-600" : "text-foreground"
                      }`}>
                        {['deposit', 'job_earning'].includes(tx.type) ? "+" : "-"}₦{Number(tx.amount).toLocaleString()}
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
