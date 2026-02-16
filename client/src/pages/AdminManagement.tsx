import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { useAdminAuth, useAdminStaffList, useCreateAdminStaff, useDeleteAdminStaff, useResetAdminPassword, useToggleAdminStaff, useAdminHours } from "@/hooks/use-admin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus, Trash2, RotateCcw, Shield, Clock, Copy, Check, Power } from "lucide-react";
import { format } from "date-fns";

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

                    {resetResult?.id === admin.id && (
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
