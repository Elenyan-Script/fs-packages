import {beforeEach, describe, expect, it, vi} from 'vitest';

import type {HttpStub} from './support/http-stub';

import {createCsrfPrimer} from '../src';
import {axiosRejection, createHttpStub, respondWith} from './support/http-stub';

const PRIME_URL = 'https://app.example.test/sanctum/csrf-cookie';
const TIMEOUT_MS = 4321;
const OPTIONS = {timeout: TIMEOUT_MS, withCredentials: true, withXSRFToken: true};

let http: HttpStub;

beforeEach(() => {
    http = createHttpStub();
});

describe('createCsrfPrimer', () => {
    it('fetches the cookie once with the configured timeout', async () => {
        vi.mocked(http.getRequest).mockResolvedValue(respondWith(''));
        const primer = createCsrfPrimer(http, PRIME_URL, OPTIONS);

        await primer.prime();

        expect(vi.mocked(http.getRequest)).toHaveBeenCalledExactlyOnceWith(PRIME_URL, OPTIONS);
    });

    it('remembers a settled prime', async () => {
        vi.mocked(http.getRequest).mockResolvedValue(respondWith(''));
        const primer = createCsrfPrimer(http, PRIME_URL, OPTIONS);

        await primer.prime();
        await primer.prime();

        expect(vi.mocked(http.getRequest)).toHaveBeenCalledOnce();
    });

    it('shares one in-flight request between concurrent callers', async () => {
        vi.mocked(http.getRequest).mockResolvedValue(respondWith(''));
        const primer = createCsrfPrimer(http, PRIME_URL, OPTIONS);

        await Promise.all([primer.prime(), primer.prime()]);

        expect(vi.mocked(http.getRequest)).toHaveBeenCalledOnce();
    });

    it('forgets a rejected prime so the next caller retries', async () => {
        vi.mocked(http.getRequest).mockRejectedValueOnce(axiosRejection(500)).mockResolvedValueOnce(respondWith(''));
        const primer = createCsrfPrimer(http, PRIME_URL, OPTIONS);

        await expect(primer.prime()).rejects.toMatchObject({response: {status: 500}});
        await primer.prime();

        expect(vi.mocked(http.getRequest)).toHaveBeenCalledTimes(2);
    });

    it('re-primes after reset', async () => {
        vi.mocked(http.getRequest).mockResolvedValue(respondWith(''));
        const primer = createCsrfPrimer(http, PRIME_URL, OPTIONS);

        await primer.prime();
        primer.reset();
        await primer.prime();

        expect(vi.mocked(http.getRequest)).toHaveBeenCalledTimes(2);
    });

    it('gives two primers their own memo', async () => {
        vi.mocked(http.getRequest).mockResolvedValue(respondWith(''));

        await createCsrfPrimer(http, PRIME_URL, OPTIONS).prime();
        await createCsrfPrimer(http, PRIME_URL, OPTIONS).prime();

        expect(vi.mocked(http.getRequest)).toHaveBeenCalledTimes(2);
    });
});
