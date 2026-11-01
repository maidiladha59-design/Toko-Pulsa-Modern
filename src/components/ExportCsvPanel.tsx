"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
import Select from "@/components/ui/Select";
import Icon from "@/components/icons/Icon";
import { useToast } from "@/components/ToastProvider";
import {
  EXPORT_MAX_DAYS,
  EXPORT_MAX_ROWS,
  EXPORT_STATUS_OPTIONS,
  EXPORT_TITLES,
  defaultExportRange,
  parseExportRange,
  type ExportKind,
} from "@/lib/admin-export";

export type ExportFilterState = { from: string; to: string; status: string; q: string };

type Props = {
  kind: ExportKind;
  statusLabel?: string;
  searchPlaceholder?: string;
  onFiltersChange?: (filters: ExportFilterState) => void;
  className?: string;
};

export default function ExportCsvPanel({
  kind,
  statusLabel = "Status",
  searchPlaceholder = "Cari nama atau email",
  onFiltersChange,
  className = "",
}: Props) {
  const toast = useToast();
  const [from, setFrom] = useState(() => defaultExportRange().from);
  const [to, setTo] = useState(() => defaultExportRange().to);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const statusOptions = EXPORT_STATUS_OPTIONS[kind];

  function notify(next: Partial<ExportFilterState>) {
    onFiltersChange?.({ from, to, status, q, ...next });
  }

  async function handleExport() {
    setError(null);
    const range = parseExportRange(from, to);
    if (!range.ok) {
      setError(range.message);
      return;
    }

    setExporting(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (status) params.set("status", status);
      if (q.trim()) params.set("q", q.trim());

      const response = await fetch(`/api/admin/export/${kind}?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        toast.show(
          json?.message || "Ekspor gagal disiapkan. Coba lagi sebentar lagi.",
          "error"
        );
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const filename =
        disposition.match(/filename="([^"]+)"/i)?.[1] ||
        `aidil-store-${kind}-${from}-${to}.csv`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
      toast.show("File CSV berhasil disiapkan. Periksa folder unduhan Anda.", "success");
    } catch {
      toast.show("Ekspor gagal diunduh. Periksa koneksi Anda lalu coba lagi.", "error");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card className={className}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle>Ekspor CSV</CardTitle>
          <CardDescription className="break-words">
            Unduh data {EXPORT_TITLES[kind].toLowerCase()} sesuai filter di bawah. Rentang tanggal
            wajib, maksimal {EXPORT_MAX_DAYS} hari dan {EXPORT_MAX_ROWS.toLocaleString("id-ID")}{" "}
            baris per file.
          </CardDescription>
        </div>
        <Icon name="download" size={20} className="shrink-0 text-app-kicker" />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Input
          label="Dari tanggal"
          type="date"
          value={from}
          max={to || undefined}
          onChange={(event) => {
            const value = event.target.value;
            setFrom(value);
            notify({ from: value });
          }}
          className="bg-app-inset"
        />
        <Input
          label="Sampai tanggal"
          type="date"
          value={to}
          min={from || undefined}
          onChange={(event) => {
            const value = event.target.value;
            setTo(value);
            notify({ to: value });
          }}
          className="bg-app-inset"
        />
        <Select
          label={statusLabel}
          value={status}
          onChange={(event) => {
            const value = event.target.value;
            setStatus(value);
            notify({ status: value });
          }}
          className="bg-app-inset"
        >
          <option value="">Semua {statusLabel.toLowerCase()}</option>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Input
          label="Pencarian"
          value={q}
          maxLength={80}
          placeholder={searchPlaceholder}
          onChange={(event) => {
            const value = event.target.value;
            setQ(value);
            notify({ q: value });
          }}
          className="bg-app-inset"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm font-medium text-danger-600 dark:text-danger-400"
        >
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-app-subtle">
          File UTF-8 dengan BOM agar rapi di Excel dan Google Sheets. Angka rupiah ditulis angka
          murni, dan tanggal memakai zona WIB.
        </p>
        <Button
          onClick={handleExport}
          loading={exporting}
          disabled={!from || !to}
          className="w-full shrink-0 sm:w-auto"
        >
          <Icon name="download" size={16} />
          {exporting ? "Menyiapkan file..." : "Ekspor CSV"}
        </Button>
      </div>

      {exporting && (
        <div className="mt-3">
          <LoadingSkeleton rows={2} />
        </div>
      )}
    </Card>
  );
}
