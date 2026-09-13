"use client";

import { ListItemIcon, ListItemText, MenuItem, Select, Skeleton, Stack, Typography } from "@mui/material";
import Avatar from "@mui/material/Avatar";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import type { ReactNode } from "react";
import type { MyLinkedChildrenQuery_myLinkedChildren } from "@/frontend/graphql/generated/gql/graphql";
import { childInitial } from "@/frontend/views/parent/monitoring/parentMonitoringDisplay";

export function ChildSwitcher({
  linkedChildren,
  currentId,
  label,
  loading,
  onChange,
}: Readonly<{
  linkedChildren: readonly MyLinkedChildrenQuery_myLinkedChildren[];
  currentId: string;
  label: string;
  loading: boolean;
  onChange: (childId: string) => void;
}>): ReactNode {
  if (loading) {
    return (
      <Stack data-testid="parent-child-switcher-loading" sx={{ gap: 0.5 }}>
        <Skeleton variant="text" sx={{ fontSize: "0.75rem", maxWidth: 80 }} />
        <Skeleton variant="rectangular" sx={{ height: 56, maxWidth: 320, borderRadius: 2 }} />
      </Stack>
    );
  }

  const currentChild = linkedChildren.find(c => c.id === currentId);

  return (
    <FormControl
      variant="outlined"
      sx={{ maxWidth: 320, "& .MuiOutlinedInput-root": { borderRadius: 2, py: 0.5, minHeight: 56 } }}
    >
      <InputLabel id="parent-child-switcher-label">{label}</InputLabel>
      <Select
        labelId="parent-child-switcher-label"
        label={label}
        value={currentId}
        data-testid="parent-child-switcher"
        onChange={event => {
          onChange(event.target.value);
        }}
        startAdornment={
          <Avatar
            sx={theme => ({
              width: 32,
              height: 32,
              fontSize: "0.85rem",
              fontWeight: 700,
              bgcolor: theme.palette.primary.main,
              color: theme.palette.primary.contrastText,
              ml: 1,
              mr: 1.5,
            })}
          >
            {currentChild ? childInitial(currentChild.fullName) : "?"}
          </Avatar>
        }
      >
        {linkedChildren.map(child => (
          <MenuItem key={child.id} value={child.id} sx={{ py: 1 }}>
            <ListItemIcon sx={{ minWidth: 40 }}>
              <Avatar
                sx={theme => ({
                  width: 32,
                  height: 32,
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  bgcolor: theme.palette.primary.main,
                  color: theme.palette.primary.contrastText,
                })}
              >
                {childInitial(child.fullName)}
              </Avatar>
            </ListItemIcon>
            <ListItemText>
              <Typography component="span" dir="auto" sx={{ fontWeight: 600 }}>
                {child.fullName}
              </Typography>
            </ListItemText>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
