"use client";
import React from "react";
import AppError from "@/components/app-error";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html>
      <body>
        <AppError
          title="Unexpected error"
          description="Something broke globally. You can retry or head back home."
          onRetry={() => reset()}
          details={process.env.NODE_ENV === "development" ? `${error.name}: ${error.message}${error.stack ? "\n\n" + error.stack : ""}` : undefined}
        />
      </body>
    </html>
  );
}


