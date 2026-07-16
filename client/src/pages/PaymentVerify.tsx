import { useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useVerifyFunding } from "@/hooks/use-wallet";
import { api } from "@shared/routes";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PaymentVerify() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const hasInvalidated = useRef(false);

  const reference = new URLSearchParams(search).get("reference") ?? undefined;
  const { data, isLoading, isError, error } = useVerifyFunding(reference);

  useEffect(() => {
    if (data && !hasInvalidated.current) {
      hasInvalidated.current = true;
      queryClient.invalidateQueries({ queryKey: [api.wallet.get.path] });
    }
  }, [data, queryClient]);

  if (!reference) {
    return (
      <VerifyState
        icon={<XCircle className="w-10 h-10 text-red-500" />}
        title="Missing payment reference"
        message="We couldn't find a payment reference in the URL."
        onDone={() => navigate("/wallet")}
      />
    );
  }

  if (isLoading) {
    return (
      <VerifyState
        icon={<Loader2 className="w-10 h-10 text-primary animate-spin" />}
        title="Verifying your payment..."
        message="Please wait while we confirm your transaction with Paystack."
      />
    );
  }

  if (isError) {
    return (
      <VerifyState
        icon={<XCircle className="w-10 h-10 text-red-500" />}
        title="Verification failed"
        message={error instanceof Error ? error.message : "We couldn't verify this payment."}
        onDone={() => navigate("/wallet")}
      />
    );
  }

  return (
    <VerifyState
      icon={<CheckCircle2 className="w-10 h-10 text-green-500" />}
      title="Deposit Successful!"
      message="Your wallet has been credited."
      onDone={() => navigate("/wallet")}
    />
  );
}

function VerifyState({
  icon,
  title,
  message,
  onDone,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  onDone?: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto">{icon}</div>
        <h3 className="font-bold text-xl text-foreground">{title}</h3>
        <p className="text-muted-foreground text-sm">{message}</p>
        {onDone && (
          <Button onClick={onDone} className="rounded-xl font-bold w-full">
            Back to Wallet
          </Button>
        )}
      </div>
    </div>
  );
}