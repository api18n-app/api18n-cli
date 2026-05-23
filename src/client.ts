import type {
  CliMeResponse,
  ProposalStatus,
  ProposalSummary,
  TranslationDataset,
  TranslationDiff,
} from "./types.js";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ClientOptions {
  baseUrl: string;
  apiKey: string;
  companyId?: string;
}

export class Api18nClient {
  constructor(private readonly opts: ClientOptions) {}

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "api-key": `${this.opts.apiKey}`,
      Accept: "application/json",
    };
    if (this.opts.companyId) {
      headers["X-Company-Id"] = this.opts.companyId;
    }
    return headers;
  }

  private async request<T>(
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<T> {
    const url = `${this.opts.baseUrl}${path}`;
    const headers = this.headers();
    let bodyText: string | undefined;
    if (init?.body !== undefined) {
      headers["Content-Type"] = "application/json";
      bodyText = JSON.stringify(init.body);
    }
    let response: Response;
    try {
      response = await fetch(url, {
        method: init?.method ?? "GET",
        headers,
        body: bodyText,
      });
    } catch (err) {
      throw new ApiError(
        0,
        `Couldn't reach ${this.opts.baseUrl}: ${err instanceof Error ? err.message : String(err)}`,
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
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof (body as { error: unknown }).error === "string"
          ? (body as { error: string }).error
          : response.statusText || `Request failed (${response.status})`;
      throw new ApiError(response.status, message, body);
    }

    return body as T;
  }

  me(): Promise<CliMeResponse> {
    return this.request<CliMeResponse>("/cli/me");
  }

  dataset(): Promise<TranslationDataset> {
    return this.request<TranslationDataset>("/cli/dataset");
  }

  async listProposals(status?: ProposalStatus): Promise<ProposalSummary[]> {
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    const { data } = await this.request<{ data: ProposalSummary[] }>(
      `/cli/proposals${q}`,
    );
    return data;
  }

  async createProposal(input: {
    summary?: string | null;
    diff: TranslationDiff;
  }): Promise<ProposalSummary> {
    const { data } = await this.request<{ data: ProposalSummary }>(
      "/cli/proposals",
      {
        method: "POST",
        body: { source: "cli", ...input },
      },
    );
    return data;
  }

  async getProposal(
    id: string,
  ): Promise<ProposalSummary & { diff: TranslationDiff }> {
    const { data } = await this.request<{
      data: ProposalSummary & { diff: TranslationDiff };
    }>(`/cli/proposals/${encodeURIComponent(id)}`);
    return data;
  }
}
