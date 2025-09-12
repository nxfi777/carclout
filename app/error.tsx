"use client";
import React from "react";
import AppError from "@/components/app-error";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <AppError
      title="We hit a snag"
      description="The page failed to load correctly. You can retry or go back home."
      onRetry={() => reset()}
      details={process.env.NODE_ENV === "development" ? `${error.name}: ${error.message}${error.stack ? "\n\n" + error.stack : ""}` : undefined}
    />
  );
}


