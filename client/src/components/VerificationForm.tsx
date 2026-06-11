import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, ShieldCheck, ShieldAlert, Upload, Camera, Clock, XCircle, RefreshCw, CheckCircle2 } from "lucide-react";
import { useUpload } from "@/hooks/use-upload";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function IdUploader({ onSuccess }: { onSuccess: (url: string) => void }) {
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
          <span data-testid="button-select-id">
            {isUploading ? `Uploading ${Math.round(progress)}%` : "Select File"}
          </span>
        </Button>
      </label>
    </div>
  );
}

export function FaceScanner({
  onCapture,
  onCancel,
}: {
  onCapture: (dataUrl: string) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const { uploadFile, isUploading } = useUpload({
    onSuccess: (res) => onCapture(res.objectPath),
  });

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
    } catch {
      setError("Camera access denied. Please allow camera access in your browser settings.");
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setCapturing(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.drawImage(video, 0, 0);
    stream?.getTracks().forEach((t) => t.stop());
    canvas.toBlob(async (blob) => {
      if (blob) {
        const file = new File([blob], `face-scan-${Date.now()}.jpg`, { type: "image/jpeg" });
        uploadFile(file);
      }
    }, "image/jpeg", 0.85);
  };

  const handleCancel = () => {
    stream?.getTracks().forEach((t) => t.stop());
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
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" data-testid="video-face-scan" />
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

interface VerificationCardProps {
  profile: any;
  onSubmitted?: () => void;
}

export function VerificationCard({ profile, onSubmitted }: VerificationCardProps) {
  const [idCardUrl, setIdCardUrl] = useState<string | null>(null);
  const [faceScanUrl, setFaceScanUrl] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const status = profile?.verificationStatus || "unverified";

  const submitMutation = useMutation({
    mutationFn: async (data: { idCardUrl: string; faceScanUrl: string }) => {
      const res = await fetch("/api/verification/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to submit verification");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile/me"] });
      toast({ title: "Verification Submitted", description: "Your documents are under review. You'll be notified once approved." });
      setIdCardUrl(null);
      setFaceScanUrl(null);
      onSubmitted?.();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/verification/cancel", { method: "POST", credentials: "include" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to cancel verification");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile/me"] });
      toast({ title: "Verification Cancelled", description: "You can now resubmit your documents." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!idCardUrl || !faceScanUrl) return;
    submitMutation.mutate({ idCardUrl, faceScanUrl });
  };

  if (status === "verified") {
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

  if (status === "pending") {
    return (
      <Card className="rounded-3xl border-border shadow-sm" data-testid="card-verification-pending">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-600" />
            Verification Under Review
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Your documents are being reviewed by our team. You'll be notified once a decision is made.</p>
          <Button
            variant="outline"
            className="w-full rounded-xl"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
            data-testid="button-cancel-verification"
          >
            {cancelMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <XCircle className="w-4 h-4 mr-2" />}
            Cancel & Resubmit
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-3xl border-border shadow-sm" data-testid="card-verification-form">
      <CardHeader>
        <CardTitle className="text-base">Identity Verification</CardTitle>
        <CardDescription>
          {status === "declined" && profile?.verificationNote
            ? `Declined: ${profile.verificationNote}`
            : status === "redo_requested" && profile?.verificationNote
            ? `Redo needed: ${profile.verificationNote}`
            : "Upload a valid ID and take a face scan to get verified."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "declined" && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl p-3 text-sm text-red-700 dark:text-red-400" data-testid="text-decline-reason">
            {profile?.verificationNote || "Your verification was declined."}
          </div>
        )}
        {status === "redo_requested" && (
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

        <Button
          className="w-full rounded-xl"
          disabled={!idCardUrl || !faceScanUrl || submitMutation.isPending}
          onClick={handleSubmit}
          data-testid="button-submit-verification"
        >
          {submitMutation.isPending ? <Loader2 className="animate-spin mr-2" /> : null}
          Submit for Verification
        </Button>
      </CardContent>
    </Card>
  );
}
