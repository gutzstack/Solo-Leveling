"use client";
import { Table2 } from "lucide-react";
import { useState } from "react";
import { Panel, EmptyState } from "@/components/system/primitives";

export interface TableData {
  columns: string[];
  rows: (string | number | null)[][];
}

/** Chart container with a built-in accessible data-table view. */
export function ChartCard({ title, subtitle, children, table, empty, height = "h-64", className }: { title: string; subtitle?: string; children: React.ReactNode; table?: TableData; empty?: string | null; height?: string; className?: string }) {
  const [showTable, setShowTable] = useState(false);
  return (
    <Panel
      title={title}
      subtitle={subtitle}
      className={className}
      actions={
        table && !empty ? (
          <button className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-dim hover:bg-accent/10 hover:text-fg" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
            <Table2 className="size-3.5" /> {showTable ? "Chart" : "Table"}
          </button>
        ) : null
      }
    >
      {empty ? (
        <EmptyState title="No data in this range">{empty}</EmptyState>
      ) : showTable && table ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-panel-solid">
              <tr>
                {table.columns.map((c) => (
                  <th key={c} className="px-2 py-1.5 font-display text-[10px] tracking-[0.12em] text-dim">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono text-xs">
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-line/40">
                  {r.map((v, j) => (
                    <td key={j} className="px-2 py-1 text-fg">
                      {v ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={height}>{children}</div>
      )}
    </Panel>
  );
}
