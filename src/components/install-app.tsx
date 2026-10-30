"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "./ui";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const noop = () => () => {};
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * "Install the app" card: the browser's install prompt on Android/desktop Chrome and Edge,
 * Share → Add to Home Screen instructions on iPhone. Hidden once installed or dismissed.
 */
export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);
  const standalone = useSyncExternalStore(noop, isStandalone, () => true);
  const ios = useSyncExternalStore(noop, isIos, () => false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (standalone || hidden || (!prompt && !ios)) return null;

  return (
    <div className="flex animate-rise items-center gap-3 rounded-2xl border border-gold-400/50 bg-gold-400/10 p-3">
      <span aria-hidden className="text-2xl">
        📲
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-bold">Install Culé XI</p>
        <p className="text-ink-muted">
          {ios
            ? "Tap Share, then “Add to Home Screen”."
            : "One tap from your home screen, full screen, no browser bar."}
        </p>
      </div>
      {prompt ? (
        <Button
          type="button"
          className="shrink-0"
          onClick={async () => {
            await prompt.prompt();
            await prompt.userChoice;
            setPrompt(null);
          }}
        >
          Install
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="Dismiss"
          className="shrink-0 px-2 text-ink-muted"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/** Registers the service worker (production only, so local development isn't cached). */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
