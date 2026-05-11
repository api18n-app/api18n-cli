import type { CliMeResponse, TranslationDataset } from './types.js';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ClientOptions {
  baseUrl: string;
  token: string;
  companyId?: string;
}

export class Api18nClient {
  constructor(private readonly opts: ClientOptions) {}

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.opts.token}`,
      Accept: 'application/json',
    };
    if (this.opts.companyId) {
      headers['X-Company-Id'] = this.opts.companyId;
    }
    return headers;
  }

  private async request<T>(path: string): Promise<T> {
    const url = `${this.opts.baseUrl}${path}`;
    let response: Response;
    try {
      response = await fetch(url, { headers: this.headers() });
    } catch (err) {
      throw new ApiError(
        0,
        `Couldn't reach ${this.opts.baseUrl}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    let body: unknown = undefined;
    const text = await response.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (!response.ok) {
      const message =
        typeof body === 'object' && body !== null && 'error' in body && typeof (body as { error: unknown }).error === 'string'
          ? (body as { error: string }).error
          : response.statusText || `Request failed (${response.status})`;
      throw new ApiError(response.status, message, body);
    }

    return body as T;
  }

  me(): Promise<CliMeResponse> {
    return this.request<CliMeResponse>('/api/cli/me');
  }

  dataset(): Promise<TranslationDataset> {
    return this.request<TranslationDataset>('/api/cli/dataset');
  }
}
