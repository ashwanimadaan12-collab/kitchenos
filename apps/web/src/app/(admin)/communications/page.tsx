import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { ToggleActiveButton } from "@/components/toggle-active-button";
import { CreateTemplateForm } from "./create-template-form";

interface Brand {
  id: string;
  name: string;
}

interface CommunicationTemplate {
  id: string;
  channel: "WHATSAPP" | "SMS";
  purpose: "TRANSACTIONAL" | "PROMOTIONAL";
  key: string;
  name: string;
  body: string;
  providerTemplateName: string | null;
  isActive: boolean;
  brand: { name: string } | null;
}

export default async function CommunicationsPage() {
  const [brandsRes, templatesRes] = await Promise.all([apiFetch("/v1/brands"), apiFetch("/v1/communication-templates")]);
  const brands: Brand[] = brandsRes.ok ? await brandsRes.json() : [];
  const templates: CommunicationTemplate[] = templatesRes.ok ? await templatesRes.json() : [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Communication templates</h1>
        <Link href="/communications/messages" className="text-sm font-medium text-slate-600 hover:text-slate-900">
          View message history →
        </Link>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Approved WhatsApp/SMS message templates. A brand-specific template takes priority over the
        organization-wide default of the same key and channel — e.g. a Pizza Paproni-branded order confirmation
        instead of the generic one. WhatsApp only delivers pre-approved templates, so{" "}
        <span className="font-medium">Provider template name</span> is required for that channel.
      </p>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <CreateTemplateForm brands={brands} />
      </div>

      <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2">Key</th>
            <th className="px-4 py-2">Channel</th>
            <th className="px-4 py-2">Purpose</th>
            <th className="px-4 py-2">Brand</th>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {templates.map((template) => (
            <tr key={template.id} className="border-t border-slate-100">
              <td className="px-4 py-2 font-medium text-slate-900">{template.key}</td>
              <td className="px-4 py-2 text-slate-500">{template.channel}</td>
              <td className="px-4 py-2 text-slate-500">{template.purpose}</td>
              <td className="px-4 py-2 text-slate-500">{template.brand?.name ?? "All brands"}</td>
              <td className="px-4 py-2 text-slate-500">{template.name}</td>
              <td className="px-4 py-2">{template.isActive ? "Active" : "Inactive"}</td>
              <td className="px-4 py-2 text-right">
                <ToggleActiveButton path={`communication-templates/${template.id}`} isActive={template.isActive} />
              </td>
            </tr>
          ))}
          {templates.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                No communication templates yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
