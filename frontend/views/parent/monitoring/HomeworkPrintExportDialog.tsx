"use client";

import { CloseOutlined, DownloadOutlined, PrintOutlined } from "@mui/icons-material";
import { Box, Button, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import type { PrintableHomeworkRow } from "@/frontend/views/parent/monitoring/HomeworkPrintExportDialog.helpers";
import { ParentMonitoring, useAppLocale, useAppTranslation } from "@/shared/locale";

function escapeCsv(value: string): string {
  return '"' + value.replace(/"/g, '""') + '"';
}

export function HomeworkPrintExportDialog({
  open,
  onClose,
  rows,
  childName,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  rows: readonly PrintableHomeworkRow[];
  childName: string;
}>): ReactNode {
  const t = useAppTranslation(ParentMonitoring);
  const locale = useAppLocale();

  const handlePrint = () => {
    onClose();
    window.print();
  };

  const handleExportCsv = () => {
    const header = [t.attendanceColumnDate, t.csvJadidColumn, t.csvMadiColumn, t.csvGradeColumn].join(",");
    const lines = rows.map(row => {
      const date = escapeCsv(row.date);
      const jadid = row.jadidSurahJuz === null ? "" : escapeCsv(row.jadidSurahJuz);
      const madi = row.madiSurahJuz === null ? "" : escapeCsv(row.madiSurahJuz);
      const grades: string[] = [];
      if (row.jadidGrade !== null) {
        grades.push("J:" + row.jadidGrade);
      }
      if (row.madiGrade !== null) {
        grades.push("M:" + row.madiGrade);
      }
      const gradeStr = grades.length === 0 ? "" : escapeCsv(grades.join(" "));
      return [date, jadid, madi, gradeStr].join(",");
    });
    const now = formatApplicantDate(new Date().toISOString(), locale);
    const meta = escapeCsv(`# ${childName} — ${now}`);
    const csv = [meta, header, ...lines].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "parent-portal-homework-" + Date.now() + ".csv";
    link.click();
    URL.revokeObjectURL(url);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pr: 1 }}>
        <Typography variant="h6" component="span" sx={{ fontWeight: 700 }}>
          {t.homeworkPrintDialogTitle}
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
              {rows.length} {t.homeworkCount(rows.length)}
            </Typography>
          </Box>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
