import { QuickSetupWizard } from "./quick-setup-wizard";

export default function QuickSetupPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold text-ink">Quick Setup</h1>
      <p className="mt-1 text-sm text-ink-2">
        Apna restaurant 2 minute me set up karo — baaki sab hum khud bana denge.
      </p>
      <QuickSetupWizard />
    </div>
  );
}
