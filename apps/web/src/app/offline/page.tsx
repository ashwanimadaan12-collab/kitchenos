export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-6 text-center">
      <h1 className="text-xl font-semibold text-slate-900">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-slate-600">
        This page hasn&apos;t been loaded before, so there&apos;s nothing cached to show without a connection.
        Reconnect and try again.
      </p>
    </div>
  );
}
