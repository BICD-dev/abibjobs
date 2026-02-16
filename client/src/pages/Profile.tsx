import { useProfile, useUpdateProfile } from "@/hooks/use-profile";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, ShieldCheck, ShieldAlert, Upload, Camera, Clock, XCircle, RefreshCw, CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useEffect, useState, useRef, useCallback } from "react";
import { useUpload } from "@/hooks/use-upload";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const verificationStatus = (profile as any)?.verificationStatus || 'unverified';

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-display font-bold text-foreground mb-8">My Profile</h1>

        <div className="grid gap-8 md:grid-cols-3">
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
        </div>
      </main>
    </div>
  );
}

function VerificationBadge({ status }: { status: string }) {
  switch (status) {
    case 'verified':
      return (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 px-3 py-1" data-testid="badge-verified">
          <ShieldCheck className="w-3 h-3 mr-1" /> Verified
        </Badge>
      );
    case 'pending':
      return (
        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200 px-3 py-1" data-testid="badge-pending">
          <Clock className="w-3 h-3 mr-1" /> Pending Review
        </Badge>
      );
    case 'declined':
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200 px-3 py-1" data-testid="badge-declined">
          <XCircle className="w-3 h-3 mr-1" /> Declined
        </Badge>
      );
    case 'redo_requested':
      return (
        <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-orange-200 px-3 py-1" data-testid="badge-redo">
          <RefreshCw className="w-3 h-3 mr-1" /> Redo Required
        </Badge>
      );
    default:
      return (
        <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200 px-3 py-1" data-testid="badge-unverified">
          <ShieldAlert className="w-3 h-3 mr-1" /> Unverified
        </Badge>
      );
  }
}

function VerificationCard({ profile }: { profile: any }) {
  const [idCardUrl, setIdCardUrl] = useState<string | null>(null);
  const [faceScanUrl, setFaceScanUrl] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const status = profile?.verificationStatus || 'unverified';

  const submitMutation = useMutation({
    mutationFn: async (data: { idCardUrl: string; faceScanUrl: string }) => {
      const res = await fetch('/api/verification/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to submit verification');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/profile/me'] });
      toast({ title: "Verification Submitted", description: "Your documents are under review. You'll be notified once approved." });
      setIdCardUrl(null);
      setFaceScanUrl(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmitVerification = () => {
    if (!idCardUrl || !faceScanUrl) return;
    submitMutation.mutate({ idCardUrl, faceScanUrl });
  };

  if (status === 'verified') {
    return (
      <Card className="rounded-3xl border-border shadow-sm" data-testid="card-verification-complete">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            Identity Verified
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Your identity has been verified. You can post and accept jobs.</p>
        </CardContent>
      </Card>
    );
  }

  if (status === 'pending') {
    return (
      <Card className="rounded-3xl border-border shadow-sm" data-testid="card-verification-pending">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-600" />
            Verification Under Review
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Your documents are being reviewed by our team. You'll be notified once a decision is made.</p>
        </CardContent>
      </Card>
    );
  }

  const canSubmit = (status === 'unverified' || status === 'declined' || status === 'redo_requested');

  return (
    <Card className="rounded-3xl border-border shadow-sm" data-testid="card-verification-form">
      <CardHeader>
        <CardTitle className="text-base">Identity Verification</CardTitle>
        <CardDescription>
          {status === 'declined' && profile?.verificationNote 
            ? `Declined: ${profile.verificationNote}` 
            : status === 'redo_requested' && profile?.verificationNote
            ? `Redo needed: ${profile.verificationNote}`
            : 'Upload a valid ID and take a face scan to get verified.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'declined' && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl p-3 text-sm text-red-700 dark:text-red-400" data-testid="text-decline-reason">
            {profile?.verificationNote || "Your verification was declined."}
          </div>
        )}
        {status === 'redo_requested' && (
          <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900 rounded-xl p-3 text-sm text-orange-700 dark:text-orange-400" data-testid="text-redo-reason">
            {profile?.verificationNote || "Please resubmit your verification documents."}
          </div>
        )}

        <div>
          <p className="text-sm font-medium mb-2">Step 1: Upload ID / Passport</p>
          <div className="border-2 border-dashed border-border rounded-xl p-4 text-center hover:bg-muted/20 transition-colors">
            {idCardUrl ? (
              <div className="space-y-2">
                <CheckCircle2 className="w-8 h-8 mx-auto text-green-600" />
                <p className="text-xs text-green-600 font-medium">ID uploaded successfully</p>
                <Button variant="outline" size="sm" onClick={() => setIdCardUrl(null)} data-testid="button-change-id">Change</Button>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground mb-3">Valid ID, Passport, NIN Slip, or Voter's Card</p>
                <IdUploader onSuccess={(url) => setIdCardUrl(url)} />
              </>
            )}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium mb-2">Step 2: Face Scan</p>
          <div className="border-2 border-dashed border-border rounded-xl p-4 text-center">
            {faceScanUrl ? (
              <div className="space-y-2">
                <CheckCircle2 className="w-8 h-8 mx-auto text-green-600" />
                <p className="text-xs text-green-600 font-medium">Face scan captured</p>
                <img src={faceScanUrl} alt="Face scan" className="w-24 h-24 mx-auto rounded-full object-cover border-2 border-green-200" />
                <Button variant="outline" size="sm" onClick={() => { setFaceScanUrl(null); setShowCamera(false); }} data-testid="button-retake-scan">Retake</Button>
              </div>
            ) : showCamera ? (
              <FaceScanner onCapture={(url) => { setFaceScanUrl(url); setShowCamera(false); }} onCancel={() => setShowCamera(false)} />
            ) : (
              <>
                <Camera className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground mb-3">Take a clear selfie for face verification</p>
                <Button variant="outline" onClick={() => setShowCamera(true)} data-testid="button-start-scan">
                  <Camera className="w-4 h-4 mr-2" /> Start Face Scan
                </Button>
              </>
            )}
          </div>
        </div>

        {canSubmit && (
          <Button
            className="w-full rounded-xl"
            disabled={!idCardUrl || !faceScanUrl || submitMutation.isPending}
            onClick={handleSubmitVerification}
            data-testid="button-submit-verification"
          >
            {submitMutation.isPending ? <Loader2 className="animate-spin mr-2" /> : null}
            Submit for Verification
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function IdUploader({ onSuccess }: { onSuccess: (url: string) => void }) {
  const { uploadFile, isUploading, progress } = useUpload({
    onSuccess: (res) => onSuccess(res.objectPath),
  });

  return (
    <div className="w-full">
      <Input 
        type="file" 
        className="hidden" 
        id="id-upload"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadFile(file);
        }}
        disabled={isUploading}
        data-testid="input-id-upload"
      />
      <label htmlFor="id-upload">
        <Button asChild variant="outline" className="w-full cursor-pointer rounded-xl" disabled={isUploading}>
          <span data-testid="button-select-id">{isUploading ? `Uploading ${Math.round(progress)}%` : "Select File"}</span>
        </Button>
      </label>
    </div>
  );
}

function FaceScanner({ onCapture, onCancel }: { onCapture: (dataUrl: string) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const { uploadFile, isUploading } = useUpload({
    onSuccess: (res) => {
      onCapture(res.objectPath);
    },
  });

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setError("Camera access denied. Please allow camera access in your browser settings.");
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setCapturing(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
    }

    stream?.getTracks().forEach(t => t.stop());

    canvas.toBlob(async (blob) => {
      if (blob) {
        const file = new File([blob], `face-scan-${Date.now()}.jpg`, { type: 'image/jpeg' });
        uploadFile(file);
      }
    }, 'image/jpeg', 0.85);
  };

  const handleCancel = () => {
    stream?.getTracks().forEach(t => t.stop());
    onCancel();
  };

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={handleCancel} data-testid="button-cancel-scan">Cancel</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative mx-auto w-48 h-48 rounded-full overflow-hidden border-4 border-primary/30">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          data-testid="video-face-scan"
        />
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <p className="text-xs text-muted-foreground">Position your face in the circle</p>
      <div className="flex gap-2 justify-center">
        <Button variant="outline" size="sm" onClick={handleCancel} data-testid="button-cancel-scan">Cancel</Button>
        <Button size="sm" onClick={handleCapture} disabled={capturing || isUploading} data-testid="button-capture-scan">
          {isUploading ? <Loader2 className="animate-spin mr-1 w-4 h-4" /> : <Camera className="w-4 h-4 mr-1" />}
          {isUploading ? "Uploading..." : "Capture"}
        </Button>
      </div>
    </div>
  );
}
