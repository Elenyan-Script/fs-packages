import {describe, expect, it} from 'vitest';

import {SIGNED_OUT_STATUSES, sanctumEndpoints} from '../src';

describe('sanctumEndpoints', () => {
    it('builds the three Sanctum paths under a prefix', () => {
        expect(sanctumEndpoints('auth/employer')).toEqual({
            me: 'auth/employer/me',
            login: 'auth/employer/login',
            logout: 'auth/employer/logout',
        });
    });

    it('is a preset a consumer can override one key of', () => {
        expect({...sanctumEndpoints('auth/employer'), logout: 'auth/sign-out'}).toEqual({
            me: 'auth/employer/me',
            login: 'auth/employer/login',
            logout: 'auth/sign-out',
        });
    });
});

describe('SIGNED_OUT_STATUSES', () => {
    it('holds 401 and 419 and nothing else', () => {
        expect([...SIGNED_OUT_STATUSES].toSorted((a, b) => a - b)).toEqual([401, 419]);
    });

    it.each([403, 422, 429, 500])('excludes %i', (status) => {
        expect(SIGNED_OUT_STATUSES.has(status)).toBe(false);
    });
});
