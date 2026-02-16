import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Shield, ShieldCheck, XCircle, RefreshCw, Eye, User, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AdminVerifications() {
  const { user } = useAuth();
  const { isStaff } = useAdminAuth();
  const isOwner = user?.email?.toLowerCase() === 'abeebakeem265@gmail.com';
  const hasAccess = isOwner || isStaff;

  const { data: pendingList, isLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/verifications'],
    queryFn: async () => {
      const res = await fetch('/api/admin/verifications', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: hasAccess,
  });

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2 text-foreground">Access Denied</h2>
          <p className="text-muted-foreground">Admin access required.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-foreground" data-testid="text-admin-verifications-title">Identity Verifications</h1>
          <p className="text-muted-foreground mt-1">Review user identity submissions</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !pendingList?.length ? (
          <Card className="rounded-3xl border-border shadow-sm">
            <CardContent className="py-16 text-center">
              <ShieldCheck className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">All Clear</h3>
              <p className="text-muted-foreground">No pending verification submissions.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {pendingList.map((item: any) => (
              <VerificationReviewCard key={item.userId} item={item} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function VerificationReviewCard({ item }: { item: any }) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const reviewMutation = useMutation({
    mutationFn: async ({ action, note }: { action: string; note?: string }) => {
      const res = await fetch(`/api/admin/verifications/${item.userId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note }),
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Review failed');
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/verifications'] });
      const actionLabel = vars.action === 'approve' ? 'approved' : vars.action === 'decline' ? 'declined' : 'requested redo';
      toast({ title: `Verification ${actionLabel}`, description: `User ${item.userName || item.userId} has been ${actionLabel}.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="rounded-3xl border-border shadow-sm" data-testid={`card-verification-${item.userId}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={item.profileImage || undefined} />
            <AvatarFallback><User className="w-5 h-5" /></AvatarFallback>
          </Avatar>
          <div>
            <CardTitle className="text-base">{item.userName || "Unknown User"}</CardTitle>
            <CardDescription className="text-xs">{item.userEmail || item.userId}</CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200">Pending</Badge>
          <Button variant="outline" size="sm" onClick={() => setExpanded(!expanded)} data-testid={`button-toggle-${item.userId}`}>
            <Eye className="w-4 h-4 mr-1" /> {expanded ? "Hide" : "Review"}
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-6 pt-0">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm font-medium mb-2 flex items-center gap-1">
                <FileText className="w-4 h-4" /> ID / Passport
              </p>
              <div className="border border-border rounded-xl overflow-hidden bg-muted/20">
                {item.idCardUrl ? (
                  <img src={item.idCardUrl} alt="ID Card" className="w-full max-h-64 object-contain" data-testid={`img-id-${item.userId}`} />
                ) : (
                  <div className="py-8 text-center text-muted-foreground text-sm">No ID uploaded</div>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-2 flex items-center gap-1">
                <User className="w-4 h-4" /> Face Scan
              </p>
              <div className="border border-border rounded-xl overflow-hidden bg-muted/20">
                {item.faceScanUrl ? (
                  <img src={item.faceScanUrl} alt="Face Scan" className="w-full max-h-64 object-contain" data-testid={`img-face-${item.userId}`} />
                ) : (
                  <div className="py-8 text-center text-muted-foreground text-sm">No face scan captured</div>
                )}
              </div>
            </div>
          </div>

          {item.phoneNumber && (
            <p className="text-sm text-muted-foreground">Phone: {item.phoneNumber}</p>
          )}
          {item.location && (
            <p className="text-sm text-muted-foreground">Location: {item.location}</p>
          )}

          <div>
            <label className="text-sm font-medium mb-1 block">Note (optional, shown to user if declined or redo)</label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Photo is blurry, please resubmit..."
              className="rounded-xl"
              data-testid={`input-note-${item.userId}`}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              className="bg-green-600 hover:bg-green-700 text-white rounded-xl"
              disabled={reviewMutation.isPending}
              onClick={() => reviewMutation.mutate({ action: 'approve', note: note || undefined })}
              data-testid={`button-approve-${item.userId}`}
            >
              {reviewMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ShieldCheck className="w-4 h-4 mr-1" />}
              Approve
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl"
              disabled={reviewMutation.isPending}
              onClick={() => reviewMutation.mutate({ action: 'decline', note: note || undefined })}
              data-testid={`button-decline-${item.userId}`}
            >
              <XCircle className="w-4 h-4 mr-1" /> Decline
            </Button>
            <Button
              variant="outline"
              className="rounded-xl"
              disabled={reviewMutation.isPending}
              onClick={() => reviewMutation.mutate({ action: 'redo', note: note || undefined })}
              data-testid={`button-redo-${item.userId}`}
            >
              <RefreshCw className="w-4 h-4 mr-1" /> Request Redo
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
