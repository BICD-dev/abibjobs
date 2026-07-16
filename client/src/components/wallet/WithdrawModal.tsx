import { useState } from "react";
import { useWithdraw } from "@/hooks/use-wallet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Building2 } from "lucide-react";
import { NIGERIAN_BANKS } from "@/lib/nigerian-banks";

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

  const { mutate: withdraw, isPending } = useWithdraw();
  const selectedBank = NIGERIAN_BANKS.find((b) => b.code === bankCode);

  const reset = () => {
    setAmount("");
    setBankCode("");
    setAccountNumber("");
    setAccountName("");
  };

  const isValid =
    !!amount && Number(amount) > 0 && Number(amount) <= balance &&
    !!bankCode && accountNumber.length === 10;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    withdraw(
      {
        amount: Number(amount),
        bankCode,
        bankName: selectedBank?.name || "",
        accountNumber,
        accountName: accountName || undefined,
      },
      { onSuccess: () => { setOpen(false); reset(); } }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="bg-primary-foreground/10 text-white font-bold px-6 rounded-xl border-2 border-white/20" data-testid="button-open-withdraw">
            Withdraw
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="text-withdraw-dialog-title">Withdraw to Bank</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
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

          {bankCode && accountNumber.length === 10 && amount && (
            <Card className="bg-muted/50 border-dashed">
              <CardContent className="p-4 space-y-1 text-sm">
                <p className="font-semibold text-foreground">Withdrawal Summary</p>
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
            {isPending ? <Loader2 className="animate-spin" /> : "Confirm Withdrawal"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}