import { afterEach, describe, expect, it, vi } from 'vitest';
import { Api18nClient } from './client.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Api18nClient', () => {
  it('requests dataset v2 and preserves structured values', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          schemaVersion: 2,
          company: { id: 'co-1', name: 'Test' },
          baseLanguage: { code: 'en', name: 'English' },
          languages: [
            {
              code: 'en',
              name: 'English',
              stability: 'stable',
              isBase: true,
            },
          ],
          rows: [
            {
              key: 'steps',
              referenceName: null,
              values: { en: ['First', { label: 'Second' }] },
            },
          ],
          truncated: false,
          exportedAt: '2026-09-13T00:00:00.000Z',
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new Api18nClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'test-key',
    });

    const dataset = await client.dataset();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/cli/dataset?schemaVersion=2',
      expect.any(Object),
    );
    expect(dataset.rows[0]?.values.en).toEqual([
      'First',
      { label: 'Second' },
    ]);
  });

  it('accepts a legacy v1 string-only dataset response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            company: { id: 'co-1', name: 'Test' },
            baseLanguage: { code: 'en', name: 'English' },
            languages: [],
            rows: [
              {
                key: 'greeting',
                referenceName: null,
                values: { en: 'Hello' },
              },
            ],
            truncated: false,
            exportedAt: '2026-09-13T00:00:00.000Z',
          }),
        ),
      ),
    );
    const client = new Api18nClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'test-key',
    });

    await expect(client.dataset()).resolves.toMatchObject({ schemaVersion: 1 });
  });

  it('rejects unsupported dataset schemas before commands use them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ schemaVersion: 99 })),
      ),
    );
    const client = new Api18nClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'test-key',
    });

    await expect(client.dataset()).rejects.toThrow(
      'Unsupported translation dataset schema 99',
    );
  });

  it('reads structured unsupported-language errors from the backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: 'One or more languages are not supported by API18N.',
            errorKey: 'translation.errors.unsupportedLanguage',
            unsupportedCodes: ['xx-yy'],
          }),
          { status: 422, statusText: 'Unprocessable Content' },
        ),
      ),
    );

    const client = new Api18nClient({
      baseUrl: 'https://api.example.com',
      apiKey: 'test-key',
    });

    await expect(client.dataset()).rejects.toMatchObject({
      status: 422,
      message: 'One or more languages are not supported by API18N.',
      errorKey: 'translation.errors.unsupportedLanguage',
      unsupportedCodes: ['xx-yy'],
    });
  });
});
