import { Stack } from "@mui/material";
import type { ReactNode } from "react";
import { DesktopNavLink } from "@/frontend/views/landing/DesktopNavLink";
import type { LandingNavLink } from "@/frontend/views/landing/useLandingNavLinks";

/** Desktop section nav links row (hidden below lg). */
export function DesktopNavLinks({
  desktopNavLinks,
  activeSection,
}: Readonly<{
  desktopNavLinks: readonly LandingNavLink[];
  activeSection: string;
}>): ReactNode {
  return (
    <Stack
      direction="row"
      spacing={0}
      sx={{ alignItems: "center", display: { xs: "none", lg: "flex" }, overflow: "hidden" }}
    >
      {desktopNavLinks.map(link => (
        <DesktopNavLink
          key={link.href}
          href={link.href}
          label={link.label}
          isActive={link.href === `#${activeSection}`}
        />
      ))}
    </Stack>
  );
}
