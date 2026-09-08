"use client";

/**
 * DirectoryToolbar — the admin user directory's filter + create surface
 * (DESKTOP ONLY — hidden below `md`; on mobile filtering happens through
 * `FilterChipsRow` and creation through the fixed `Fab`, matching the
 * prototype).
 *
 * White card (radius 12, `border.light` outline, `shadow.card`), 24px
 * padding. Contents laid out as a horizontal flex row that WRAPS when the
 * viewport is too tight (only extra-wide `xl` screens hold the single
 * line — the three action buttons plus four filter controls exceed the
 * md–lg band once the shareable-view Copy link joined the row):
 *  1. search field (magnifier leading adornment, ~400px max width),
 *  2. role select,
 *  3. status (governance) select,
 *  4. country field,
 *  5. flex spacer, then a "clear filters" text button (rendered only while
 *     at least one filter is set), the shareable-view **Copy link** action,
 *     and the primary **Create User** button (44px tall, `flexShrink: 0`,
 *     never wraps its label).
 *
 * Replaces the old `FilterBar` card; the create button moved here from the
 * page title row. Label slices are passed down narrowed — nothing is
 * hardcoded. All colors resolve through theme-callback sx; selects and
 * inputs hold a uniform 44px height.
 */

import { AddOutlined as AddIcon, LinkOutlined as LinkIcon } from "@mui/icons-material";
import { Box, Button, Card, TextField, Tooltip } from "@mui/material";
import type { ReactNode } from "react";
import { useDirectoryCopyLink } from "@/frontend/views/admin/directory-copy-link";
import {
  DirectoryFilterSelect,
  DirectoryRoleFilter,
  DirectorySearchField,
} from "@/frontend/views/admin/users/directory";
import type { DirectoryGovernance, DirectoryRole } from "@/frontend/views/admin/users/utils";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

type ToolbarLabels = Pick<
  AdminUsersLabels,
  "filters" | "roleLabels" | "statusBadges" | "genderOptions" | "createDialog" | "quickActions"
>;

interface DirectoryToolbarProps {
  readonly labels: ToolbarLabels;
  readonly roleFilter: DirectoryRole | "";
  readonly setRoleFilter: (value: DirectoryRole | "") => void;
  readonly governanceFilter: DirectoryGovernance | "";
  readonly setGovernanceFilter: (value: DirectoryGovernance | "") => void;
  readonly countryFilter: string;
  readonly setCountryFilter: (value: string) => void;
  readonly searchInput: string;
  readonly setSearchInput: (value: string) => void;
  readonly onCreateUser: () => void;
  /** Reports the successful copy-link through the surface's shared snackbar. */
  readonly onCopyLink: () => void;
}

/**
 * The shareable-view action — copies the CURRENT URL (the directory hook's
 * URL-mirror effect keeps the query string in sync with the applied
 * filters, so what the admin pastes is exactly what they see). Same
 * text-button recipe as the teachers/applicants toolbars' copy-link: 44px
 * floor, `text.secondary` ink, `LinkIcon` tinting to the success color
 * while the copy has resolved; failures stay silent (the snackbar never
 * lies about a copy that did not happen).
 */
function CopyLinkButton({
  labels,
  onCopyLink,
}: {
  readonly labels: ToolbarLabels;
  readonly onCopyLink: () => void;
}): ReactNode {
  const { linkCopied, handleCopyLink } = useDirectoryCopyLink(onCopyLink);
  return (
    <Tooltip title={labels.quickActions.copyLink} placement="top">
      <Button
        variant="text"
        startIcon={
          <LinkIcon
            fontSize="small"
            sx={theme => ({ color: linkCopied ? theme.palette.success.main : theme.palette.text.secondary })}
          />
        }
        onClick={handleCopyLink}
        aria-label={labels.quickActions.copyLink}
        sx={theme => ({ minHeight: 44, flexShrink: 0, color: theme.palette.text.secondary })}
      >
        {labels.quickActions.copyLink}
      </Button>
    </Tooltip>
  );
}

interface DirectoryGovernanceFilterProps {
  readonly id: string;
  readonly labels: ToolbarLabels;
  readonly governanceFilter: DirectoryGovernance | "";
  readonly setGovernanceFilter: (value: DirectoryGovernance | "") => void;
}

function asGovernanceFilterValue(value: string): DirectoryGovernance | "" {
  if (value === "Active" || value === "Suspended" || value === "Blocked" || value === "Deleted") {
    return value;
  }
  return "";
}

function DirectoryGovernanceFilter(props: DirectoryGovernanceFilterProps): ReactNode {
  const { labels } = props;
  return (
    <DirectoryFilterSelect
      id={props.id}
      label={labels.filters.governance}
      value={props.governanceFilter}
      onChange={value => props.setGovernanceFilter(asGovernanceFilterValue(value))}
      emptyOptionLabel={labels.genderOptions.unspecified}
      options={[
        { value: "Active", label: labels.statusBadges.active },
        { value: "Suspended", label: labels.statusBadges.suspended },
        { value: "Blocked", label: labels.statusBadges.blocked },
        { value: "Deleted", label: labels.statusBadges.deleted },
      ]}
    />
  );
}

export function DirectoryToolbar(props: DirectoryToolbarProps): ReactNode {
  const { labels } = props;
  // Stable element ids — wire `InputLabel htmlFor` ↔ control `id` so screen
  // readers announce the label when focus lands on the control (axe-core
  // `aria-input-field-name` rule). Prefixed with the component name to avoid
  // collisions with other admin surfaces.
  const ROLE_ID = "admin-users-toolbar-role";
  const GOVERNANCE_ID = "admin-users-toolbar-governance";
  const COUNTRY_ID = "admin-users-toolbar-country";
  const SEARCH_ID = "admin-users-toolbar-search";
  const hasFilters =
    props.roleFilter !== "" || props.governanceFilter !== "" || props.countryFilter !== "" || props.searchInput !== "";
  return (
    <Card
      sx={theme => ({
        borderRadius: "12px",
        border: `1px solid ${theme.palette.border.light}`,
        boxShadow: theme.palette.shadow.card,
        p: 3,
        // Desktop-only surface: mobile filters live in `FilterChipsRow` and
        // the create affordance is the fixed `Fab` (prototype parity). The
        // card turns into a flex line on md+ so the inner row keeps owning
        // the full width.
        display: { xs: "none", md: "flex" },
      })}
    >
      <Box
        sx={{
          display: "flex",
          width: "100%",
          // The single-line layout only holds from `xl` up — below that the
          // actions (all `flexShrink: 0`) wrap onto their own row instead of
          // clipping the Create button off the card edge.
          flexWrap: { xs: "wrap", xl: "nowrap" },
          rowGap: 2,
          alignItems: "center",
        }}
      >
        <DirectorySearchField
          id={SEARCH_ID}
          labels={labels}
          value={props.searchInput}
          onChange={props.setSearchInput}
        />
        <DirectoryRoleFilter
          id={ROLE_ID}
          roleFilter={props.roleFilter}
          setRoleFilter={props.setRoleFilter}
          labels={labels}
        />
        <DirectoryGovernanceFilter
          id={GOVERNANCE_ID}
          labels={labels}
          governanceFilter={props.governanceFilter}
          setGovernanceFilter={props.setGovernanceFilter}
        />
        <TextField
          id={COUNTRY_ID}
          label={labels.filters.country}
          value={props.countryFilter}
          onChange={event => props.setCountryFilter(event.target.value)}
          // Keep the label pinned to the notch at all times so the field
          // never renders without a visible label (matches the Role/Status
          // selects, whose labels shrink once a value is shown).
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ minWidth: 150, flex: { xs: "1 1 100%", sm: "0 1 auto" }, "& .MuiInputBase-root": { height: 44 } }}
        />
        <Box
          sx={{
            display: "flex",
            gap: 2,
            alignItems: "center",
            // Auto margin right-aligns the action group on ITS line — both
            // on the shared single line (xl+) and when the group wraps onto
            // its own row below the filters (md–lg).
            marginInlineStart: "auto",
            flexShrink: 0,
          }}
        >
          {hasFilters && (
            <Button
              variant="text"
              onClick={() => {
                props.setRoleFilter("");
                props.setGovernanceFilter("");
                props.setCountryFilter("");
                props.setSearchInput("");
              }}
              sx={theme => ({ minHeight: 44, flexShrink: 0, color: theme.palette.text.secondary })}
            >
              {labels.filters.clear}
            </Button>
          )}
          <CopyLinkButton labels={labels} onCopyLink={props.onCopyLink} />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={props.onCreateUser}
            sx={theme => ({
              borderRadius: "8px",
              height: 44,
              flexShrink: 0,
              whiteSpace: "nowrap",
              // Pin the fill/ink pair to the theme's `primary.main`/`onPrimary`
              // tokens so the label stays on a contrast-checked pair in both
              // light and dark themes instead of relying on the default
              // `primary.contrastText` resolution.
              bgcolor: theme.palette.primary.main,
              color: theme.palette.onPrimary,
              "&:hover": { bgcolor: theme.palette.primary.dark },
            })}
          >
            {labels.createDialog.title}
          </Button>
        </Box>
      </Box>
    </Card>
  );
}
