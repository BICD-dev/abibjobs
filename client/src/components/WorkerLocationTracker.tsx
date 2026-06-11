import { useEffect, useRef, useState } from "react";
import { Radio, MapPin, AlertCircle } from "lucide-react";

interface WorkerLocationTrackerProps {
  jobId: number;
  workerProgress: string | null | undefined;
  onLocationUpdate?: () => void;
}

const SEND_INTERVAL_MS = 5000;

export default function WorkerLocationTracker({
  jobId,
  workerProgress,
  onLocationUpdate,
}: WorkerLocationTrackerProps) {
  const [status, setStatus] = useState<"idle" | "active" | "denied" | "error">("idle");
  const [lastSent, setLastSent] = useState<Date | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSendRef = useRef<number>(0);
  const isTracking = workerProgress === "on_the_way" || workerProgress === "at_location";

  useEffect(() => {
    if (!isTracking) {
      // Clean up if worker goes back to a non-tracking state
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        setStatus("idle");
      }
      return;
    }

    if (!navigator.geolocation) {
      setStatus("error");
      return;
    }

    const sendLocation = async (lat: number, lng: number) => {
      const now = Date.now();
      if (now - lastSendRef.current < SEND_INTERVAL_MS) return;
      lastSendRef.current = now;

      try {
        const res = await fetch(`/api/jobs/${jobId}/worker-location`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latitude: lat, longitude: lng }),
          credentials: "include",
        });
        if (res.ok) {
          setLastSent(new Date());
          onLocationUpdate?.();
        }
      } catch {
        // Silent fail — we'll retry on next position update
      }
    };

    setStatus("active");

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        sendLocation(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus("denied");
        } else {
          setStatus("error");
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 15000,
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isTracking, jobId]);

  if (!isTracking) return null;

  if (status === "denied") {
    return (
      <div
        data-testid="tracker-denied"
        className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-sm"
      >
        <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium text-amber-700 dark:text-amber-400">Location access denied</p>
          <p className="text-amber-600 dark:text-amber-500 text-xs mt-0.5">
            Allow location in your browser settings so the poster can track your progress.
          </p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div
        data-testid="tracker-error"
        className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400"
      >
        <AlertCircle className="w-4 h-4 shrink-0" />
        Location unavailable on this device.
      </div>
    );
  }

  return (
    <div
      data-testid="tracker-active"
      className="flex items-center gap-3 p-3 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800"
    >
      <div className="relative shrink-0">
        <Radio className="w-5 h-5 text-green-600" />
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-green-700 dark:text-green-400 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" />
          Live Location Active
        </p>
        <p className="text-xs text-green-600 dark:text-green-500">
          {lastSent
            ? `Last sent at ${lastSent.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
            : "Acquiring GPS signal…"}
        </p>
      </div>
    </div>
  );
}
