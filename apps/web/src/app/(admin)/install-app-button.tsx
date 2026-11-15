"use client";

import { useEffect, useState } from "react";
import { Button } from "@kitchenos/ui";

/** Minimal shape of the non-standard `beforeinstallprompt` event (Chrome/Edge/Android — no official DOM lib typing). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Chrome/Edge/Android fire `beforeinstallprompt` once the manifest + service-worker install
 * criteria are met, but only if the page calls `.prompt()` from a user gesture — there's no
 * automatic browser UI to point people at, so this button is the only way to surface it. Safari
 * (iOS/iPadOS/macOS) never fires this event at all; there, installing is Share -> "Add to Home
 * Screen", which can't be triggered programmatically, so the button simply never appears there.
 */
export function InstallAppButton() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setInstallEvent(null);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!installEvent || installed) return null;

  return (
    <Button
      variant="secondary"
      onClick={async () => {
        await installEvent.prompt();
        await installEvent.userChoice;
        setInstallEvent(null);
      }}
    >
      Install app
    </Button>
  );
}
