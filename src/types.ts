import type { TranslationValue, TranslationValues } from './translation-values.js';

/**
 * Shape of the dataset the api18n server returns from /api/cli/dataset.
 * Mirrors what `src/services/translationDataset.ts` builds on the dashboard.
 */
export interface TranslationDataset {
  /** V1 is string-only; V2 supports the full TranslationValue domain. */
  schemaVersion: 1 | 2;
  company: { id: string; name: string };
  baseLanguage: { code: string; name: string };
  languages: DatasetLanguage[];
  rows: TranslationRow[];
  truncated: boolean;
  exportedAt: string;
}

export interface DatasetLanguage {
  code: string;
  name: string;
  stability: 'stable' | 'experimental';
  isBase: boolean;
}

export interface TranslationRow {
  key: string;
  referenceName: string | null;
  values: TranslationValues;
}

export interface CliMeResponse {
  user: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  };
  company: { id: string; name: string };
  role: 'Owner' | 'Admin' | 'Write' | 'View Only';
  authMethod: 'api-key' | 'session';
}

/**
 * TranslationDiff — must match the server's
 * `src/services/translationDiff.ts` shape exactly. Stored verbatim in
 * `translation_proposals.diff`.
 */
export const LEGACY_TRANSLATION_DIFF_SCHEMA_VERSION = 1 as const;
export const TRANSLATION_DIFF_SCHEMA_VERSION = 2 as const;

interface TranslationDiffBase<TValue> {
  create: Array<{ key: string; values: Record<string, TValue> }>;
  update: Array<{
    key: string;
    changes: Array<{ languageCode: string; from: TValue; to: TValue }>;
  }>;
  delete: Array<{ key: string }>;
  languages: string[];
}

export interface TranslationDiffV1 extends TranslationDiffBase<string | null> {
  schemaVersion: typeof LEGACY_TRANSLATION_DIFF_SCHEMA_VERSION;
}

export interface TranslationDiffV2
  extends TranslationDiffBase<TranslationValue | null> {
  schemaVersion: typeof TRANSLATION_DIFF_SCHEMA_VERSION;
}

export type TranslationDiff = TranslationDiffV1 | TranslationDiffV2;

export type { TranslationValue, TranslationValues } from './translation-values.js';

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'superseded';

export interface ProposalSummary {
  id: string;
  companyId: string;
  status: ProposalStatus;
  source: string;
  summary: string | null;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  proposer: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  };
  counts: { create: number; update: number; delete: number };
}
