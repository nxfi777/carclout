"use client";
import { useEffect, useState } from "react";
import { StreamVideoClient, StreamCall, Call, CallControls, CallParticipantsList, SpeakerLayout } from "@stream-io/video-react-sdk";
import "@stream-io/video-react-sdk/dist/css/styles.css";

export default function LivePage() {
  const [client, setClient] = useState<StreamVideoClient | null>(null);
  const [call, setCall] = useState<Call | null>(null);

  useEffect(() => {
    let mounted = true;
    async function init() {
      const res = await fetch("/api/stream/token");
      const data = await res.json();
      if (!data.apiKey || !data.token) return;
      const c = new StreamVideoClient({ apiKey: data.apiKey, user: { id: data.userId }, token: data.token });
      if (!mounted) return;
      const call = c.call("default", "ignite-live");
      await call.join({ create: true });
      setClient(c);
      setCall(call);
    }
    init();
    return () => { mounted = false; call?.leave(); };
  }, []);

  if (!client || !call) return <div className="container mx-auto py-10">Connecting to live…</div>;
  return (
    <div className="container mx-auto py-4">
      <StreamCall call={call}>
        <SpeakerLayout />
        <div className="mt-2">
          <CallControls />
        </div>
        <div className="mt-4">
          <CallParticipantsList onClose={()=>{}} />
        </div>
      </StreamCall>
    </div>
  );
}


