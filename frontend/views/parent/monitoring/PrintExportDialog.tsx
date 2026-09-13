"use client";

import { CloseOutlined, DownloadOutlined, PrintOutlined } from "@mui/icons-material";
import { Box, Button, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { ParentMonitoring, useAppTranslation } from "@/shared/locale";

/**
 * PrintExportDialog — a modal that offers print and CSV export actions for
 * portal report data. Triggered by a toolbar button on the Reports tab.
 *
 * Actions:
 *  - Print: opens the browser print dialog (window.print())
 *  - Export CSV: serializes the report rows to CSV format and triggers
 *    a download via a Blob URL
 *
 * The dialog is a controlled component (open/onClose props). No data
 * fetching — the rows are passed in from the parent tab.
 */

export interface PrintableReportRow {
  readonly date: string;
  readonly status: string;
  readonly rating: number | null;
  readonly notes: string | null;
}

export function PrintExportDialog({
  open,
  onClose,
  rows,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  rows: readonly PrintableReportRow[];
}>): ReactNode {
  const t = useAppTranslation(ParentMonitoring);

  const handlePrint = () => {
    onClose();
    window.print();
  };

  const handleExportCsv = () => {
    const header = [t.attendanceColumnDate, t.reportsColumnRating, t.reportsColumnNotes].join(",");
    const lines = rows.map(row => {
      const date = `"${row.date}"`;
      const rating = row.rating === null ? t.ratingNotRated : `"${row.rating}"`;
      const notes = row.notes === null ? "" : `"${row.notes.replace(/"/g, '""')}"`;
      return [date, rating, notes].join(",");
    });
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "parent-portal-reports.csv";
    link.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pr: 1 }}>
        <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
          {t.printDialogTitle}
        </Typography>
        <IconButton aria-label="close" onClick={onClose} size="small">
          <CloseOutlined />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ py: 1 }}>
          <Button
            variant="outlined"
            startIcon={<PrintOutlined />}
            onClick={handlePrint}
            fullWidth
            sx={theme => ({ borderColor: theme.palette.primary.main, py: 1.5 })}
          >
            {t.printOption}
          </Button>
          <Button
            variant="contained"
            startIcon={<DownloadOutlined />}
            onClick={handleExportCsv}
            fullWidth
            sx={{ py: 1.5 }}
          >
            {t.exportCsvOption}
          </Button>
          <Box sx={theme => ({ mt: 1, p: 1.5, borderRadius: 1.5, bgcolor: theme.palette.action.hover })}>
            <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
              {rows.length} {t.reportsCount(rows.length)}
            </Typography>
          </Box>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
