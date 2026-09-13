"use client";

import { Box } from "@mui/material";
import type { ReactNode } from "react";

export function StatusDot({ status }: Readonly<{ status: string }>): ReactNode {
  const key = status.toLowerCase();
  return (
    <Box
      sx={theme => {
        let bgcolor: string = theme.palette.divider;
        if (key === "completed") {
          bgcolor = theme.palette.success.main;
        } else if (key === "started") {
          bgcolor = theme.palette.info.main;
        } else if (key === "scheduled") {
          bgcolor = theme.palette.warning.main;
        } else if (key === "cancelled" || key === "disputed") {
          bgcolor = theme.palette.error.main;
        }
        return { width: 8, height: 8, borderRadius: "50%", bgcolor };
      }}
    />
  );
}
