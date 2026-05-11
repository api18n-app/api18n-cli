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
