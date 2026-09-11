"use client";

/**
 * PlanCatalogHeader — Header section for the admin plan catalog.
 *
 * Renders page title, subtitle, and primary Create Plan action button.
 */

import { AddOutlined as AddIcon } from "@mui/icons-material";
import { Box, Button, Stack, Typography } from "@mui/material";
import { useAppTranslation } from "@/shared/locale/client";
import { Plans } from "@/shared/locale/namespaces/plans";

export interface PlanCatalogHeaderProps {
  readonly onCreateNew: () => void;
}

export function PlanCatalogHeader({ onCreateNew }: PlanCatalogHeaderProps): React.ReactElement {
  const t = useAppTranslation(Plans);

  return (
    <Stack
      sx={{
        flexDirection: { xs: "column", sm: "row" },
        justifyContent: "space-between",
        alignItems: { xs: "flex-start", sm: "center" },
        gap: 2,
        mb: 4,
      }}
    >
      <Box>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 700, mb: 0.5 }}>
          {t.pageTitle}
        </Typography>
        <Typography variant="body1" sx={theme => ({ color: theme.palette.text.secondary })}>
          {t.pageSubtitle}
        </Typography>
      </Box>
      <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={onCreateNew} sx={{ minHeight: 44 }}>
        {t.createPlanButton}
      </Button>
    </Stack>
  );
}
