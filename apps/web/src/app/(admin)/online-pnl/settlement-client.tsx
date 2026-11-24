"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  COLUMN_ROLE_LABEL,
  guessMapping,
  mapRows,
  rowsThatDoNotAddUp,
  summarise,
  type ColumnMapping,
  type ColumnRole,
  type RawRow,
  type SettlementRow,
} from "@kitchenos/shared";
import { Badge, Button, Card, CardHeader, Icon, Select, StatTile, TableBox, TD, TH, TR } from "@kitchenos/ui";

type Platform = "zomato" | "swiggy" | "other";

const PLATFORM_LABEL: Record<Platform, string> = {
  zomato: "Zomato",
  swiggy: "Swiggy",
  other: "Koi aur",
};

const ROLES: ColumnRole[] = [
  "externalOrderId",
  "orderedAt",
  "grossSales",
  "restaurantDiscount",
  "commission",
  "platformFees",
  "taxesWithheld",
  "otherAdjustments",
  "netPayout",
];

const MAPPING_KEY = "kitchenos.settlement.mapping.v1.";

function rupees(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`;
}

function loadMapping(platform: Platform): ColumnMapping | null {
  try {
    const raw = window.localStorage.getItem(MAPPING_KEY + platform);
    return raw ? (JSON.parse(raw) as ColumnMapping) : null;
  } catch {
    return null;
  }
}

function saveMapping(platform: Platform, mapping: ColumnMapping) {
  try {
    window.localStorage.setItem(MAPPING_KEY + platform, JSON.stringify(mapping));
  } catch {
    // Nothing breaks without it — next month's mapping is guessed again.
  }
}

/**
 * Reads a settlement export and shows what the platform actually paid.
 *
 * The file is parsed in the browser and never leaves it: a payout report names
 * every order and what was earned on it, and there is no reason to send that
 * anywhere to add up some columns.
 *
 * Column names differ between the two platforms and change between exports, so
 * the mapping is guessed, shown, and correctable — and remembered per platform,
 * so the month after is one click.
 */
export function SettlementClient() {
  const router = useRouter();
  const [platform, setPlatform] = useState<Platform>("zomato");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const rows: SettlementRow[] = useMemo(
    () => (rawRows.length > 0 ? mapRows(rawRows, mapping) : []),
    [rawRows, mapping],
  );
  const summary = useMemo(() => summarise(rows), [rows]);
  const oddRows = useMemo(() => rowsThatDoNotAddUp(rows), [rows]);

  async function onFile(file: File) {
    setError(null);
    setIsReading(true);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const book = XLSX.read(buffer, { type: "array" });
      const sheetName = book.SheetNames[0];
      if (!sheetName) {
        setError("Is file me koi sheet nahi mili.");
        return;
      }
      const sheet = book.Sheets[sheetName];
      if (!sheet) {
        setError("Sheet padhi nahi ja saki.");
        return;
      }
      const parsed = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "" });
      if (parsed.length === 0) {
        setError("File me koi row nahi hai.");
        return;
      }
      const cols = Object.keys(parsed[0] ?? {});
      setHeaders(cols);
      setRawRows(parsed);
      setFileName(file.name);
      // A saved mapping only applies if its columns are still in the file —
      // the platform may have changed its export since last month.
      const saved = loadMapping(platform);
      const savedFits =
        saved && Object.values(saved).every((c) => !c || cols.includes(c)) && Object.keys(saved).length > 0;
      setMapping(savedFits ? saved : guessMapping(cols));
    } catch {
      setError("Ye file padh nahi paye. .xlsx ya .csv try karo.");
    } finally {
      setIsReading(false);
    }
  }

  /** Only the rows go up; the server adds them back up itself, so a saved
   *  settlement can never disagree with the screen that produced it. */
  async function save() {
    setSaveError(null);
    setIsSaving(true);
    try {
      const res = await fetch("/api/catalog/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: platform.toUpperCase(),
          fileName: fileName ?? "settlement",
          rows: rows.map((r) => ({
            externalOrderId: r.externalOrderId,
            orderedAt: r.orderedAt && !Number.isNaN(Date.parse(r.orderedAt)) ? r.orderedAt : null,
            grossSales: r.grossSales,
            restaurantDiscount: r.restaurantDiscount,
            commission: r.commission,
            platformFees: r.platformFees,
            taxesWithheld: r.taxesWithheld,
            otherAdjustments: r.otherAdjustments,
            reportedNetPayout: r.reportedNetPayout,
          })),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({ message: "Save nahi hua." }))) as {
          message?: string | string[];
        };
        const msg = Array.isArray(body.message) ? body.message.join(" · ") : body.message;
        setSaveError(msg ?? "Save nahi hua. Dobara koshish karo.");
        return;
      }
      const saved = (await res.json()) as { id: string };
      setSavedId(saved.id);
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  function setRole(role: ColumnRole, column: string) {
    const next = { ...mapping };
    if (column) next[role] = column;
    else delete next[role];
    setMapping(next);
    saveMapping(platform, next);
  }

  const columnOptions = [
    { value: "", label: "— nahi hai —" },
    ...headers.map((h) => ({ value: h, label: h })),
  ];
  const hasFile = rawRows.length > 0;
  const mismatch = summary.difference !== null && Math.abs(summary.difference) >= 1;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Report upload karo" />
        <p className="mt-1 text-sm text-ink-2">
          Zomato ya Swiggy ke partner dashboard se payout/settlement report download karo aur yahan daalo.
          File aapke browser me hi padhi jaati hai — kahin bheji nahi jaati.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="platform" className="mb-1.5 block text-sm font-bold text-ink">
              Kaunsa platform
            </label>
            <Select
              id="platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
              options={(Object.keys(PLATFORM_LABEL) as Platform[]).map((p) => ({
                value: p,
                label: PLATFORM_LABEL[p],
              }))}
            />
          </div>

          <div>
            <label htmlFor="settlement-file" className="mb-1.5 block text-sm font-bold text-ink">
              Report file
            </label>
            <input
              ref={inputRef}
              id="settlement-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
              }}
              className="min-h-12 rounded-control border border-line-strong bg-surface px-3 py-2 text-sm text-ink"
            />
          </div>

          {hasFile ? (
            <Button
              variant="secondary"
              onClick={() => {
                setRawRows([]);
                setHeaders([]);
                setFileName(null);
                setError(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              Hatao
            </Button>
          ) : null}
        </div>

        {isReading ? <p className="mt-3 text-sm text-ink-2">File padh rahe hain…</p> : null}
        {error ? (
          <p className="mt-3 rounded-control bg-bad-tint px-4 py-3 text-sm font-semibold text-bad" role="alert">
            {error}
          </p>
        ) : null}
        {fileName && !error ? (
          <p className="mt-3 text-sm text-ink-2">
            <strong className="text-ink">{fileName}</strong> — {rawRows.length} row, {headers.length} column
          </p>
        ) : null}
      </Card>

      {hasFile ? (
        <Card>
          <CardHeader title="Column kaun sa kya hai" />
          <p className="mt-1 text-sm text-ink-2">
            Apne aap pehchana gaya hai. Galat ho to badal do — agli baar yaad rahega.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {ROLES.map((role) => (
              <div key={role}>
                <label htmlFor={`role-${role}`} className="mb-1 block text-xs font-bold text-ink-2">
                  {COLUMN_ROLE_LABEL[role]}
                </label>
                <Select
                  id={`role-${role}`}
                  value={mapping[role] ?? ""}
                  onChange={(e) => setRole(role, e.target.value)}
                  options={columnOptions}
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {hasFile ? (
        <>
          {mismatch ? (
            <div className="rounded-card border-2 border-bad bg-bad-tint p-5">
              <h2 className="flex items-center gap-2 font-display text-base font-bold text-bad">
                <Icon name="alert" size={18} strokeWidth={2.2} />
                Report ka hisaab mel nahi kha raha
              </h2>
              <p className="mt-1 text-sm text-ink-2">
                Columns ke hisaab se payout <strong className="text-ink">{rupees(summary.calculatedNetPayout)}</strong>{" "}
                banta hai, par report <strong className="text-ink">{rupees(summary.reportedNetPayout ?? 0)}</strong>{" "}
                dikha rahi hai — <strong className="text-bad">{rupees(summary.difference ?? 0)}</strong> ka farak.
                {oddRows.length > 0 ? ` ${oddRows.length} order me gadbad hai.` : " Shayad koi column map nahi hua."}
              </p>
            </div>
          ) : null}

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Gross sale"
              value={rupees(summary.grossSales)}
              note={`${summary.orderCount} order · average ${rupees(summary.averageOrderValue)}`}
            />
            <StatTile
              label="Platform ne kaata"
              value={rupees(summary.totalDeductions)}
              tone="warn"
              note={`Gross ka ${summary.effectiveCommissionPercent}%`}
            />
            <StatTile
              label="Bank me aaya"
              value={rupees(summary.calculatedNetPayout)}
              note={`Gross ka ${summary.payoutPercent}%`}
            />
            <StatTile
              label="Har ₹100 pe bacha"
              value={`₹${summary.payoutPercent.toFixed(0)}`}
              tone={summary.payoutPercent < 70 ? "bad" : "normal"}
              note={summary.payoutPercent < 70 ? "Commission bahut zyada hai" : "Theek hai"}
            />
          </section>

          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={save} isLoading={isSaving}>
                <Icon name="install" size={16} />
                Is report ko save karo
              </Button>
              <p className="text-sm text-ink-2">
                Save karne ke baad ye apne POS ke delivery orders se compare ho jayegi.
              </p>
              {savedId ? (
                <a
                  href={`/online-pnl/${savedId}`}
                  className="text-sm font-bold text-brand hover:underline"
                >
                  Comparison dekho
                </a>
              ) : null}
            </div>
            {saveError ? (
              <p className="mt-3 rounded-control bg-bad-tint px-4 py-3 text-sm font-semibold text-bad" role="alert">
                {saveError}
              </p>
            ) : null}
          </Card>

          <Card padding="flush">
            <CardHeader title="Paisa kahan gaya" className="border-b border-line p-5" />
            <TableBox caption="Settlement ka breakdown">
              <thead>
                <tr>
                  <TH>Kya</TH>
                  <TH className="text-right">Amount</TH>
                  <TH className="text-right">Gross ka %</TH>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Gross sale", summary.grossSales, false],
                  ["Aapka diya discount", -summary.restaurantDiscount, true],
                  ["Commission", -summary.commission, true],
                  ["Platform / delivery / gateway fees", -summary.platformFees, true],
                  ["TCS / TDS", -summary.taxesWithheld, true],
                  ["Baaki adjustment", summary.otherAdjustments, true],
                ].map(([label, value, isDeduction]) => (
                  <TR key={label as string}>
                    <TD>{label as string}</TD>
                    <TD className={`tnum text-right ${(value as number) < 0 ? "font-semibold text-bad" : ""}`}>
                      {rupees(value as number)}
                    </TD>
                    <TD className="tnum text-right text-ink-2">
                      {summary.grossSales > 0 && isDeduction
                        ? `${Math.abs(Math.round(((value as number) / summary.grossSales) * 1000) / 10)}%`
                        : ""}
                    </TD>
                  </TR>
                ))}
                <TR className="bg-surface-2">
                  <TD className="font-bold">Net payout</TD>
                  <TD className="tnum text-right font-bold">{rupees(summary.calculatedNetPayout)}</TD>
                  <TD className="tnum text-right font-bold">{summary.payoutPercent}%</TD>
                </TR>
              </tbody>
            </TableBox>
          </Card>

          {oddRows.length > 0 ? (
            <Card padding="flush">
              <CardHeader
                title={`${oddRows.length} order jinka hisaab nahi milta`}
                className="border-b border-line p-5"
                action={<Badge tone="bad">Platform se poochho</Badge>}
              />
              <TableBox caption="Jin orders ka payout unke apne numbers se mel nahi khata">
                <thead>
                  <tr>
                    <TH>Order</TH>
                    <TH className="text-right">Gross</TH>
                    <TH className="text-right">Kaata</TH>
                    <TH className="text-right">Milna chahiye</TH>
                    <TH className="text-right">Mila</TH>
                    <TH className="text-right">Farak</TH>
                  </tr>
                </thead>
                <tbody>
                  {oddRows.slice(0, 25).map((r, i) => {
                    const deducted =
                      r.restaurantDiscount + r.commission + r.platformFees + r.taxesWithheld - r.otherAdjustments;
                    const should = r.grossSales - deducted;
                    const got = r.reportedNetPayout ?? 0;
                    return (
                      <TR key={`${r.externalOrderId}-${i}`}>
                        <TD className="font-semibold">{r.externalOrderId || "—"}</TD>
                        <TD className="tnum text-right">{rupees(r.grossSales)}</TD>
                        <TD className="tnum text-right">{rupees(deducted)}</TD>
                        <TD className="tnum text-right">{rupees(should)}</TD>
                        <TD className="tnum text-right">{rupees(got)}</TD>
                        <TD className="tnum text-right font-bold text-bad">{rupees(got - should)}</TD>
                      </TR>
                    );
                  })}
                </tbody>
              </TableBox>
              {oddRows.length > 25 ? (
                <p className="p-5 text-sm text-ink-2">Pehle 25 dikhaye hain, kul {oddRows.length} hain.</p>
              ) : null}
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
