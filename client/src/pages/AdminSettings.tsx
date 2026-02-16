import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { useAdminAuth, useAdminChangePassword } from "@/hooks/use-admin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Shield, Eye, EyeOff, Lock } from "lucide-react";

export default function AdminSettings() {
  const { isStaff, isLoading } = useAdminAuth();
  const { mutate: changePassword, isPending } = useAdminChangePassword();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  if (isLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (!isStaff) return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-2xl font-bold mb-2 text-foreground">Access Denied</h2>
        <p className="text-muted-foreground">Only staff admins can access this page.</p>
      </div>
    </div>
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) return;
    if (newPassword.length < 6) return;
    changePassword({ currentPassword, newPassword }, {
      onSuccess: () => {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    });
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />
      <main className="max-w-md mx-auto px-4 sm:px-6 py-10">
        <Card className="rounded-2xl">
          <CardContent className="p-6">
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Lock className="w-6 h-6 text-primary" />
              </div>
              <h1 className="text-xl font-bold text-foreground">Change Password</h1>
              <p className="text-sm text-muted-foreground">Update your admin login password</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Current Password</label>
                <div className="relative">
                  <Input
                    type={showCurrent ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    data-testid="input-current-password"
                  />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" onClick={() => setShowCurrent(!showCurrent)}>
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">New Password</label>
                <div className="relative">
                  <Input
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    data-testid="input-new-password"
                  />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" onClick={() => setShowNew(!showNew)}>
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                {newPassword && newPassword.length < 6 && (
                  <p className="text-xs text-destructive mt-1">Must be at least 6 characters</p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Confirm New Password</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  data-testid="input-confirm-password"
                />
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-destructive mt-1">Passwords don't match</p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isPending || !currentPassword || newPassword.length < 6 || newPassword !== confirmPassword}
                data-testid="button-change-password"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Update Password
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
