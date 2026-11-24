"use client";

export function PrintButton({ paper }: { paper: "80" | "58" }) {
  const other = paper === "80" ? "58" : "80";
  return (
    <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: "3mm" }}>
      <button
        type="button"
        onClick={() => window.print()}
        style={{
          flex: 2,
          minHeight: 44,
          border: 0,
          borderRadius: 8,
          background: "#4338ca",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Print
      </button>
      {/* Most Indian counters run an 80mm roll, but 58mm handhelds are common for
          delivery. Switching re-renders the ticket at the other width. */}
      <a
        href={`?paper=${other}`}
        style={{
          flex: 1,
          minHeight: 44,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #c9ccd8",
          borderRadius: 8,
          color: "#14142b",
          fontFamily: "system-ui, sans-serif",
          fontSize: 13,
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        {other}mm
      </a>
    </div>
  );
}
