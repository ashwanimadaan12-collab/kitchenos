import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { CreateEmployeeForm } from "./create-employee-form";

interface Outlet {
  id: string;
  name: string;
}

interface Employee {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  isActive: boolean;
  outlet: { name: string } | null;
}

export default async function EmployeesPage() {
  const [outletsRes, employeesRes] = await Promise.all([apiFetch("/v1/outlets"), apiFetch("/v1/employees")]);
  const outlets: Outlet[] = outletsRes.ok ? await outletsRes.json() : [];
  const employees: Employee[] = employeesRes.ok ? await employeesRes.json() : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Employees</h1>
      <p className="mt-2 text-sm text-ink-2">
        Staff records and a clock-in/clock-out log. No payroll calculation, shift scheduling or leave management
        here — open an employee to clock them in or out.
      </p>

      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <CreateEmployeeForm outlets={outlets} />
      </div>

      <table className="mt-4 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
        <thead className="bg-surface-2 text-left text-ink-2">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="px-4 py-2">Role</th>
            <th className="px-4 py-2">Outlet</th>
            <th className="px-4 py-2">Phone</th>
            <th className="px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <tr key={employee.id} className="border-t border-line">
              <td className="px-4 py-2 font-medium text-ink">
                <Link href={`/employees/${employee.id}`} className="hover:underline">
                  {employee.name}
                </Link>
              </td>
              <td className="px-4 py-2 text-ink-2">{employee.role}</td>
              <td className="px-4 py-2 text-ink-2">{employee.outlet?.name ?? "Organization-wide"}</td>
              <td className="px-4 py-2 text-ink-2">{employee.phone ?? "—"}</td>
              <td className="px-4 py-2">{employee.isActive ? "Active" : "Inactive"}</td>
            </tr>
          ))}
          {employees.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-ink-3">
                No employees yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
