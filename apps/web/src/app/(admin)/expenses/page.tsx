import { apiFetch } from "@/lib/api";
import { CreateExpenseForm } from "./create-expense-form";

interface Outlet {
  id: string;
  name: string;
}

interface Expense {
  id: string;
  category: string;
  description: string | null;
  amount: string;
  incurredAt: string;
  outlet: { name: string } | null;
  recordedBy: { firstName: string; lastName: string };
}

export default async function ExpensesPage() {
  const [outletsRes, expensesRes] = await Promise.all([apiFetch("/v1/outlets"), apiFetch("/v1/expenses")]);
  const outlets: Outlet[] = outletsRes.ok ? await outletsRes.json() : [];
  const expenses: Expense[] = expensesRes.ok ? await expensesRes.json() : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Expenses</h1>
      <p className="mt-2 text-sm text-ink-2">
        Non-ingredient operating costs — rent, utilities, salaries and the like. Leave the outlet blank for an
        organization-wide expense (e.g. head office rent).
      </p>

      <div className="mt-4 rounded-lg border border-line bg-surface p-4">
        <CreateExpenseForm outlets={outlets} />
      </div>

      <table className="mt-4 w-full overflow-hidden rounded-lg border border-line bg-surface text-sm">
        <thead className="bg-surface-2 text-left text-ink-2">
          <tr>
            <th className="px-4 py-2">Date</th>
            <th className="px-4 py-2">Category</th>
            <th className="px-4 py-2">Description</th>
            <th className="px-4 py-2">Outlet</th>
            <th className="px-4 py-2">Amount</th>
            <th className="px-4 py-2">Recorded by</th>
          </tr>
        </thead>
        <tbody>
          {expenses.map((expense) => (
            <tr key={expense.id} className="border-t border-line">
              <td className="px-4 py-2 text-ink-2">{new Date(expense.incurredAt).toLocaleDateString()}</td>
              <td className="px-4 py-2 font-medium text-ink">{expense.category}</td>
              <td className="px-4 py-2 text-ink-2">{expense.description ?? "—"}</td>
              <td className="px-4 py-2 text-ink-2">{expense.outlet?.name ?? "Organization-wide"}</td>
              <td className="px-4 py-2 text-ink">₹{expense.amount}</td>
              <td className="px-4 py-2 text-ink-2">
                {expense.recordedBy.firstName} {expense.recordedBy.lastName}
              </td>
            </tr>
          ))}
          {expenses.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-ink-3">
                No expenses recorded yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
