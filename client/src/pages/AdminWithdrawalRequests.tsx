import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CheckCircle2, XCircle, Clock, ArrowDownToLine, Building2, User, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useToast } from "@/hooks/use-toast";

interface WithdrawalRequest {
  id: number;
  userId: string;
  userName: string;
  amount: string;
  bankName: string;
  bankCode: string | null;
  accountNumber: string;
  accountName: string | null;
  reason: string | null;
  status: string;
  adminNote: string | null;
  processedBy: number | null;
  processedAt: string | null;
  createdAt: string;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'pending') return <Badge className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
  if (status === 'approved') return <Badge className="bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400"><CheckCircle2 className="w-3 h-3 mr-1" />Approved</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
}

export default function AdminWithdrawalRequests() {
  const { isOwner, isStaff, isLoading: authLoading } = useAdminAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("pending");
  const [selectedRequest, setSelectedRequest] = useState<WithdrawalRequest | null>(null);
  const [action, setAction] = useState<'approved' | 'rejected' | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: requests = [], isLoading } = useQuery<WithdrawalRequest[]>({
    queryKey: ['/api/admin/withdrawal-requests', statusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/withdrawal-requests?status=${statusFilter}`, { credentials: 'include' });
      if (!res.ok) throw new Error("Failed to fetch requests");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const { mutate: processRequest, isPending: isProcessing } = useMutation({
    mutationFn: async ({ id, action, adminNote }: { id: number; action: string; adminNote: string }) => {
      const res = await fetch(`/api/admin/withdrawal-requests/${id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, adminNote }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to process request');
      }
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/withdrawal-requests'] });
      setDialogOpen(false);
      setSelectedRequest(null);
      setAdminNote("");
      toast({
        title: vars.action === 'approved' ? 'Request Approved' : 'Request Rejected',
        description: vars.action === 'approved'
          ? 'The withdrawal has been processed and the user has been notified.'
          : 'The request has been rejected and the user has been notified.',
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const openDialog = (request: WithdrawalRequest, act: 'approved' | 'rejected') => {
    setSelectedRequest(request);
    setAction(act);
    setAdminNote("");
    setDialogOpen(true);
  };

  const handleConfirm = () => {
    if (!selectedRequest || !action) return;
    processRequest({ id: selectedRequest.id, action, adminNote });
  };

  if (authLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (!isOwner && !isStaff) return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">You don't have permission to view this page.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Withdrawal Requests</h1>
            <p className="text-muted-foreground mt-1">Users requesting payment to a new bank account</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted text-sm text-muted-foreground">
            <ArrowDownToLine className="w-4 h-4" />
            {requests.length} {statusFilter} request{requests.length !== 1 ? 's' : ''}
          </div>
        </div>

        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="mb-6">
          <TabsList className="rounded-xl">
            <TabsTrigger value="pending" data-testid="tab-pending">Pending</TabsTrigger>
            <TabsTrigger value="approved" data-testid="tab-approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected" data-testid="tab-rejected">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : requests.length === 0 ? (
          <Card className="rounded-3xl">
            <CardContent className="py-16 text-center">
              <ArrowDownToLine className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
              <p className="text-muted-foreground text-lg">No {statusFilter} withdrawal requests</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {requests.map((req) => (
              <Card key={req.id} className="rounded-2xl overflow-hidden" data-testid={`card-request-${req.id}`}>
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="flex-1 min-w-0 space-y-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <StatusBadge status={req.status} />
                        <span className="text-xs text-muted-foreground">{format(new Date(req.createdAt), "PP p")}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-semibold text-foreground" data-testid={`text-user-${req.id}`}>{req.userName}</span>
                        <span className="text-xs text-muted-foreground truncate">(ID: {req.userId.slice(0, 12)}...)</span>
                      </div>

                      <div className="flex items-start gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-foreground">{req.bankName}</p>
                          <p className="text-sm text-muted-foreground">{req.accountNumber}{req.accountName ? ` — ${req.accountName}` : ''}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Amount:</span>
                        <span className="font-bold text-primary text-lg" data-testid={`text-amount-${req.id}`}>
                          N{parseFloat(req.amount).toLocaleString()}
                        </span>
                      </div>

                      {req.reason && (
                        <div className="bg-muted/50 rounded-xl p-3 text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Reason: </span>{req.reason}
                        </div>
                      )}

                      {req.adminNote && (
                        <div className="bg-muted/50 rounded-xl p-3 text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Admin note: </span>{req.adminNote}
                        </div>
                      )}

                      {req.processedAt && (
                        <p className="text-xs text-muted-foreground">Processed: {format(new Date(req.processedAt), "PP p")}</p>
                      )}
                    </div>

                    {req.status === 'pending' && (
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <Button
                          size="sm"
                          className="rounded-xl bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => openDialog(req, 'approved')}
                          data-testid={`button-approve-${req.id}`}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Approve & Pay
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
                          onClick={() => openDialog(req, 'rejected')}
                          data-testid={`button-reject-${req.id}`}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {action === 'approved' ? 'Approve Withdrawal Request' : 'Reject Withdrawal Request'}
            </DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">User</span>
                  <span className="font-medium">{selectedRequest.userName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-bold text-primary">N{parseFloat(selectedRequest.amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">To</span>
                  <span className="font-medium">{selectedRequest.bankName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Account</span>
                  <span className="font-medium">{selectedRequest.accountNumber}</span>
                </div>
              </div>

              {action === 'approved' && (
                <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-xl text-sm text-green-700 dark:text-green-400">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p>This will deduct N{parseFloat(selectedRequest.amount).toLocaleString()} from the user's wallet and record it as a withdrawal transaction.</p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Note to user (optional)</label>
                <Textarea
                  placeholder="Add a note explaining the decision..."
                  value={adminNote}
                  onChange={e => setAdminNote(e.target.value)}
                  className="rounded-xl resize-none"
                  rows={3}
                  data-testid="input-admin-note"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => setDialogOpen(false)}
                  data-testid="button-cancel-process"
                >
                  Cancel
                </Button>
                <Button
                  className={`flex-1 rounded-xl text-white ${action === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-destructive hover:bg-destructive/90'}`}
                  onClick={handleConfirm}
                  disabled={isProcessing}
                  data-testid="button-confirm-process"
                >
                  {isProcessing ? <Loader2 className="animate-spin" /> : action === 'approved' ? 'Confirm & Pay' : 'Reject Request'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
