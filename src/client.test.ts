import { afterEach, describe, expect, it, vi } from 'vitest';
import { Api18nClient } from './client.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Api18nClient', () => {
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
