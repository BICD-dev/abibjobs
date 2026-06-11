import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { Phone, PhoneOff, PhoneCall, Mic, MicOff, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export type CallPeer = { userId: string; name: string };
type CallStatus = "idle" | "outgoing" | "incoming" | "connecting" | "connected";

interface CallContextValue {
  startCall: (peer: CallPeer, jobId: number) => void;
  status: CallStatus;
  activeJobId: number | null;
}

const CallContext = createContext<CallContextValue | null>(null);

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used within a CallProvider");
  return ctx;
}

function formatDuration(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [status, setStatusState] = useState<CallStatus>("idle");
  const [peer, setPeer] = useState<CallPeer | null>(null);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const iceServersRef = useRef<RTCIceServer[] | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);
  const incomingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const peerRef = useRef<CallPeer | null>(null);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef<CallStatus>("idle");
  const handlerRef = useRef<(msg: any) => void>(() => {});
  const ringRef = useRef<{ stop: () => void } | null>(null);

  statusRef.current = status;
  peerRef.current = peer;

  const send = useCallback((payload: any) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  // Update both the state (for rendering) and the ref (for synchronous reads in
  // async handlers) so rapid events can't race past stale status guards.
  const setCallStatus = useCallback((s: CallStatus) => {
    statusRef.current = s;
    setStatusState(s);
  }, []);

  const clearTimers = useCallback(() => {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }
  }, []);

  const getIceServers = useCallback(async (): Promise<RTCIceServer[]> => {
    if (iceServersRef.current) return iceServersRef.current;
    try {
      const r = await fetch("/api/call/ice-servers", { credentials: "include" });
      const d = await r.json();
      iceServersRef.current = d.iceServers;
      return d.iceServers;
    } catch {
      return [{ urls: "stun:stun.l.google.com:19302" }];
    }
  }, []);

  const startRing = useCallback(() => {
    if (ringRef.current) return;
    try {
      const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      let stopped = false;
      const beep = () => {
        if (stopped) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 480;
        gain.gain.value = 0.12;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
        setTimeout(beep, 1300);
      };
      beep();
      ringRef.current = {
        stop: () => {
          stopped = true;
          ctx.close().catch(() => {});
        },
      };
    } catch {
      // ringtone is best-effort
    }
  }, []);

  const stopRing = useCallback(() => {
    ringRef.current?.stop();
    ringRef.current = null;
  }, []);

  const cleanup = useCallback(() => {
    stopRing();
    clearTimers();
    try {
      pcRef.current?.close();
    } catch {
      // ignore
    }
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    pendingCandidatesRef.current = [];
    remoteDescSetRef.current = false;
    incomingOfferRef.current = null;
    peerRef.current = null;
    setPeer(null);
    setActiveJobId(null);
    setMuted(false);
    setSeconds(0);
    setCallStatus("idle");
  }, [stopRing, clearTimers]);

  const flushCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    for (const c of pendingCandidatesRef.current) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        // ignore individual candidate errors
      }
    }
    pendingCandidatesRef.current = [];
  }, []);

  const createPeerConnection = useCallback(
    async (peerId: string) => {
      const iceServers = await getIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      pc.onicecandidate = (e) => {
        if (e.candidate) send({ type: "ice", toUserId: peerId, candidate: e.candidate });
      };
      pc.ontrack = (e) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = e.streams[0];
          remoteAudioRef.current.play().catch(() => {});
        }
      };
      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s === "connected") {
          clearTimers();
          stopRing();
          setCallStatus("connected");
        } else if (s === "failed") {
          toast({ title: "Call dropped", description: "The connection was lost.", variant: "destructive" });
          cleanup();
        } else if (s === "disconnected") {
          // A brief network blip can self-heal; only end if it stays down.
          if (!disconnectTimerRef.current) {
            disconnectTimerRef.current = setTimeout(() => {
              const cs = pcRef.current?.connectionState;
              if (cs === "disconnected" || cs === "failed") {
                toast({ title: "Call dropped", description: "The connection was lost.", variant: "destructive" });
                cleanup();
              }
            }, 10000);
          }
        }
      };
      pcRef.current = pc;
      return pc;
    },
    [getIceServers, send, stopRing, toast, cleanup, clearTimers]
  );

  const getMic = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    return stream;
  }, []);

  const startCall = useCallback(
    async (target: CallPeer, jobId: number) => {
      if (statusRef.current !== "idle") return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        toast({ title: "Connecting…", description: "Please try again in a moment.", variant: "destructive" });
        return;
      }
      setPeer(target);
      peerRef.current = target;
      setActiveJobId(jobId);
      setCallStatus("outgoing");
      try {
        const stream = await getMic();
        const pc = await createPeerConnection(target.userId);
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        send({ type: "call-offer", toUserId: target.userId, jobId, sdp: offer });
        // Stop ringing if the other side never picks up.
        ringTimeoutRef.current = setTimeout(() => {
          if (statusRef.current === "outgoing" || statusRef.current === "connecting") {
            send({ type: "call-end", toUserId: target.userId });
            toast({ title: "No answer", description: `${target.name} didn't pick up.` });
            cleanup();
          }
        }, 45000);
      } catch (err) {
        toast({
          title: "Microphone needed",
          description: "Allow microphone access to make a call.",
          variant: "destructive",
        });
        cleanup();
      }
    },
    [getMic, createPeerConnection, send, toast, cleanup]
  );

  const acceptCall = useCallback(async () => {
    const target = peerRef.current;
    const offer = incomingOfferRef.current;
    if (!target || !offer) return;
    stopRing();
    setCallStatus("connecting");
    try {
      const stream = await getMic();
      const pc = await createPeerConnection(target.userId);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      await pc.setRemoteDescription(offer);
      remoteDescSetRef.current = true;
      await flushCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({ type: "call-answer", toUserId: target.userId, sdp: answer });
    } catch (err) {
      toast({
        title: "Microphone needed",
        description: "Allow microphone access to take the call.",
        variant: "destructive",
      });
      if (target) send({ type: "call-reject", toUserId: target.userId });
      cleanup();
    }
  }, [getMic, createPeerConnection, flushCandidates, send, stopRing, toast, cleanup]);

  const rejectCall = useCallback(() => {
    const target = peerRef.current;
    if (target) send({ type: "call-reject", toUserId: target.userId });
    cleanup();
  }, [send, cleanup]);

  const hangUp = useCallback(() => {
    const target = peerRef.current;
    if (target) send({ type: "call-end", toUserId: target.userId });
    cleanup();
  }, [send, cleanup]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }, [muted]);

  // Keep the message handler fresh with latest closures.
  handlerRef.current = async (msg: any) => {
    switch (msg.type) {
      case "incoming-call": {
        if (statusRef.current !== "idle") {
          // Already busy locally — politely decline.
          send({ type: "call-reject", toUserId: msg.fromUserId });
          return;
        }
        const target = { userId: msg.fromUserId, name: msg.fromName || "Someone" };
        setPeer(target);
        peerRef.current = target;
        setActiveJobId(msg.jobId ?? null);
        incomingOfferRef.current = msg.sdp;
        setCallStatus("incoming");
        startRing();
        break;
      }
      case "call-answer": {
        if (msg.fromUserId !== peerRef.current?.userId) return;
        const pc = pcRef.current;
        if (!pc) return;
        try {
          await pc.setRemoteDescription(msg.sdp);
          remoteDescSetRef.current = true;
          await flushCandidates();
          clearTimers();
          stopRing();
          setCallStatus("connected");
        } catch {
          cleanup();
        }
        break;
      }
      case "ice": {
        if (msg.fromUserId !== peerRef.current?.userId) return;
        const pc = pcRef.current;
        if (pc && remoteDescSetRef.current) {
          try {
            await pc.addIceCandidate(msg.candidate);
          } catch {
            // ignore
          }
        } else {
          pendingCandidatesRef.current.push(msg.candidate);
        }
        break;
      }
      case "call-reject":
        if (msg.fromUserId !== peerRef.current?.userId) return;
        toast({ title: "Call declined", description: `${peerRef.current?.name || "They"} can't talk right now.` });
        cleanup();
        break;
      case "call-end":
        if (msg.fromUserId !== peerRef.current?.userId) return;
        cleanup();
        break;
      case "call-busy":
        toast({ title: "On another call", description: "This person is busy on another call." });
        cleanup();
        break;
      case "call-unavailable":
        toast({ title: "Unavailable", description: "This person isn't online right now." });
        cleanup();
        break;
      case "call-failed":
        toast({ title: "Couldn't start call", description: "Please try again." });
        cleanup();
        break;
      case "call-taken":
        // Another of my own tabs answered or rejected — stop ringing here.
        if (statusRef.current === "incoming") cleanup();
        break;
    }
  };

  // Manage the signaling WebSocket lifecycle.
  useEffect(() => {
    if (!isAuthenticated) return;
    let closed = false;
    let backoff = 1000;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws/call`);
      wsRef.current = ws;
      ws.onopen = () => {
        backoff = 1000;
      };
      ws.onmessage = (e) => {
        try {
          handlerRef.current(JSON.parse(e.data));
        } catch {
          // ignore malformed
        }
      };
      ws.onclose = () => {
        wsRef.current = null;
        if (!closed) {
          backoff = Math.min(backoff * 2, 15000);
          reconnectTimer = setTimeout(connect, backoff);
        }
      };
      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [isAuthenticated]);

  // Call duration timer.
  useEffect(() => {
    if (status !== "connected") return;
    setSeconds(0);
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  // End any active call if the user logs out / unmounts.
  useEffect(() => {
    if (!isAuthenticated && statusRef.current !== "idle") {
      cleanup();
    }
  }, [isAuthenticated, cleanup]);

  return (
    <CallContext.Provider value={{ startCall, status, activeJobId }}>
      {children}

      {/* Hidden element that plays the remote party's audio. */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" data-testid="audio-remote-call" />

      {/* Incoming call */}
      {status === "incoming" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-gray-900 p-8 shadow-2xl text-center" data-testid="modal-incoming-call">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
              <PhoneCall className="h-9 w-9 text-green-600 animate-pulse" />
            </div>
            <p className="text-sm text-muted-foreground">Incoming voice call</p>
            <h2 className="mt-1 text-2xl font-bold text-foreground" data-testid="text-incoming-caller">
              {peer?.name || "Someone"}
            </h2>
            <div className="mt-8 flex items-center justify-center gap-10">
              <button
                onClick={rejectCall}
                className="flex flex-col items-center gap-2"
                data-testid="button-decline-call"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-lg transition-colors">
                  <PhoneOff className="h-7 w-7" />
                </span>
                <span className="text-xs font-medium text-muted-foreground">Decline</span>
              </button>
              <button
                onClick={acceptCall}
                className="flex flex-col items-center gap-2"
                data-testid="button-accept-call"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white shadow-lg transition-colors">
                  <Phone className="h-7 w-7" />
                </span>
                <span className="text-xs font-medium text-muted-foreground">Accept</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Outgoing call */}
      {status === "outgoing" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-gray-900 p-8 shadow-2xl text-center" data-testid="modal-outgoing-call">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
              <PhoneCall className="h-9 w-9 text-green-600 animate-pulse" />
            </div>
            <p className="text-sm text-muted-foreground">Calling…</p>
            <h2 className="mt-1 text-2xl font-bold text-foreground" data-testid="text-outgoing-callee">
              {peer?.name || "…"}
            </h2>
            <button
              onClick={hangUp}
              className="mx-auto mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-lg transition-colors"
              data-testid="button-cancel-call"
            >
              <PhoneOff className="h-7 w-7" />
            </button>
          </div>
        </div>
      )}

      {/* Connecting (callee accepted, negotiating) */}
      {status === "connecting" && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-gray-900 p-8 shadow-2xl text-center" data-testid="modal-connecting-call">
            <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-green-600" />
            <p className="text-sm text-muted-foreground">Connecting…</p>
            <h2 className="mt-1 text-xl font-bold text-foreground">{peer?.name || ""}</h2>
          </div>
        </div>
      )}

      {/* In-call bar */}
      {status === "connected" && (
        <div className="fixed bottom-4 left-1/2 z-[100] w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-2xl bg-gray-900 dark:bg-gray-800 px-4 py-3 text-white shadow-2xl" data-testid="bar-active-call">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-600">
              <Phone className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold" data-testid="text-active-call-name">{peer?.name || "On call"}</p>
              <p className="text-xs text-gray-300" data-testid="text-call-duration">{formatDuration(seconds)}</p>
            </div>
            <button
              onClick={toggleMute}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                muted ? "bg-amber-500 hover:bg-amber-600" : "bg-white/15 hover:bg-white/25"
              }`}
              data-testid="button-toggle-mute"
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            <button
              onClick={hangUp}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600 hover:bg-red-700 active:bg-red-800 transition-colors"
              data-testid="button-hangup-call"
              aria-label="Hang up"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </CallContext.Provider>
  );
}
