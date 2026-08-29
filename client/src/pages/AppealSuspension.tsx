import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldAlert, Send, CheckCircle2, Clock } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProfile } from "@/hooks/use-profile";
import { useToast } from "@/hooks/use-toast";
import { api } from "@shared/routes";

interface Appeal {
  id: number;
  reason: string;
  note: string | null;
  status: string;
  createdAt: string | null;
  reviewedAt: string | null;
}

export default function AppealSuspension() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const { data: appeals = [], isLoading: appealsLoading } = useQuery<Appeal[]>({
    queryKey: [api.appeals.my.path],
    queryFn: async () => {
      const res = await fetch("/api/appeals/my", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch appeals");
      return res.json();
    },
  });

  const submitAppeal = useMutation({
    mutationFn: async (payload: { reason: string }) => {
      const res = await fetch("/api/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to submit appeal");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.appeals.my.path] });
      setReason("");
      toast({ title: "Appeal Submitted", description: "Your appeal has been sent for review. You'll be notified by email." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const hasPending = appeals.some(a => a.status === 'pending');
  const latest = appeals[0];

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-foreground">Account Appeal</h1>
          <p className="text-muted-foreground mt-2">
            Appeal against a suspension or ban on your account.
          </p>
        </div>

        <Card data-testid="card-appeal-status">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-6 h-6 text-amber-500 shrink-0" />
              <div>
                <p className="font-semibold text-foreground">
                  {profile?.isBanned ? "Your account has been banned" : profile?.isSuspended ? "Your account has been suspended" : "Your account is active"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {profile?.isBanned
                    ? "You cannot use the platform. You may submit an appeal for review."
                    : profile?.isSuspended
                    ? "You cannot post or accept jobs until the suspension is lifted. You may submit an appeal."
                    : "No action needed."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {appealsLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : appeals.length > 0 ? (
          <div className="mt-6 space-y-4">
            <h2 className="text-lg font-bold font-display">Your Appeals</h2>
            {appeals.map((appeal) => (
              <Card key={appeal.id} className="p-5" data-testid={`card-appeal-${appeal.id}`}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Badge variant={appeal.status === 'approved' ? 'outline' : 'secondary'}
                    className={appeal.status === 'approved' ? 'text-green-600 border-green-200 bg-green-50' : appeal.status === 'denied' ? 'text-red-600 border-red-200 bg-red-50' : 'text-amber-600 border-amber-200 bg-amber-50'}>
                    {appeal.status === 'approved' ? <CheckCircle2 className="w-3 h-3 mr-1" /> : appeal.status === 'denied' ? <ShieldAlert className="w-3 h-3 mr-1" /> : <Clock className="w-3 h-3 mr-1" />}
                    {appeal.status}
                  </Badge>
                </div>
                <p className="text-sm text-foreground whitespace-pre-line">{appeal.reason}</p>
                {appeal.note && (
                  <p className="text-xs text-muted-foreground mt-2">Admin note: {appeal.note}</p>
                )}
              </Card>
            ))}
          </div>
        ) : null}

        {!hasPending && (profile?.isSuspended || profile?.isBanned) && (
          <Card className="mt-6">
            <CardContent className="p-6 space-y-3">
              <h2 className="font-semibold text-foreground">Submit a New Appeal</h2>
              <p className="text-sm text-muted-foreground">
                Explain your situation. Be honest and provide any context that may help. You'll receive a decision by email.
              </p>
              <Textarea
                placeholder="Write your appeal (at least 10 characters)..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="min-h-[120px] resize-none"
                data-testid="input-appeal-reason"
              />
              <Button
                className="w-full rounded-xl"
                onClick={() => submitAppeal.mutate({ reason })}
                disabled={submitAppeal.isPending || reason.trim().length < 10}
                data-testid="button-submit-appeal"
              >
                {submitAppeal.isPending ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}
                Submit Appeal
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}