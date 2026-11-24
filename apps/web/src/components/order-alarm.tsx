"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Icon, Select } from "@kitchenos/ui";
import {
  SOUND_LABEL,
  patternLength,
  playPattern,
  type SoundId,
} from "@/lib/alarm-sounds";
import { SOURCE_LABEL, resolveOrderSource, type OrderSource } from "@/lib/order-source";

interface WatchedOrder {
  id: string;
  orderNumber: number;
  channel: string;
  total: string;
  createdByUserId?: string | null;
  tableId?: string | null;
  outlet: { name: string };
}

interface PendingAlert {
  id: string;
  orderNumber: number;
  source: OrderSource;
  outletName: string;
  total: string;
}

interface AlarmSettings {
  enabled: boolean;
  volume: number;
  /** How many times the tone repeats for one order before it gives up. */
  repeats: number;
  sounds: Record<OrderSource, SoundId>;
}

const STORAGE_KEY = "kitchenos.alarm.v1";
const POLL_MS = 10_000;

/** Different rhythm per source, so the two that matter most — a delivery app and
 *  your own website — never sound alike. */
const DEFAULT_SETTINGS: AlarmSettings = {
  enabled: false,
  volume: 0.8,
  repeats: 3,
  sounds: {
    delivery: "siren",
    online: "chime",
    qr_table: "bell",
    parcel: "ping",
    pos: "ping",
  },
};

const SOURCE_ORDER: OrderSource[] = ["delivery", "online", "qr_table", "parcel", "pos"];
const SOUND_IDS: SoundId[] = ["bell", "siren", "chime", "buzz", "ping"];

function loadSettings(): AlarmSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AlarmSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      sounds: { ...DEFAULT_SETTINGS.sounds, ...(parsed.sounds ?? {}) },
    };
  } catch {
    // A corrupt or unreadable value must never stop the alarm from working.
    return DEFAULT_SETTINGS;
  }
}

function rupees(amount: string): string {
  const n = Number(amount);
  return Number.isFinite(n) ? "₹" + Math.round(n).toLocaleString("en-IN") : "₹0";
}

/**
 * Watches for orders the staff have not seen yet and makes noise about them.
 *
 * It polls rather than holding a socket open: a restaurant tablet on patchy
 * 4G drops a websocket constantly, and a 10-second poll that always recovers
 * beats a live connection that silently dies mid-rush.
 */
export function OrderAlarm() {
  const [settings, setSettings] = useState<AlarmSettings>(DEFAULT_SETTINGS);
  const [alerts, setAlerts] = useState<PendingAlert[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pollFailed, setPollFailed] = useState(false);

  const audioRef = useRef<AudioContext | null>(null);
  const seenRef = useRef<Set<string> | null>(null);
  const baseTitleRef = useRef<string>("");

  useEffect(() => {
    setSettings(loadSettings());
    baseTitleRef.current = document.title;
  }, []);

  const persist = useCallback((next: AlarmSettings) => {
    setSettings(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private-browsing or a full quota: the alarm still works this session.
    }
  }, []);

  const ring = useCallback(
    (source: OrderSource) => {
      const ctx = audioRef.current;
      if (!ctx) return;
      // Browsers suspend the context when the tab is backgrounded.
      if (ctx.state === "suspended") void ctx.resume();

      const sound = settings.sounds[source];
      const gap = patternLength(sound);
      for (let i = 0; i < Math.max(1, settings.repeats); i += 1) {
        playPattern(ctx, sound, settings.volume, i * gap);
      }
    },
    [settings],
  );

  const notify = useCallback((alert: PendingAlert) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    new Notification(`Naya order #${alert.orderNumber}`, {
      body: `${SOURCE_LABEL[alert.source]} · ${alert.outletName} · ${rupees(alert.total)}`,
      tag: alert.id,
    });
  }, []);

  /** Turning it on needs a real tap: every browser blocks audio until then. */
  async function enable() {
    try {
      const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = audioRef.current ?? new Ctor();
      audioRef.current = ctx;
      await ctx.resume();
      playPattern(ctx, settings.sounds.online, settings.volume);
    } catch {
      // No audio on this device — the banner and notification still fire.
    }

    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    persist({ ...settings, enabled: true });
  }

  function disable() {
    persist({ ...settings, enabled: false });
    setAlerts([]);
  }

  // Poll for orders nobody has acknowledged yet.
  useEffect(() => {
    if (!settings.enabled) return;
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch("/api/catalog/orders?status=OPEN", { cache: "no-store" });
        if (!res.ok) {
          setPollFailed(true);
          return;
        }
        setPollFailed(false);
        const orders = (await res.json()) as WatchedOrder[];
        if (cancelled) return;

        // The first poll only records what is already there, so switching the
        // alarm on doesn't set off every order currently open.
        if (seenRef.current === null) {
          seenRef.current = new Set(orders.map((o) => o.id));
          return;
        }

        const fresh = orders.filter((o) => !seenRef.current?.has(o.id));
        for (const o of orders) seenRef.current.add(o.id);
        if (fresh.length === 0) return;

        const newAlerts: PendingAlert[] = fresh.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          source: resolveOrderSource(o),
          outletName: o.outlet?.name ?? "",
          total: o.total,
        }));

        setAlerts((prev) => [...newAlerts, ...prev].slice(0, 12));
        // One tone per distinct source, not one per order: four Zomato orders
        // landing together should not play the siren four times over.
        for (const source of new Set(newAlerts.map((a) => a.source))) ring(source);
        for (const alert of newAlerts) notify(alert);
      } catch {
        setPollFailed(true);
      }
    }

    void tick();
    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [settings.enabled, ring, notify]);

  // Unseen orders go in the tab title too — the staff tablet usually has the
  // POS in one tab and something else in front.
  useEffect(() => {
    const base = baseTitleRef.current || "KitchenOS";
    document.title = alerts.length > 0 ? `(${alerts.length}) Naya order — ${base}` : base;
  }, [alerts.length]);

  return (
    <>
      {alerts.length > 0 ? (
        <div
          role="alert"
          aria-live="assertive"
          className="flex flex-wrap items-center gap-3 border-b-2 border-bad bg-bad-tint px-5 py-3 sm:px-7"
        >
          <span className="text-bad">
            <Icon name="alert" size={22} strokeWidth={2.2} />
          </span>
          <p className="font-display text-base font-bold text-ink">
            {alerts.length} naya order aaya hai
          </p>
          <ul className="flex flex-wrap items-center gap-2">
            {alerts.slice(0, 4).map((a) => (
              <li key={a.id}>
                <a
                  href={`/pos/orders/${a.id}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-sm font-bold text-ink no-underline"
                >
                  <span className="tnum">#{a.orderNumber}</span>
                  <Badge tone="brand">{SOURCE_LABEL[a.source]}</Badge>
                  <span className="tnum text-ink-2">{rupees(a.total)}</span>
                </a>
              </li>
            ))}
          </ul>
          <Button variant="secondary" size="sm" className="ml-auto" onClick={() => setAlerts([])}>
            Samajh gaya — awaaz band
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface-2 px-5 py-2 sm:px-7">
        {settings.enabled ? (
          <>
            <span className="inline-flex items-center gap-2 text-sm font-bold text-good">
              <span className="h-2 w-2 rounded-full bg-good" aria-hidden="true" />
              Order alarm chalu hai
            </span>
            {pollFailed ? (
              <span className="text-sm font-semibold text-warn">
                Server se baat nahi ho rahi — net check karo
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              aria-expanded={settingsOpen}
              className="ml-auto inline-flex min-h-11 items-center gap-2 text-sm font-bold text-ink-2 hover:text-ink"
            >
              <Icon name="settings" size={16} />
              Awaaz badlo
            </button>
            <Button variant="ghost" size="sm" onClick={disable}>
              Alarm band karo
            </Button>
          </>
        ) : (
          <>
            <span className="text-sm font-medium text-ink-2">
              Naye order ki awaaz band hai. Is device pe chalu karo — Zomato, website aur table ke QR
              ki awaaz alag-alag hogi.
            </span>
            <Button size="sm" className="ml-auto" onClick={enable}>
              Alarm chalu karo
            </Button>
          </>
        )}
      </div>

      {settingsOpen && settings.enabled ? (
        <div className="border-b border-line bg-surface px-5 py-5 sm:px-7">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {SOURCE_ORDER.map((source) => (
              <div key={source} className="flex flex-wrap items-center gap-3">
                <span className="w-32 text-sm font-bold text-ink">{SOURCE_LABEL[source]}</span>
                <Select
                  aria-label={`${SOURCE_LABEL[source]} ki awaaz`}
                  value={settings.sounds[source]}
                  onChange={(e) =>
                    persist({
                      ...settings,
                      sounds: { ...settings.sounds, [source]: e.target.value as SoundId },
                    })
                  }
                  options={SOUND_IDS.map((id) => ({ value: id, label: SOUND_LABEL[id] }))}
                />
                <Button variant="secondary" size="sm" onClick={() => ring(source)}>
                  Suno
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-6 border-t border-line pt-4">
            <div className="flex items-center gap-3">
              <label htmlFor="alarm-volume" className="text-sm font-bold text-ink">
                Awaaz
              </label>
              <input
                id="alarm-volume"
                type="range"
                min={0.1}
                max={1}
                step={0.1}
                value={settings.volume}
                onChange={(e) => persist({ ...settings, volume: Number(e.target.value) })}
              />
              <span className="tnum text-sm text-ink-2">{Math.round(settings.volume * 100)}%</span>
            </div>

            <div className="flex items-center gap-3">
              <label htmlFor="alarm-repeats" className="text-sm font-bold text-ink">
                Kitni baar bajey
              </label>
              <Select
                id="alarm-repeats"
                value={String(settings.repeats)}
                onChange={(e) => persist({ ...settings, repeats: Number(e.target.value) })}
                options={[1, 2, 3, 5, 8].map((n) => ({ value: String(n), label: `${n} baar` }))}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
