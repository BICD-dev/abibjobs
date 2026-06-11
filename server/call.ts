import type { Server, IncomingMessage } from "http";
import type { Socket } from "net";
import { WebSocketServer, WebSocket } from "ws";
import { getSession } from "./replit_integrations/auth";
import { storage } from "./storage";

interface CallSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

type SignalMessage = {
  type: string;
  toUserId?: string;
  jobId?: number;
  sdp?: any;
  candidate?: any;
};

// userId -> set of open sockets (supports multiple tabs/devices)
const userSockets = new Map<string, Set<CallSocket>>();
// Bidirectional allow-list of who may exchange signaling with whom.
// Populated only after a call-offer is authorized against a shared in_progress job.
const allowed = new Map<string, Set<string>>();
// userId -> peerId for calls that have been answered (used for busy detection)
const inCallWith = new Map<string, string>();

function addAllowed(a: string, b: string) {
  if (!allowed.has(a)) allowed.set(a, new Set());
  if (!allowed.has(b)) allowed.set(b, new Set());
  allowed.get(a)!.add(b);
  allowed.get(b)!.add(a);
}

function removeAllowed(a: string, b: string) {
  allowed.get(a)?.delete(b);
  allowed.get(b)?.delete(a);
  if (allowed.get(a)?.size === 0) allowed.delete(a);
  if (allowed.get(b)?.size === 0) allowed.delete(b);
}

function isAllowed(a: string, b: string) {
  return !!allowed.get(a)?.has(b);
}

function clearCall(a: string, b: string) {
  removeAllowed(a, b);
  if (inCallWith.get(a) === b) inCallWith.delete(a);
  if (inCallWith.get(b) === a) inCallWith.delete(b);
}

function sendToUser(userId: string, payload: any, exclude?: CallSocket): boolean {
  const set = userSockets.get(userId);
  if (!set || set.size === 0) return false;
  const data = JSON.stringify(payload);
  let sent = false;
  set.forEach((ws) => {
    if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
      sent = true;
    }
  });
  return sent;
}

function sendToSocket(ws: CallSocket, payload: any) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

export function setupCallSignaling(httpServer: Server) {
  const wss = new WebSocketServer({ noServer: true });
  const sessionMiddleware = getSession();

  // Scope our upgrade handling strictly to /ws/call so we never interfere
  // with Vite's HMR websocket (which shares this same httpServer).
  httpServer.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
    let pathname = "";
    try {
      pathname = new URL(req.url || "", `http://${req.headers.host}`).pathname;
    } catch {
      return;
    }
    if (pathname !== "/ws/call") {
      // In production, Vite HMR isn't sharing this server, so any other upgrade
      // is unexpected — destroy it rather than leaking the socket. In dev we let
      // Vite's own upgrade handler process HMR connections.
      if (process.env.NODE_ENV === "production") socket.destroy();
      return;
    }

    // Reuse the existing express-session middleware to resolve the user from
    // the signed session cookie. Supports both OIDC (passport) and manual auth.
    sessionMiddleware(req as any, {} as any, () => {
      const sess: any = (req as any).session;
      const userId: string | undefined =
        sess?.manualUserId || sess?.passport?.user?.claims?.sub;
      if (!userId) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        (ws as CallSocket).userId = userId;
        wss.emit("connection", ws, req);
      });
    });
  });

  wss.on("connection", (ws: CallSocket) => {
    const userId = ws.userId!;
    ws.isAlive = true;

    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId)!.add(ws);

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", async (raw) => {
      let msg: SignalMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const to = msg.toUserId;

      switch (msg.type) {
        case "call-offer": {
          if (!to || !msg.jobId) return;
          // Authorize: caller & callee must both be participants of an
          // in_progress job. This is the security boundary — without it any
          // user could ring/probe any other user.
          try {
            const job = await storage.getJob(Number(msg.jobId));
            if (!job || job.status !== "in_progress") {
              sendToSocket(ws, { type: "call-failed", reason: "job-inactive", toUserId: to });
              return;
            }
            const workerIds = job.workerId
              ? job.workerId.split(",").map((s) => s.trim()).filter(Boolean)
              : [];
            const participants = new Set<string>([job.posterId, ...workerIds]);
            if (!participants.has(userId) || !participants.has(to)) {
              sendToSocket(ws, { type: "call-failed", reason: "not-authorized", toUserId: to });
              return;
            }
          } catch {
            sendToSocket(ws, { type: "call-failed", reason: "error", toUserId: to });
            return;
          }

          if (inCallWith.has(to)) {
            sendToSocket(ws, { type: "call-busy", toUserId: to });
            return;
          }
          if (!userSockets.get(to)?.size) {
            sendToSocket(ws, { type: "call-unavailable", toUserId: to });
            return;
          }

          addAllowed(userId, to);

          let fromName = "Someone";
          try {
            const u = await storage.getUser(userId);
            fromName =
              u?.name ||
              (u?.firstName ? `${u.firstName} ${u.lastName || ""}`.trim() : "Someone");
          } catch {
            // keep default name
          }

          sendToUser(to, {
            type: "incoming-call",
            fromUserId: userId,
            fromName,
            jobId: msg.jobId,
            sdp: msg.sdp,
          });
          break;
        }

        case "call-answer": {
          if (!to || !isAllowed(userId, to)) return;
          inCallWith.set(userId, to);
          inCallWith.set(to, userId);
          sendToUser(to, { type: "call-answer", fromUserId: userId, sdp: msg.sdp });
          // Stop the call ringing on this user's other tabs/devices.
          sendToUser(userId, { type: "call-taken", fromUserId: to }, ws);
          break;
        }

        case "ice": {
          if (!to || !isAllowed(userId, to)) return;
          sendToUser(to, { type: "ice", fromUserId: userId, candidate: msg.candidate });
          break;
        }

        case "call-reject": {
          if (!to || !isAllowed(userId, to)) return;
          sendToUser(to, { type: "call-reject", fromUserId: userId });
          // Stop ringing on the rejecter's other tabs.
          sendToUser(userId, { type: "call-taken", fromUserId: to }, ws);
          clearCall(userId, to);
          break;
        }

        case "call-end": {
          if (!to || !isAllowed(userId, to)) return;
          sendToUser(to, { type: "call-end", fromUserId: userId });
          clearCall(userId, to);
          break;
        }
      }
    });

    ws.on("close", () => {
      const set = userSockets.get(userId);
      set?.delete(ws);
      const stillConnected = !!set && set.size > 0;
      if (!stillConnected) {
        userSockets.delete(userId);
        // If the user fully disconnected mid-call, tell the peer it ended.
        const peer = inCallWith.get(userId);
        if (peer) {
          sendToUser(peer, { type: "call-end", fromUserId: userId });
          clearCall(userId, peer);
        }
        // Clean up any pending (unanswered) allow-list relationships.
        const peers = allowed.get(userId);
        if (peers) {
          for (const p of Array.from(peers)) {
            sendToUser(p, { type: "call-end", fromUserId: userId });
            removeAllowed(userId, p);
          }
        }
      }
    });
  });

  // Heartbeat: drop dead connections so presence/busy state stays accurate.
  const interval = setInterval(() => {
    wss.clients.forEach((client) => {
      const ws = client as CallSocket;
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        // ignore
      }
    });
  }, 30000);

  wss.on("close", () => clearInterval(interval));
}
