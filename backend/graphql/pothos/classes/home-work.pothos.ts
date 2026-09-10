/**
 * SessionHomeWorkPothosObject — the single canonical GraphQL object type for
 * a per-session homework row (both parallel tracks: current = Jadid, revision
 * = Madi).
 *
 * Single Canonical Object Type Pattern (`backend/graphql/AGENTS.md`):
 *  - Backed EXCLUSIVELY by the canonical `HomeWorkReturnType` from
 *    `@/backend/types` (the `home_work` table's derived select row) — no
 *    local type definitions here. There is NO business logic in this module.
 *  - `SessionHomeWork` exposes `id` FIRST (Apollo cache normalization), then
 *    the session join id, the two assignment tracks, and the row stamps.
 *  - The full column set is exposed (every column is consumer-safe by
 *    construction) and nothing beyond it.
 *
 * Enum fields map the `surah_juz_ref` pgEnum string unions carried by the
 * canonical select row onto the `SurahJuzRef` TS enum registered ONCE in
 * `shared/enum.pothos.ts` through an exhaustive, type-safe mapping helper —
 * never `as` casts. The helper's switch is exhaustive over the pgEnum
 * vocabulary (no `default`); an unrecognized value cannot pass through
 * silently — it fails the helper's compile-time `never` guard and surfaces
 * as a resolver error at runtime. Timestamps use the `DateTime` scalar
 * (registered in `shared/scalar.pothos.ts`, backed by `DateTimeResolver`
 * from `graphql-scalars`): `Date` on the canonical shape, ISO-8601 UTC on
 * the wire.
 *
 * Consumed by the session-report query/mutation resolver modules, whose
 * imports transitively register the type through the `gqlSchema.ts`
 * side-effect chain.
 */
import { SurahJuzRef } from "@/backend/enum/shared/surah-juz-ref.enum";
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { SurahJuzRefPothosEnum } from "@/backend/graphql/pothos/shared/enum.pothos";
import type { HomeWorkReturnType } from "@/backend/types";

/**
 * Maps the `surah_juz_ref` pgEnum value carried by the canonical
 * `HomeWorkReturnType` row onto the `SurahJuzRef` TS enum.
 *
 * EXHAUSTIVE over the pgEnum vocabulary — one branch per member, NO
 * `default`: the scrutinee is the canonical row column's literal union, so
 * a future `surah_juz_ref` pgEnum member added to
 * `backend/db/schema/enums.ts` WITHOUT a matching branch here fails the
 * trailing `never` assignment at compile time (the silent
 * `default → null` escape hatch is deliberately absent). The five surah
 * legs sit as equality-guard early returns ahead of the switch (the
 * function-size lint ceiling forbids 35 two-line cases in one body);
 * sequential guards narrow the scrutinee just the same, and the switch
 * carries the remaining 30 juz members exhaustively. The trailing throw is
 * the fail-closed fallback for that impossible branch: unreachable while
 * the branches stay exhaustive, it still guards a runtime-only drift (a DB
 * enum ahead of the TS schema) by surfacing a resolver error instead of
 * passing an unmapped value through.
 */
function toSurahJuzRef(value: NonNullable<HomeWorkReturnType["currentSurahJuz"]>): SurahJuzRef {
  if (value === "surah_al_fatihah") return SurahJuzRef.SurahAlFatihah;
  if (value === "surah_al_baqarah") return SurahJuzRef.SurahAlBaqarah;
  if (value === "surah_aal_imran") return SurahJuzRef.SurahAalImran;
  if (value === "surah_an_nisa") return SurahJuzRef.SurahAnNisa;
  if (value === "surah_al_maidah") return SurahJuzRef.SurahAlMaidah;
  switch (value) {
    case "juz_1":
      return SurahJuzRef.Juz1;
    case "juz_2":
      return SurahJuzRef.Juz2;
    case "juz_3":
      return SurahJuzRef.Juz3;
    case "juz_4":
      return SurahJuzRef.Juz4;
    case "juz_5":
      return SurahJuzRef.Juz5;
    case "juz_6":
      return SurahJuzRef.Juz6;
    case "juz_7":
      return SurahJuzRef.Juz7;
    case "juz_8":
      return SurahJuzRef.Juz8;
    case "juz_9":
      return SurahJuzRef.Juz9;
    case "juz_10":
      return SurahJuzRef.Juz10;
    case "juz_11":
      return SurahJuzRef.Juz11;
    case "juz_12":
      return SurahJuzRef.Juz12;
    case "juz_13":
      return SurahJuzRef.Juz13;
    case "juz_14":
      return SurahJuzRef.Juz14;
    case "juz_15":
      return SurahJuzRef.Juz15;
    case "juz_16":
      return SurahJuzRef.Juz16;
    case "juz_17":
      return SurahJuzRef.Juz17;
    case "juz_18":
      return SurahJuzRef.Juz18;
    case "juz_19":
      return SurahJuzRef.Juz19;
    case "juz_20":
      return SurahJuzRef.Juz20;
    case "juz_21":
      return SurahJuzRef.Juz21;
    case "juz_22":
      return SurahJuzRef.Juz22;
    case "juz_23":
      return SurahJuzRef.Juz23;
    case "juz_24":
      return SurahJuzRef.Juz24;
    case "juz_25":
      return SurahJuzRef.Juz25;
    case "juz_26":
      return SurahJuzRef.Juz26;
    case "juz_27":
      return SurahJuzRef.Juz27;
    case "juz_28":
      return SurahJuzRef.Juz28;
    case "juz_29":
      return SurahJuzRef.Juz29;
    case "juz_30":
      return SurahJuzRef.Juz30;
  }
  // Exhaustiveness guard — the pgEnum union above guarantees this is
  // unreachable (the registration.service.ts fail-closed idiom, without a
  // `default` clause).
  const exhaustive: never = value;
  throw new Error(`Unexpected surah/juz ref: ${String(exhaustive)}`);
}

/**
 * The canonical `SessionHomeWork` GraphQL object. Producers return
 * `HomeWorkReturnType` (the home_work table's derived select row). Field
 * order: `id` first (Apollo cache normalization), session join, then the two
 * parallel tracks (current/Jadid, revision/Madi), then row timestamps. Every
 * assignment field is nullable: an assigned-but-ungraded or block-less track
 * is a normal stored state.
 */
export const SessionHomeWorkPothosObject = gqlSchemaBuilder.objectRef<HomeWorkReturnType>("SessionHomeWork").implement({
  fields: t => ({
    // ID FIRST — Apollo cache normalization requires `id` on every
    // entity-shaped object (identity PK, surfaced as GraphQL `ID!`).
    id: t.exposeID("id"),
    // The one-to-one session join id (UNIQUE column) — `Int!`.
    sessionId: t.exposeInt("sessionId"),
    // Current (Jadid) track — all four legs nullable at the DB level.
    currentFromAyah: t.exposeInt("currentFromAyah", { nullable: true }),
    currentToAyah: t.exposeInt("currentToAyah", { nullable: true }),
    currentGrade: t.exposeInt("currentGrade", { nullable: true }),
    // Mapped exhaustively onto the registered `SurahJuzRef` enum; an
    // unmapped value fails the mapper's compile-time exhaustiveness guard
    // and throws fail-closed at runtime.
    currentSurahJuz: t.field({
      type: SurahJuzRefPothosEnum,
      nullable: true,
      resolve: parent => {
        if (parent.currentSurahJuz === null) return null;
        return toSurahJuzRef(parent.currentSurahJuz);
      },
    }),
    // Revision (Madi) track — same shape as the current track.
    revisionFromAyah: t.exposeInt("revisionFromAyah", { nullable: true }),
    revisionToAyah: t.exposeInt("revisionToAyah", { nullable: true }),
    revisionGrade: t.exposeInt("revisionGrade", { nullable: true }),
    revisionSurahJuz: t.field({
      type: SurahJuzRefPothosEnum,
      nullable: true,
      resolve: parent => {
        if (parent.revisionSurahJuz === null) return null;
        return toSurahJuzRef(parent.revisionSurahJuz);
      },
    }),
    // Row timestamps — NOT NULL columns, non-nullable `DateTime!`.
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});
