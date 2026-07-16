import { useState } from "react";
import { useInitializeFunding } from "@/hooks/use-wallet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Plus } from "lucide-react";

interface FundWalletModalProps {
  trigger?: React.ReactNode;
}

export function FundWalletModal({ trigger }: FundWalletModalProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const { mutate: initializeFunding, isPending } = useInitializeFunding();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(amount);
    if (!val || val <= 0) return;

    initializeFunding(
      { amount: val },
      {
        onSuccess: (data) => {
          // Paystack hosts the payment page; it redirects back to
          // /payment/verify?reference=xxx when the user is done.
          window.location.href = data.checkoutUrl;
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setAmount(""); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="bg-white text-primary font-bold px-6 rounded-xl" data-testid="button-open-deposit">
            <Plus className="mr-2 h-5 w-5" /> Deposit Funds
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle data-testid="text-fund-dialog-title">Deposit Funds</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <p className="text-sm text-muted-foreground">
            You'll be redirected to Paystack to complete your payment securely.
          </p>

          <div className="space-y-2">
            <label className="text-sm font-medium">Amount (₦)</label>
            <Input
              type="number"
              min="1"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="rounded-xl text-lg"
              data-testid="input-fund-amount"
            />
          </div>

          <Button
            type="submit"
            className="w-full rounded-xl font-bold"
            disabled={isPending || !amount || Number(amount) <= 0}
            data-testid="button-confirm-deposit"
          >
            {isPending ? <Loader2 className="animate-spin" /> : "Continue to Payment"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}