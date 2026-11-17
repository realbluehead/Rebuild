import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkWebUpdate, isNewer } from './update';

describe('isNewer', () => {
  it('compares versions', () => {
    expect(isNewer('v1.2.0', '1.1.9')).toBe(true);
    expect(isNewer('1.10.0', '1.9.0')).toBe(true);
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
    expect(isNewer('0.9.9', '1.0.0')).toBe(false);
  });
});

describe('checkWebUpdate', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  const serve = (body: unknown, ok = true) => {
    vi.stubEnv('BASE_URL', './'); // (local and Android builds; Pages builds use /<repo>/)
    vi.stubGlobal('document', { baseURI: 'https://example.test/Rebuild/' });
    const fetch = vi.fn(async () => ({ ok, json: async () => body }));
    vi.stubGlobal('fetch', fetch);
    return fetch;
  };

  it('reports a different build on the server, uncached', async () => {
    const fetch = serve({ version: '0.1.0', build: 'b2' });
    expect(await checkWebUpdate('b1')).toEqual({ version: '0.1.0', build: 'b2' });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/example\.test\/Rebuild\/version\.json\?t=\d+$/);
    expect(init.cache).toBe('no-store');
  });

  it('looks for version.json at the base of the app, also from a deeper address (/phase2/)', async () => {
    const fetch = serve({ version: '0.1.0', build: 'b2' });
    vi.stubEnv('BASE_URL', '/Rebuild/');
    vi.stubGlobal('document', { baseURI: 'https://example.test/Rebuild/phase2/' });
    await checkWebUpdate('b1');
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toMatch(/^https:\/\/example\.test\/Rebuild\/version\.json\?t=\d+$/);
  });

  it('stays quiet for the same build, the dev server, errors and odd files', async () => {
    serve({ build: 'b1' });
    expect(await checkWebUpdate('b1')).toBeNull();
    expect(await checkWebUpdate('dev')).toBeNull();
    serve({}, true);
    expect(await checkWebUpdate('b1')).toBeNull();
    serve({ build: 'b2' }, false);
    expect(await checkWebUpdate('b1')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await checkWebUpdate('b1')).toBeNull();
  });
});
