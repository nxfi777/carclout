"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { resolveRecordId, isRecord } from "@/lib/records";
import {
  StreamVideoClient,
  StreamCall,
  StreamVideo,
  Call,
  SpeakerLayout,
  CallParticipantsList,
  LivestreamPlayer,
  StreamTheme,
  useCallStateHooks,
} from "@stream-io/video-react-sdk";
import "@stream-io/video-react-sdk/dist/css/styles.css";

type Me = { email?: string; role?: string };

export default function LivestreamPanel() {
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [_me, setMe] = useState<Me | null>(null);
  const [isCohost, setIsCohost] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const callType = "livestream";
  const [callId, setCallId] = useState<string>("carclout-global");
  const clientRef = useRef<StreamVideoClient | null>(null);
  const callRef = useRef<Call | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const me = await fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
        if (mounted) setMe({ email: me?.email, role: me?.role });

        // Determine cohost/admin first
        let cohost = false;
        try {
          const perms = await fetch("/api/livestream/permissions", { cache: "no-store" }).then((r) => r.json());
          cohost = !!perms?.isCohost || (me?.role === "admin");
          if (mounted) setIsCohost(cohost);
        } catch {}

        const tokenRes = await fetch("/api/stream/token", { cache: "no-store" }).then((r) => r.json());
        if (!tokenRes?.apiKey || !tokenRes?.token || !tokenRes?.userId) return;
        const c = new StreamVideoClient({ apiKey: tokenRes.apiKey, user: { id: tokenRes.userId }, token: tokenRes.token });
        if (!mounted) return;
        clientRef.current = c;

        // Resolve current session slug before creating/joining the call
        let sessionSlug = "carclout-global";
        try {
          const st = await fetch('/api/livestream/status', { cache: 'no-store' }).then(r=>r.json());
          sessionSlug = String(st?.sessionSlug || 'carclout-global');
        } catch {}
        if (mounted) setCallId(sessionSlug);

        if (cohost) {
          const callObj = c.call(callType as unknown as never, sessionSlug);
          // Prevent camera/mic prompts by default; publishers can enable later
          try { await callObj.camera.disable(); } catch {}
          try { await callObj.microphone.disable(); } catch {}
          await callObj.join({ create: true });
          callRef.current = callObj;
          if (mounted) setCall(callObj);
        }

        if (mounted) setClient(c);
      } catch {}
    })();
    return () => {
      mounted = false;
      try { callRef.current?.leave(); } catch {}
    };
  }, []);

  // Render viewer if not cohost/admin
  const viewer = useMemo(() => {
    if (!client) return null;
    return (
      <div className="w-full h-full">
        <LivestreamPlayer callType={callType as unknown as never} callId={callId} />
      </div>
    );
  }, [client, callId]);

  if (!client) return <div className="p-4">Connecting to livestream…</div>;

  return (
    <StreamTheme>
      <StreamVideo client={client}>
        {isCohost && call ? (
          <StreamCall call={call}>
            <div className="space-y-3">
              <SpeakerLayout />
              <div className="flex items-center gap-2">
                <GoLiveToggle call={call} />
                <RecorderControl call={call} />
                <button className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-sm" onClick={() => setShowChat(v=>!v)}>
                  {showChat ? 'Hide Chat' : 'Show Chat'}
                </button>
              </div>
              <div className="mt-2">
                <CallParticipantsList onClose={() => undefined} />
              </div>
            </div>
          </StreamCall>
        ) : (
          viewer
        )}
        {showChat ? (
          <div className="mt-4">
            <LivestreamChat initialSession={callId} />
          </div>
        ) : null}
      </StreamVideo>
    </StreamTheme>
  );
}

function GoLiveToggle({ call }: { call: Call }) {
  const { useIsCallLive, useParticipantCount } = useCallStateHooks();
  const isLive = useIsCallLive();
  const participants = useParticipantCount();
  async function toggle() {
    try {
      if (isLive) {
        await call.stopLive();
        await fetch('/api/livestream/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isLive: false }) });
      } else {
        await call.goLive();
        await fetch('/api/livestream/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isLive: true }) });
      }
    } catch {}
  }
  return (
    <button
      className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-sm"
      onClick={toggle}
    >
      {isLive ? `Stop Live (${participants})` : "Go Live"}
    </button>
  );
}

function RecorderControl({ call: _call }: { call: Call }) {
  const { useIsCallLive } = useCallStateHooks();
  const isLive = useIsCallLive();
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [_chunks, setChunks] = useState<Blob[]>([]);
  const [busy, setBusy] = useState(false);

  const [startAt, setStartAt] = useState<string | null>(null);

  async function start() {
    if (rec) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }).catch(async () => {
        return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      });
      const mr = new MediaRecorder(stream, { mimeType: "video/webm" });
      const localChunks: Blob[] = [];
      mr.ondataavailable = (e) => { if (e.data?.size > 0) localChunks.push(e.data); };
      mr.onstop = async () => {
        setBusy(true);
        try {
          const blob = new Blob(localChunks, { type: "video/webm" });
          // Create thumbnail from first frame
          const thumb = await createThumbnailFromBlob(blob);
          await uploadLivestreamRecording(blob, thumb, { startAt: startAt || undefined });
        } finally {
          setBusy(false);
          setChunks([]);
          setRec(null);
          setStartAt(null);
        }
      };
      setChunks(localChunks);
      setRec(mr);
      setStartAt(new Date().toISOString());
      mr.start();
    } catch {}
  }

  function stop() {
    try { rec?.stop(); } catch {}
  }

  return (
    <div className="inline-flex items-center gap-2">
      {rec ? (
        <button className="px-3 py-1.5 rounded bg-red-500/20 hover:bg-red-500/30 text-sm" onClick={stop} disabled={busy}>
          Stop Recording
        </button>
      ) : (
        <button className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-sm" onClick={start} disabled={!isLive || busy}>
          Record Livestream
        </button>
      )}
    </div>
  );
}

async function createThumbnailFromBlob(videoBlob: Blob): Promise<File> {
  return new Promise(async (resolve) => {
    const url = URL.createObjectURL(videoBlob);
    const video = document.createElement("video");
    video.src = url;
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.addEventListener("loadeddata", () => {
      try {
        video.currentTime = 0.1;
      } catch {}
    });
    video.addEventListener("seeked", () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(new File([new Blob()], "thumb.jpg", { type: "image/jpeg" }));
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => {
        resolve(new File([b || new Blob()], "thumb.jpg", { type: "image/jpeg" }));
        URL.revokeObjectURL(url);
      }, "image/jpeg", 0.8);
    });
  });
}

async function uploadLivestreamRecording(videoBlob: Blob, thumbFile: File, opts?: { startAt?: string }) {
  // Upload as admin bundle under admin/livestreams/<slug>
  const slug = `ls-${Date.now()}`;
  const formThumb = new FormData();
  formThumb.append("file", thumbFile, "thumb.jpg");
  formThumb.append("path", `livestreams/${slug}`);
  formThumb.append("scope", "admin");
  await fetch("/api/storage/upload", { method: "POST", body: formThumb }).then((r) => r.json());

  const videoFile = new File([videoBlob], "video.webm", { type: "video/webm" });
  const formVideo = new FormData();
  formVideo.append("file", videoFile, "video.webm");
  formVideo.append("path", `livestreams/${slug}`);
  formVideo.append("scope", "admin");
  await fetch("/api/storage/upload", { method: "POST", body: formVideo }).then((r) => r.json());

  // Register metadata and chat linkage
  try {
    await fetch("/api/livestream/recordings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, videoKey: `admin/livestreams/${slug}/video.webm`, thumbKey: `admin/livestreams/${slug}/thumb.jpg`, startAt: opts?.startAt, endAt: new Date().toISOString() }) });
  } catch {}
}

function LivestreamChat({ initialSession }: { initialSession?: string }) {
  const [messages, setMessages] = useState<Array<{ id?: string; text: string; userName: string; created_at?: string }>>([]);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [sessionSlug, _setSessionSlug] = useState<string>(initialSession || 'carclout-global');
  useEffect(() => {
    let es: EventSource | null = null;
    let mounted = true;
    (async () => {
      try {
        const snap = await fetch(`/api/chat/messages?channel=${encodeURIComponent(sessionSlug)}`).then((r) => r.json());
        if (mounted) setMessages((snap.messages || []).map((m: { id?: string; text: string; userName?: string; userEmail?: string; created_at?: string }) => ({ ...m })));
      } catch {}
      es = new EventSource(`/api/chat/live?channel=${encodeURIComponent(sessionSlug)}`);
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          const action = typeof data?.action === "string" ? data.action.toLowerCase() : "update";
          const before = isRecord(data?.before) ? data.before : null;
          const after = isRecord(data?.after) ? data.after : null;

          if (action === "delete") {
            const id = resolveRecordId(before?.id ?? after?.id);
            if (!id) return;
            setMessages((prev) => prev.filter((m) => m.id !== id));
            return;
          }

          let row = after;
          if (!row) {
            const raw = isRecord(data?.raw) ? data.raw : null;
            if (isRecord(raw?.after)) row = raw.after;
            else if (isRecord(raw?.result)) row = raw.result;
            else if (isRecord(raw?.record)) row = raw.record;
            else if (Array.isArray(raw?.result) && isRecord(raw?.result[0])) row = raw.result[0];
            else if (isRecord(raw)) row = raw;
          }
          if (!isRecord(row)) return;

          const text = typeof row.text === "string" ? row.text : "";
          const attachments = Array.isArray(row.attachments) ? row.attachments.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, 6) : [];
          const hasVisibleText = text.replace(/\u200B/g, "").trim().length > 0;
          if (!hasVisibleText && attachments.length === 0) return;

          const id = resolveRecordId(row.id);
          if (!id) return;

          const userName = typeof row.userName === "string" && row.userName.length
            ? row.userName
            : typeof row.userEmail === "string"
              ? row.userEmail
              : "user";

          setMessages((prev) => {
            const next = [...prev];
            const idx = next.findIndex((m) => m.id === id);
            const base = { id, text, userName, created_at: typeof row.created_at === "string" ? row.created_at : undefined };
            if (idx >= 0) {
              next[idx] = { ...next[idx], ...base };
            } else {
              next.push(base);
            }
            return next;
          });
        } catch {}
      };
      es.onerror = () => { try { es?.close(); } catch {} };
    })();
    return () => { mounted = false; try { es?.close(); } catch {} };
  }, [sessionSlug]);

  async function send() {
    const t = text.trim();
    if (!t) return;
    setSending(true);
    setText("");
    try { await fetch("/api/chat/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel: sessionSlug, text: t }) }); } catch {}
    setSending(false);
  }

  return (
    <div className="border rounded p-2 max-h-[40vh] overflow-y-auto">
      <div className="space-y-1">
        {messages.map((m) => (
          <div key={m.id || Math.random()} className="text-sm"><span className="text-white/60 mr-1">{m.userName}</span>{m.text}</div>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <input className="flex-1 rounded bg-white/5 px-2 py-1 text-sm" placeholder="Message #livestream" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="px-3 py-1 rounded bg-primary text-black text-sm" onClick={send} disabled={sending}>Send</button>
      </div>
    </div>
  );
}


