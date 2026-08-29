import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Receipt, CheckCircle2, Clock, XCircle } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { api } from "@shared/routes";

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

function StatusBadge({ status }: { status: string }) {
  if (status === 'paid') {
    return <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800"><CheckCircle2 className="w-3 h-3 mr-1" />Paid</Badge>;
  }
  if (status === 'failed') {
    return <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
  }
  return <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
}

export default function TransactionHistory() {
  const { data, isLoading } = useQuery<{ transactions: FeeTransaction[] }>({
    queryKey: [api.transactions.history.path],
    queryFn: async () => {
      const res = await fetch("/api/transactions/history", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const transactions = data?.transactions || [];

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-transactions-title">Transactions</h1>
          <p className="text-muted-foreground mt-2">
            Every platform fee you've paid — job posting fees and price-adjustment fees.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-20 bg-muted/20 rounded-3xl border border-border">
            <Receipt className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-1">No transactions yet</h3>
            <p className="text-sm text-muted-foreground">
              Platform fees will appear here when you post a job or agree on a higher price.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {transactions.map((tx) => (
              <Card key={`${tx.type}-${tx.id}`} className="overflow-hidden" data-testid={`card-transaction-${tx.id}`}>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">
                          {tx.type === 'negotiation_fee' ? "Price Adjustment Fee" : "Job Posting Fee"}
                        </p>
                        <StatusBadge status={tx.status} />
                      </div>
                      {tx.amount && (
                        <p className="text-2xl font-bold text-primary mt-1">
                          {"\u20A6"}{Number(tx.amount).toLocaleString()}
                        </p>
                      )}
                    </div>
                    {tx.createdAt && (
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(tx.createdAt), "PP p")}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 space-y-1 text-sm">
                    {tx.jobTitle && (
                      <p className="text-muted-foreground">
                        Job:{" "}
                        {tx.jobId ? (
                          <Link href={`/jobs/${tx.jobId}`} className="text-primary hover:underline">
                            {tx.jobTitle}
                          </Link>
                        ) : (
                          tx.jobTitle
                        )}
                      </p>
                    )}
                    {tx.type === 'negotiation_fee' && tx.previousAmount && tx.newAmount && (
                      <p className="text-muted-foreground">
                        Price increased from {"\u20A6"}{Number(tx.previousAmount).toLocaleString()} to {"\u20A6"}{Number(tx.newAmount).toLocaleString()}
                      </p>
                    )}
                    {tx.reference && (
                      <p className="text-xs text-muted-foreground font-mono truncate">Ref: {tx.reference}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}