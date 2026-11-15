import { apiFetch } from "@/lib/api";

interface Organization {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

export default async function OrganizationsPage() {
  const res = await apiFetch("/v1/organizations");
  const organizations: Organization[] = res.ok ? ((await res.json()) as Organization[]) : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Organizations</h1>
      <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Slug</th>
            <th className="px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {organizations.map((org) => (
            <tr key={org.id} className="border-t border-slate-100">
              <td className="px-4 py-2">{org.name}</td>
              <td className="px-4 py-2 text-slate-500">{org.slug}</td>
              <td className="px-4 py-2">{org.isActive ? "Active" : "Inactive"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
