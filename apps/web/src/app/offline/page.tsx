export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface-2 px-6 text-center">
      <h1 className="text-xl font-semibold text-ink">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-ink-2">
        This page hasn&apos;t been loaded before, so there&apos;s nothing cached to show without a connection.
        Reconnect and try again.
      </p>
    </div>
  );
}
