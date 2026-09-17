"use client";

import { ClearOutlined, SearchOutlined, SortOutlined } from "@mui/icons-material";
import {
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import { DEFAULT_SORT, type SearchFilterState } from "@/frontend/views/parent/monitoring/SearchFilterBar.helpers";
import type { ParentMonitoringLabels } from "@/shared/locale/types/parentMonitoring";

export function SearchFilterBar({
  state,
  labels,
  onChange,
  resultCount,
  totalCount,
  showRatingFilter = true,
}: Readonly<{
  state: SearchFilterState;
  labels: ParentMonitoringLabels;
  onChange: (next: SearchFilterState) => void;
  resultCount: number;
  totalCount: number;
  showRatingFilter?: boolean;
}>): ReactNode {
  const hasFilter = state.query !== "" || state.ratingFilter !== null || state.sort !== DEFAULT_SORT;
  return (
    <Stack spacing={1.5} sx={{ width: "100%" }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ width: "100%" }}>
        <TextField
          size="small"
          placeholder={labels.searchPlaceholder}
          value={state.query}
          onChange={e => onChange({ ...state, query: e.target.value })}
          fullWidth
          sx={{ flex: 1 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined fontSize="small" />
                </InputAdornment>
              ),
              endAdornment:
                state.query !== "" ? (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={labels.searchClearLabel}
                      size="small"
                      onClick={() => onChange({ ...state, query: "" })}
                    >
                      <ClearOutlined fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
            },
          }}
        />
        {showRatingFilter ? (
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="rating-filter-label">{labels.filterByRatingLabel}</InputLabel>
            <Select
              labelId="rating-filter-label"
              label={labels.filterByRatingLabel}
              value={state.ratingFilter === null ? "all" : String(state.ratingFilter)}
              onChange={e => {
                const v = e.target.value;
                onChange({ ...state, ratingFilter: v === "all" ? null : Number(v) });
              }}
            >
              <MenuItem value="all">{labels.filterAllRatings}</MenuItem>
              <MenuItem value="5">5 / 5</MenuItem>
              <MenuItem value="4">4 / 5</MenuItem>
              <MenuItem value="3">3 / 5</MenuItem>
              <MenuItem value="2">2 / 5</MenuItem>
              <MenuItem value="1">1 / 5</MenuItem>
            </Select>
          </FormControl>
        ) : null}
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="sort-label">{labels.sortByLabel}</InputLabel>
          <Select
            labelId="sort-label"
            label={labels.sortByLabel}
            value={state.sort}
            onChange={e => onChange({ ...state, sort: e.target.value })}
            startAdornment={
              <InputAdornment position="start">
                <SortOutlined fontSize="small" />
              </InputAdornment>
            }
          >
            <MenuItem value="dateDesc">{labels.sortDateDesc}</MenuItem>
            <MenuItem value="dateAsc">{labels.sortDateAsc}</MenuItem>
            <MenuItem value="ratingDesc">{labels.sortRatingDesc}</MenuItem>
            <MenuItem value="ratingAsc">{labels.sortRatingAsc}</MenuItem>
          </Select>
        </FormControl>
      </Stack>
      {hasFilter ? (
        <Typography variant="caption" sx={theme => ({ color: theme.palette.text.secondary })}>
          {resultCount} / {totalCount}
          {resultCount === 0 ? " — " + labels.searchNoResults : ""}
        </Typography>
      ) : null}
    </Stack>
  );
}
