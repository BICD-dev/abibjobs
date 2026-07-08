import { useProfile, useUpdateProfile } from "@/hooks/use-profile";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, ShieldCheck, ShieldAlert, Camera, Clock, XCircle, RefreshCw, KeyRound } from "lucide-react";
import { useForm } from "react-hook-form";
import { useEffect, useRef } from "react";
import { useUpload } from "@/hooks/use-upload";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { VerificationCard } from "@/components/VerificationForm";

export default function Profile() {
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const { mutate: updateProfile, isPending } = useUpdateProfile();

  const form = useForm({
    defaultValues: { bio: "", location: "", phoneNumber: "" },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        bio: profile.bio || "",
        location: profile.location || "",
        phoneNumber: profile.phoneNumber || "",
      });
    }
  }, [profile, form]);

  const onSubmit = (data: any) => updateProfile(data);

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const verificationStatus = (profile as any)?.verificationStatus || "unverified";

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-display font-bold text-foreground mb-8">My Profile</h1>
        <div className="grid gap-8 md:grid-cols-3">
          <div className="md:col-span-1 space-y-6">
            <Card className="rounded-3xl border-border shadow-sm overflow-hidden text-center">
              <div className="bg-primary/10 h-32 relative">
                <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 group">
                  <Avatar className="h-24 w-24 border-4 border-background shadow-lg">
                    <AvatarImage src={(profile as any)?.profilePictureUrl || user?.profileImageUrl || undefined} />
                    <AvatarFallback className="text-2xl font-bold bg-primary text-white">
                      {user?.firstName?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <ProfilePictureUploader currentUrl={(profile as any)?.profilePictureUrl || user?.profileImageUrl} />
                </div>
              </div>
              <div className="pt-16 pb-6 px-4">
                <h2 className="text-xl font-bold font-display">{user?.firstName} {user?.lastName}</h2>
                <p className="text-muted-foreground text-sm mb-4">{user?.email}</p>
                <VerificationBadge status={verificationStatus} />
              </div>
            </Card>

            <VerificationCard profile={profile} />
          </div>

          <Card className="md:col-span-2 rounded-3xl border-border shadow-sm">
            <CardHeader>
              <CardTitle>Profile Details</CardTitle>
              <CardDescription>Manage your public information.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Bio</label>
                  <Textarea
                    {...form.register("bio")}
                    placeholder="Tell us about your skills..."
                    className="rounded-xl border-2 focus:border-primary/50 resize-none h-32"
                    data-testid="input-bio"
                  />
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Phone Number</label>
                    <Input
                      {...form.register("phoneNumber")}
                      placeholder="+234..."
                      className="rounded-xl border-2 focus:border-primary/50 h-12"
                      data-testid="input-phone"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Location</label>
                    <Input
                      {...form.register("location")}
                      placeholder="e.g. Lagos"
                      className="rounded-xl border-2 focus:border-primary/50 h-12"
                      data-testid="input-location"
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-4">
                  <Button
                    type="submit"
                    className="bg-primary hover:bg-primary/90 text-white rounded-xl h-12 px-8 font-bold"
                    disabled={isPending}
                    data-testid="button-save-profile"
                  >
                    {isPending ? <Loader2 className="animate-spin mr-2" /> : "Save Changes"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="md:col-span-2 md:col-start-2">
            <PasswordCard hasPassword={!!(user as any)?.hasPassword} />
          </div>
        </div>
      </main>
    </div>
  );
}

function PasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const { toast } = useToast();
  const form = useForm({
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const setPassword = useMutation({
    mutationFn: async (data: { currentPassword?: string; newPassword: string }) => {
      const res = await apiRequest("POST", "/api/auth/set-password", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: hasPassword ? "Password updated" : "Password set",
        description: "You can now log in with your email and password.",
      });
      form.reset({ currentPassword: "", newPassword: "", confirmPassword: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (err: any) => {
      let msg = (err?.message || "").replace(/^\d+:\s*/, "");
      try {
        msg = JSON.parse(msg).message || msg;
      } catch {}
      toast({
        title: "Could not save password",
        description: msg || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: any) => {
    if (data.newPassword.length < 6) {
      toast({ title: "Password too short", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }
    if (data.newPassword !== data.confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please make sure both passwords are the same.", variant: "destructive" });
      return;
    }
    setPassword.mutate({
      currentPassword: hasPassword ? data.currentPassword : undefined,
      newPassword: data.newPassword,
    });
  };

  return (
    <Card className="rounded-3xl border-border shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-primary" />
          {hasPassword ? "Change Password" : "Set a Password"}
        </CardTitle>
        <CardDescription>
          {hasPassword
            ? "Update the password you use to log in with your email."
            : "Set a password so you can also log in with your email and password, not just with your Google/Replit account."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {hasPassword && (
            <div className="grid gap-2">
              <label className="text-sm font-medium">Current Password</label>
              <Input
                type="password"
                {...form.register("currentPassword")}
                placeholder="Enter your current password"
                className="rounded-xl border-2 focus:border-primary/50 h-12"
                data-testid="input-current-password"
              />
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">New Password</label>
              <Input
                type="password"
                {...form.register("newPassword")}
                placeholder="At least 6 characters"
                className="rounded-xl border-2 focus:border-primary/50 h-12"
                data-testid="input-new-password"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Confirm New Password</label>
              <Input
                type="password"
                {...form.register("confirmPassword")}
                placeholder="Repeat the new password"
                className="rounded-xl border-2 focus:border-primary/50 h-12"
                data-testid="input-confirm-password"
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90 text-white rounded-xl h-12 px-8 font-bold"
              disabled={setPassword.isPending}
              data-testid="button-save-password"
            >
              {setPassword.isPending ? <Loader2 className="animate-spin mr-2" /> : hasPassword ? "Update Password" : "Save Password"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function VerificationBadge({ status }: { status: string }) {
  switch (status) {
    case "verified":
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 px-3 py-1" data-testid="badge-verified"><ShieldCheck className="w-3 h-3 mr-1" /> Verified</Badge>;
    case "pending":
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200 px-3 py-1" data-testid="badge-pending"><Clock className="w-3 h-3 mr-1" /> Pending Review</Badge>;
    case "declined":
      return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200 px-3 py-1" data-testid="badge-declined"><XCircle className="w-3 h-3 mr-1" /> Declined</Badge>;
    case "redo_requested":
      return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-orange-200 px-3 py-1" data-testid="badge-redo"><RefreshCw className="w-3 h-3 mr-1" /> Redo Required</Badge>;
    default:
      return <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200 px-3 py-1" data-testid="badge-unverified"><ShieldAlert className="w-3 h-3 mr-1" /> Unverified</Badge>;
  }
}

function ProfilePictureUploader({ currentUrl }: { currentUrl?: string | null }) {
  const { uploadFile, isUploading } = useUpload({
    onSuccess: (res) => updatePicture.mutate({ profilePictureUrl: res.objectPath }),
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const updatePicture = useMutation({
    mutationFn: async (data: { profilePictureUrl: string }) => {
      const res = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update profile picture");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Profile picture updated" });
    },
    onError: () => {
      toast({ title: "Failed to update picture", variant: "destructive" });
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            if (file.size > 5 * 1024 * 1024) {
              toast({ title: "File too large", description: "Please select an image under 5MB", variant: "destructive" });
              return;
            }
            uploadFile(file);
          }
        }}
        data-testid="input-profile-picture"
      />
      <Button
        size="icon"
        className="absolute bottom-0 right-0 h-7 w-7 rounded-full shadow-md"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading || updatePicture.isPending}
        data-testid="button-change-profile-picture"
      >
        {isUploading || updatePicture.isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Camera className="w-3.5 h-3.5" />
        )}
      </Button>
    </>
  );
}
