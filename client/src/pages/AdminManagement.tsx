import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { useAdminAuth, useAdminStaffList, useCreateAdminStaff, useDeleteAdminStaff, useResetAdminPassword, useToggleAdminStaff, useAdminHours } from "@/hooks/use-admin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus, Trash2, RotateCcw, Shield, Clock, Copy, Check, Power, Ban, ShieldOff, UserCheck, Scale, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export default function AdminManagement() {
  const { isOwner, isLoading: authLoading } = useAdminAuth();
  const { data: staffList, isLoading: staffLoading } = useAdminStaffList();
  const { mutate: createStaff, isPending: isCreating } = useCreateAdminStaff();
  const { mutate: deleteStaff, isPending: isDeleting } = useDeleteAdminStaff();
  const { mutateAsync: resetPassword, isPending: isResetting } = useResetAdminPassword();
  const { mutate: toggleStaff } = useToggleAdminStaff();

  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState<{ email: string; password: string } | null>(null);
  const [resetResult, setResetResult] = useState<{ id: number; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [suspendTarget, setSuspendTarget] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [banTarget, setBanTarget] = useState<string | null>(null);
  const [banReason, setBanReason] = useState("");
  const [appealId, setAppealId] = useState<number | null>(null);
  const [appealNote, setAppealNote] = useState("");

  const { data: usersList, isLoading: usersLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/users'],
    queryFn: async () => {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  const { data: appeals, isLoading: appealsLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/appeals'],
    queryFn: async () => {
      const res = await fetch("/api/admin/appeals", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch appeals");
      return res.json();
    },
  });

  const refreshUsers = () => queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });

  const suspendMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      const res = await fetch(`/api/admin/users/${userId}/suspend`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
        credentials: "include",
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Failed to suspend user"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User Suspended", description: "The user has been suspended and their active jobs cancelled." });
      refreshUsers();
      setSuspendTarget(null);
      setSuspendReason("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const unsuspendMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/users/${userId}/unsuspend`, { method: 'POST', credentials: "include" });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Failed to unsuspend user"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User Unsuspended" });
      refreshUsers();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const banMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      const res = await fetch(`/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
        credentials: "include",
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Failed to ban user"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User Banned", description: "The user has been banned and their active jobs cancelled." });
      refreshUsers();
      setBanTarget(null);
      setBanReason("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const unbanMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/admin/users/${userId}/unban`, { method: 'POST', credentials: "include" });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Failed to unban user"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User Unbanned" });
      refreshUsers();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const reviewAppealMutation = useMutation({
    mutationFn: async ({ appealId: id, decision, note }: { appealId: number; decision: string; note?: string }) => {
      const res = await fetch(`/api/admin/appeals/${id}/review`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
        credentials: "include",
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Failed to review appeal"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/appeals'] });
      refreshUsers();
      setAppealId(null);
      setAppealNote("");
      toast({ title: "Appeal Reviewed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const { data: hoursData, isLoading: hoursLoading } = useAdminHours(selectedDate);

  if (authLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (!isOwner) return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2 text-foreground">Access Denied</h2>
        <p className="text-muted-foreground">Only the platform owner can manage admin staff.</p>
      </div>
    </div>
  );

  const handleCreateStaff = () => {
    if (!newEmail.trim() || !newName.trim()) return;
    createStaff({ email: newEmail.trim(), name: newName.trim() }, {
      onSuccess: (data: any) => {
        setGeneratedPassword({ email: newEmail.trim(), password: data.generatedPassword });
        setNewEmail("");
        setNewName("");
      }
    });
  };

  const handleResetPassword = async (id: number) => {
    try {
      const data = await resetPassword(id);
      setResetResult({ id, password: (data as any).generatedPassword });
    } catch {}
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatHours = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h === 0) return `${m}m`;
    return `${h}h ${m}m`;
  };

  const staff = staffList || [];

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-admin-mgmt-title">Admin Staff Management</h1>
            <p className="text-muted-foreground">Add, remove, and monitor your admin team</p>
          </div>
          <Badge variant="secondary" className="text-sm">
            {staff.filter((s: any) => s.isActive).length} Active Admins
          </Badge>
        </div>

        <Card className="rounded-2xl mb-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4 text-foreground">Add New Admin</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="Full name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                data-testid="input-new-admin-name"
              />
              <Input
                type="email"
                placeholder="Email address"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                data-testid="input-new-admin-email"
              />
              <Button
                onClick={handleCreateStaff}
                disabled={isCreating || !newEmail.trim() || !newName.trim()}
                data-testid="button-create-admin"
              >
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
                Add
              </Button>
            </div>

            {generatedPassword && (
              <div className="mt-4 p-4 bg-primary/5 border border-primary/20 rounded-xl">
                <p className="text-sm font-medium text-foreground mb-2">Admin created successfully!</p>
                <p className="text-sm text-muted-foreground mb-1">Email: <span className="font-mono text-foreground">{generatedPassword.email}</span></p>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">Password: <span className="font-mono text-foreground">{generatedPassword.password}</span></p>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => copyToClipboard(generatedPassword.password)}
                    data-testid="button-copy-password"
                  >
                    {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Share this password with the admin. They can change it after logging in.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl mb-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4 text-foreground">Admin Staff</h2>
            {staffLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : staff.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No admin staff added yet.</p>
            ) : (
              <div className="space-y-3">
                {staff.map((admin: any) => (
                  <div
                    key={admin.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-muted/30"
                    data-testid={`card-admin-${admin.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground" data-testid={`text-admin-name-${admin.id}`}>{admin.name}</p>
                        <Badge variant={admin.isActive ? "default" : "secondary"}>
                          {admin.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate" data-testid={`text-admin-email-${admin.id}`}>{admin.email}</p>
                      {admin.createdAt && (
                        <p className="text-xs text-muted-foreground">Added {format(new Date(admin.createdAt), 'MMM d, yyyy')}</p>
                      )}
                    </div>

                    {resetResult?.id === admin.id && resetResult && (
                      <div className="w-full p-3 bg-primary/5 border border-primary/20 rounded-lg">
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-muted-foreground">New password: <span className="font-mono text-foreground">{resetResult.password}</span></p>
                          <Button size="icon" variant="ghost" onClick={() => copyToClipboard(resetResult.password)}>
                            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => toggleStaff(admin.id)}
                        title={admin.isActive ? "Deactivate" : "Activate"}
                        data-testid={`button-toggle-admin-${admin.id}`}
                      >
                        <Power className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleResetPassword(admin.id)}
                        disabled={isResetting}
                        title="Reset password"
                        data-testid={`button-reset-password-${admin.id}`}
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteStaff(admin.id)}
                        disabled={isDeleting}
                        title="Remove admin"
                        data-testid={`button-delete-admin-${admin.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl mb-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
              <Scale className="w-5 h-5" />
              Suspension / Ban Appeals
            </h2>
            {appealsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : !appeals || appeals.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No appeals to review.</p>
            ) : (
              <div className="space-y-3">
                {appeals.map((appeal: any) => (
                  <div key={appeal.id} className="p-4 rounded-xl bg-muted/30" data-testid={`card-appeal-${appeal.id}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{appeal.userName || "User"}</p>
                        <p className="text-xs text-muted-foreground truncate">{appeal.userEmail}</p>
                      </div>
                      <Badge variant={appeal.status === 'approved' ? "default" : appeal.status === 'denied' ? "secondary" : "outline"}>
                        {appeal.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">{appeal.reason}</p>
                    {appeal.status === 'pending' && (
                      <div className="mt-3 space-y-2">
                        {appealId === appeal.id ? (
                          <>
                            <Textarea
                              placeholder="Optional note to the user..."
                              value={appealNote}
                              onChange={(e) => setAppealNote(e.target.value)}
                              className="resize-none"
                              rows={2}
                              data-testid={`input-appeal-note-${appeal.id}`}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                disabled={reviewAppealMutation.isPending}
                                onClick={() => reviewAppealMutation.mutate({ appealId: appeal.id, decision: 'approved', note: appealNote || undefined })}
                                data-testid={`button-approve-appeal-${appeal.id}`}
                              >
                                <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={reviewAppealMutation.isPending}
                                onClick={() => reviewAppealMutation.mutate({ appealId: appeal.id, decision: 'denied', note: appealNote || undefined })}
                                data-testid={`button-deny-appeal-${appeal.id}`}
                              >
                                <XCircle className="w-4 h-4 mr-1" /> Deny
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => { setAppealId(null); setAppealNote(""); }}>
                                Cancel
                              </Button>
                            </div>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setAppealId(appeal.id); setAppealNote(""); }}
                            data-testid={`button-review-appeal-${appeal.id}`}
                          >
                            Review Appeal
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl mb-6">
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
              <ShieldOff className="w-5 h-5" />
              Users
            </h2>
            {usersLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : !usersList || usersList.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No users yet.</p>
            ) : (
              <div className="space-y-3">
                {usersList.map((u: any) => (
                  <div key={u.userId} className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-muted/30" data-testid={`card-user-${u.userId}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{u.userName || "User"}</p>
                        {u.isBanned && <Badge variant="destructive">Banned</Badge>}
                        {u.isSuspended && !u.isBanned && <Badge variant="secondary">Suspended</Badge>}
                        {u.verificationStatus === 'approved' ? (
                          <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50"><UserCheck className="w-3 h-3 mr-1" />Verified</Badge>
                        ) : (
                          <Badge variant="outline">{u.verificationStatus || "unverified"}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{u.userEmail}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                      {u.isBanned ? (
                        <Button size="sm" variant="outline" onClick={() => unbanMutation.mutate(u.userId)} disabled={unbanMutation.isPending} data-testid={`button-unban-${u.userId}`}>
                          <UserCheck className="w-4 h-4 mr-1" /> Unban
                        </Button>
                      ) : (
                        <>
                          {u.isSuspended && (
                            <Button size="sm" variant="outline" onClick={() => unsuspendMutation.mutate(u.userId)} disabled={unsuspendMutation.isPending} data-testid={`button-unsuspend-${u.userId}`}>
                              <ShieldOff className="w-4 h-4 mr-1" /> Unsuspend
                            </Button>
                          )}
                          {!u.isSuspended && (suspendTarget === u.userId ? (
                            <div className="flex items-center gap-1">
                              <Input
                                placeholder="Reason (required)"
                                value={suspendReason}
                                onChange={(e) => setSuspendReason(e.target.value)}
                                className="w-40 h-9 text-sm"
                                data-testid={`input-suspend-${u.userId}`}
                              />
                              <Button size="sm" onClick={() => suspendReason.trim() && suspendMutation.mutate({ userId: u.userId, reason: suspendReason.trim() })} disabled={suspendMutation.isPending || !suspendReason.trim()}>
                                Confirm
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setSuspendTarget(null); setSuspendReason(""); }}>
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => { setSuspendTarget(u.userId); setSuspendReason(""); }} data-testid={`button-suspend-${u.userId}`}>
                              <Shield className="w-4 h-4 mr-1" /> Suspend
                            </Button>
                          ))}
                          {banTarget === u.userId ? (
                            <div className="flex items-center gap-1">
                              <Input
                                placeholder="Reason (required)"
                                value={banReason}
                                onChange={(e) => setBanReason(e.target.value)}
                                className="w-40 h-9 text-sm"
                                data-testid={`input-ban-${u.userId}`}
                              />
                              <Button size="sm" variant="destructive" onClick={() => banReason.trim() && banMutation.mutate({ userId: u.userId, reason: banReason.trim() })} disabled={banMutation.isPending || !banReason.trim()}>
                                Confirm
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setBanTarget(null); setBanReason(""); }}>
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="destructive" onClick={() => { setBanTarget(u.userId); setBanReason(""); }} data-testid={`button-ban-${u.userId}`}>
                              <Ban className="w-4 h-4 mr-1" /> Ban
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Daily Work Hours
              </h2>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-auto"
                data-testid="input-hours-date"
              />
            </div>
            {hoursLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : !hoursData || hoursData.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No activity recorded for this date.</p>
            ) : (
              <div className="space-y-3">
                {hoursData.map((entry: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-muted/30"
                    data-testid={`card-hours-${entry.adminId}`}
                  >
                    <div>
                      <p className="font-medium text-foreground">{entry.name}</p>
                      <p className="text-sm text-muted-foreground">{entry.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-primary" data-testid={`text-hours-${entry.adminId}`}>
                        {formatHours(entry.secondsWorked)}
                      </p>
                      <p className="text-xs text-muted-foreground">worked</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
