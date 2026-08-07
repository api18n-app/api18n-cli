/**
 * Shape of the dataset the api18n server returns from /api/cli/dataset.
 * Mirrors what `src/services/translationDataset.ts` builds on the dashboard.
 */
export interface TranslationDataset {
  schemaVersion: 1;
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
  values: Record<string, string | null>;
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
export const TRANSLATION_DIFF_SCHEMA_VERSION = 1;

export interface TranslationDiff {
  schemaVersion: typeof TRANSLATION_DIFF_SCHEMA_VERSION;
  create: Array<{ key: string; values: Record<string, string | null> }>;
  update: Array<{
    key: string;
    changes: Array<{ languageCode: string; from: string | null; to: string | null }>;
  }>;
  delete: Array<{ key: string }>;
  languages: string[];
}

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
