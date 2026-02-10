import { useProfile, useUpdateProfile } from "@/hooks/use-profile";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, ShieldCheck, ShieldAlert, Upload } from "lucide-react";
import { useForm } from "react-hook-form";
import { useEffect } from "react";

export default function Profile() {
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const { mutate: updateProfile, isPending } = useUpdateProfile();

  const form = useForm({
    defaultValues: {
      bio: "",
      location: "",
      phoneNumber: "",
    }
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

  const onSubmit = (data: any) => {
    updateProfile(data);
  };

  const onIdUploadComplete = (result: any) => {
    // result.successful[0].uploadURL is the URL from Uppy (might need adjustment based on provider)
    // The ObjectUploader hook returns signed URL flow. 
    // Wait, the ObjectUploader component uses Uppy with a custom plugin or hook. 
    // Let's assume standard Uppy result structure where we get the file URL.
    // However, our custom `useUpload` hook logic suggests we get a presigned URL. 
    // If using the component provided in blueprint:
    // It calls `onGetUploadParameters` which we need to provide. 
    // But wait, the blueprint's ObjectUploader takes `onGetUploadParameters`.
    // I need to implement that prop function properly.
    
    // Actually, looking at the blueprint provided ObjectUploader usage:
    // It doesn't seem to pass back the final URL easily in `onComplete` unless we assume the backend path.
    // The `useUpload` hook approach is cleaner for single file uploads without Uppy UI overhead if preferred,
    // but the blueprint emphasized ObjectUploader.
    
    // I'll assume the file is uploaded and I can construct the URL or I get it from the result if using AWS S3 plugin response.
    // Simplification: Just refresh profile or assume a predictable path? No, path has UUID.
    
    // Correction: I will use the `useUpload` hook instead of the complex Uppy component for ID card to keep it simple and controlled.
    // The blueprint said "Use ObjectUploader component" OR "useUpload hook". I choose hook for custom UI.
  };

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-display font-bold text-foreground mb-8">My Profile</h1>

        <div className="grid gap-8 md:grid-cols-3">
          {/* Identity Card */}
          <div className="md:col-span-1 space-y-6">
            <Card className="rounded-3xl border-border shadow-sm overflow-hidden text-center">
              <div className="bg-primary/10 h-32 relative">
                <Avatar className="h-24 w-24 absolute -bottom-12 left-1/2 -translate-x-1/2 border-4 border-background shadow-lg">
                  <AvatarImage src={user?.profileImageUrl || undefined} />
                  <AvatarFallback className="text-2xl font-bold bg-primary text-white">
                    {user?.firstName?.[0]}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="pt-16 pb-6 px-4">
                <h2 className="text-xl font-bold font-display">{user?.firstName} {user?.lastName}</h2>
                <p className="text-muted-foreground text-sm mb-4">{user?.email}</p>
                
                {profile?.isVerified ? (
                  <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 px-3 py-1">
                    <ShieldCheck className="w-3 h-3 mr-1" /> Verified Identity
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200 px-3 py-1">
                    <ShieldAlert className="w-3 h-3 mr-1" /> Unverified
                  </Badge>
                )}
              </div>
            </Card>

            <Card className="rounded-3xl border-border shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Identity Verification</CardTitle>
                <CardDescription>Upload a valid Nigerian ID card to get verified.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:bg-muted/20 transition-colors">
                  <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground mb-4">Valid ID, Passport, or NIN Slip</p>
                  
                  {/* Using the provided ObjectUploader logic would go here, 
                      but for this code generation I'll use a placeholder button 
                      that implies the functionality or the Hook implementation */}
                  <div className="relative">
                    <ObjectUploaderAdapter onUploadSuccess={(url) => updateProfile({ idCardUrl: url })} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Details Form */}
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
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Phone Number</label>
                    <Input 
                      {...form.register("phoneNumber")} 
                      placeholder="+234..."
                      className="rounded-xl border-2 focus:border-primary/50 h-12"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Location</label>
                    <Input 
                      {...form.register("location")} 
                      placeholder="e.g. Lagos"
                      className="rounded-xl border-2 focus:border-primary/50 h-12"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button 
                    type="submit" 
                    className="bg-primary hover:bg-primary/90 text-white rounded-xl h-12 px-8 font-bold"
                    disabled={isPending}
                  >
                    {isPending ? <Loader2 className="animate-spin mr-2" /> : "Save Changes"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

// Wrapper to use the Hook for uploading
import { useUpload } from "@/hooks/use-upload";
function ObjectUploaderAdapter({ onUploadSuccess }: { onUploadSuccess: (url: string) => void }) {
  const { uploadFile, isUploading, progress } = useUpload({
    onSuccess: (res) => onUploadSuccess(res.objectPath), // Or construct full URL if needed
  });

  return (
    <div className="w-full">
      <Input 
        type="file" 
        className="hidden" 
        id="id-upload"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadFile(file);
        }}
        disabled={isUploading}
      />
      <label htmlFor="id-upload">
        <Button asChild variant="outline" className="w-full cursor-pointer rounded-xl" disabled={isUploading}>
          <span>{isUploading ? `Uploading ${Math.round(progress)}%` : "Select File"}</span>
        </Button>
      </label>
    </div>
  );
}
