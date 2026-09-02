"use client";

/**
 * BroadcastComposeHeader — the compose surface heading: the `CampaignOutlined`
 * brand icon beside the page title/subtitle pair.
 */

import { CampaignOutlined } from "@mui/icons-material";
import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import type { AdminBroadcastsLabels } from "@/shared/locale/types/adminBroadcasts";

interface BroadcastComposeHeaderProps {
  readonly labels: AdminBroadcastsLabels;
}

export function BroadcastComposeHeader(props: BroadcastComposeHeaderProps): ReactNode {
  return (
    <Stack sx={{ alignItems: "center", flexDirection: "row", gap: 2, marginBlockEnd: 3 }}>
      <CampaignOutlined sx={theme => ({ color: theme.palette.primary.main, fontSize: 36 })} />
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          {props.labels.pageTitle}
        </Typography>
        <Typography variant="body1" sx={theme => ({ color: theme.palette.text.secondary })}>
          {props.labels.pageSubtitle}
        </Typography>
      </Box>
    </Stack>
  );
}
