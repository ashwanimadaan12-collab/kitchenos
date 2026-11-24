import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { ToggleActiveButton } from "@/components/toggle-active-button";
import { ClockButton } from "./clock-button";

interface EmployeeDetail {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  email: string | null;
  hireDate: string;
  isActive: boolean;
  outlet: { name: string } | null;
}

interface AttendanceRecord {
  id: string;
  clockIn: string;
  clockOut: string | null;
}

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [employeeRes, attendanceRes] = await Promise.all([
    apiFetch(`/v1/employees/${id}`),
    apiFetch(`/v1/employees/${id}/attendance`),
  ]);
  if (employeeRes.status === 404) notFound();
  if (!employeeRes.ok) throw new Error("Failed to load employee");
  const employee: EmployeeDetail = await employeeRes.json();
  const attendance: AttendanceRecord[] = attendanceRes.ok ? await attendanceRes.json() : [];

  const isClockedIn = attendance.some((a) => a.clockOut === null);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{employee.name}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {employee.role} · {employee.outlet?.name ?? "Organization-wide"} · {employee.isActive ? "Active" : "Inactive"}
          </p>
        </div>
        <div className="flex gap-2">
          <ClockButton employeeId={employee.id} isClockedIn={isClockedIn} />
          <ToggleActiveButton path={`employees/${employee.id}`} isActive={employee.isActive} />
        </div>
      </div>

      <table className="mt-6 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
        <thead className="bg-surface-2 text-left text-ink-2">
          <tr>
            <th className="px-4 py-2">Clock in</th>
            <th className="px-4 py-2">Clock out</th>
          </tr>
        </thead>
        <tbody>
          {attendance.map((record) => (
            <tr key={record.id} className="border-t border-line">
              <td className="px-4 py-2 font-medium text-ink">{new Date(record.clockIn).toLocaleString()}</td>
              <td className="px-4 py-2 text-ink-2">
                {record.clockOut ? new Date(record.clockOut).toLocaleString() : "Still clocked in"}
              </td>
            </tr>
          ))}
          {attendance.length === 0 ? (
            <tr>
              <td colSpan={2} className="px-4 py-6 text-center text-ink-3">
                No attendance recorded yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
