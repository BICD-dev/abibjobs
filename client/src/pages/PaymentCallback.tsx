import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle, Clock, Receipt } from "lucide-react";
import { Link } from "wouter";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface FeeTransaction {
  id: number;
  type: string;
  amount: string;
  jobId: number | null;
  jobTitle: string | null;
  previousAmount: string | null;
  newAmount: string | null;
  status: string;
  reference: string | null;
  createdAt: string | null;
}

type PaymentState = 'loading' | 'paid' | 'pending' | 'failed' | 'notfound';

export default function PaymentCallback() {
  const search = window.location.search;
  const params = new URLSearchParams(search);
  const ref = (params.get("reference") || params.get("trxref") || "").trim();
  const paystackStatus = (params.get("status") || "").toLowerCase();
  const [stateOverride, setStateOverride] = useState<PaymentState | null>(null);

  const { data, isLoading } = useQuery<{ transactions: FeeTransaction[] }>({
    queryKey: ['/api/transactions/history'],
    queryFn: async () => {
      const res = await fetch("/api/transactions/history", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    refetchInterval: 4000,
  });

  useEffect(() => {
    if (paystackStatus === 'failed' || paystackStatus === 'abandoned' || paystackStatus === 'cancelled') {
      setStateOverride('failed');
    } else if (paystackStatus === 'success') {
      setStateOverride('paid');
    }
  }, [paystackStatus]);

  let state: PaymentState = stateOverride || 'loading';
  let matched: FeeTransaction | null = null;

  if (!stateOverride) {
    if (!isLoading && data) {
      matched = (data.transactions || []).find((t) => t.reference === ref) || null;
      if (matched) {
        state = matched.status === 'paid' ? 'paid' : matched.status === 'failed' ? 'failed' : 'pending';
      } else if (!ref) {
        state = 'notfound';
      } else {
        state = 'pending';
      }
    }
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />

      <main className="max-w-lg mx-auto px-4 py-16">
        <Card className="overflow-hidden">
          <CardContent className="p-8 text-center">
            {state === 'loading' && (
              <div className="space-y-4">
                <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
                <p className="font-semibold text-foreground">Verifying your payment...</p>
                <p className="text-sm text-muted-foreground">We're confirming your payment with our payment provider. This may take a moment.</p>
              </div>
            )}

            {state === 'paid' && (
              <div className="space-y-4">
                <CheckCircle2 className="w-14 h-14 text-green-600 mx-auto" />
                <p className="text-xl font-bold text-foreground">Payment Successful</p>
                {matched?.amount && (
                  <p className="text-3xl font-bold text-primary">{"\u20A6"}{Number(matched.amount).toLocaleString()}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  Your {matched?.type === 'negotiation_fee' ? "price-adjustment fee" : "job posting fee"} has been received.
                </p>
                <div className="flex flex-col gap-2 pt-2">
                  <Link href="/my-jobs">
                    <Button className="w-full rounded-xl">Go to My Jobs</Button>
                  </Link>
                  <Link href="/transactions">
                    <Button variant="outline" className="w-full rounded-xl">
                      <Receipt className="mr-2 h-4 w-4" /> View Transactions
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {state === 'pending' && (
              <div className="space-y-4">
                <Clock className="w-12 h-12 text-amber-500 mx-auto" />
                <p className="font-semibold text-foreground">Payment awaiting confirmation</p>
                <p className="text-sm text-muted-foreground">We're still waiting for confirmation from our payment provider. This page updates automatically.</p>
              </div>
            )}

            {state === 'failed' && (
              <div className="space-y-4">
                <XCircle className="w-14 h-14 text-red-600 mx-auto" />
                <p className="text-xl font-bold text-foreground">Payment Not Completed</p>
                <p className="text-sm text-muted-foreground">
                  Your payment did not go through. You can try again from your job.
                </p>
                <Link href="/my-jobs">
                  <Button className="w-full rounded-xl">Back to My Jobs</Button>
                </Link>
              </div>
            )}

            {state === 'notfound' && (
              <div className="space-y-4">
                <Receipt className="w-12 h-12 text-muted-foreground mx-auto" />
                <p className="font-semibold text-foreground">No payment to verify</p>
                <p className="text-sm text-muted-foreground">No payment reference was provided.</p>
                <Link href="/my-jobs">
                  <Button variant="outline" className="w-full rounded-xl">Go to My Jobs</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}