"use client";

import { Stack } from "@mui/material";
import type { ReactNode } from "react";
import { FooterColumn } from "@/frontend/components/siteFooter/FooterColumn";
import { FooterLink } from "@/frontend/components/siteFooter/FooterLink";
import { Landing, useAppTranslation } from "@/shared/locale";

/** Three link columns (Product / Company / Legal) in the right 60% zone. */
export function FooterLinksSection(): ReactNode {
  const t = useAppTranslation(Landing);

  return (
    <Stack
      direction="row"
      spacing={{ xs: 5, sm: 3, md: 6 }}
      sx={{
        flex: { md: "1 1 60%" },
        flexWrap: "wrap",
        rowGap: { xs: 4, sm: 3 },
        justifyContent: { xs: "flex-start", sm: "space-between", md: "space-between" },
        // Equal-width columns: fit-content columns of differing label
        // lengths made the three-across grid read lopsided at sm/md widths.
        "& > *": { flex: { sm: "1 1 0" }, minWidth: 132 },
      }}
    >
      <FooterColumn title={t.footerProduct}>
        <FooterLink href="/register">{t.footerProductFeatures}</FooterLink>
        <FooterLink href="/register">{t.footerProductRecitations}</FooterLink>
        <FooterLink href="/register">{t.footerProductPricing}</FooterLink>
      </FooterColumn>
      <FooterColumn title={t.footerCompany}>
        <FooterLink href="/register">{t.footerCompanyAbout}</FooterLink>
        <FooterLink href="/register">{t.footerCompanyCareers}</FooterLink>
        <FooterLink href="/register">{t.footerCompanyContact}</FooterLink>
      </FooterColumn>
      <FooterColumn title={t.footerLegal}>
        <FooterLink href="/register">{t.footerLegalPrivacy}</FooterLink>
        <FooterLink href="/register">{t.footerLegalTerms}</FooterLink>
        <FooterLink href="/register">{t.footerLegalCookies}</FooterLink>
      </FooterColumn>
    </Stack>
  );
}
