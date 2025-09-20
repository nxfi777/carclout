"use client";
import LivestreamPanel from "@/components/livestream-panel";
import "@stream-io/video-react-sdk/dist/css/styles.css";

export default function LivePage() {
  return (
    <div className="container mx-auto py-4">
      <LivestreamPanel />
    </div>
  );
}


