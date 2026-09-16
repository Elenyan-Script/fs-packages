import {describe, expect, it} from 'vitest';

import {resolveSafeRedirect} from '../src';

/**
 * The vector table is the gate (ADR-0050 § Enforcement). Every row is a claim
 * about one vector, and a row removed to make a change pass is the change being
 * made without argument.
 */
const VECTORS: [label: string, candidate: unknown, expected: string | undefined][] = [
    ['undefined', undefined, undefined],
    ['null', null, undefined],
    ['a number', 42, undefined],
    ['an object', {toString: () => '/dashboard'}, undefined],
    ['the empty string', '', undefined],
    ['a relative path', 'dashboard', undefined],
    ['a bare path', '/dashboard', '/dashboard'],
    ['the root', '/', '/'],
    ['a path with query and fragment', '/a/b?c=1#d', '/a/b?c=1#d'],
    ['a protocol-relative host', '//evil.com', undefined],
    ['a backslash host', '/\\evil.com', undefined],
    ['a tab before the host', '/\t/evil.com', undefined],
    ['a newline before the host', '/\n/evil.com', undefined],
    ['a carriage return before the host', '/\r/evil.com', undefined],
    ['a form feed before the host', '/\f/evil.com', undefined],
    ['a NUL before the host', '/\0/evil.com', undefined],
    ['an embedded space', '/ /x', undefined],
    ['a trailing space', '/ ', undefined],
    ['an absolute URL', 'https://evil.com/', undefined],
    ['a javascript scheme', 'javascript:alert(1)', undefined],
    // Percent-encoded slashes are a PATH on the same origin at every sink a
    // consumer can have — the server resolves them, no parser sees a host. It is
    // pinned here so nobody turns it into a refusal without bringing a case.
    ['percent-encoded slashes', '/%2f%2fevil.com', '/%2f%2fevil.com'],
];

describe('resolveSafeRedirect', () => {
    it.each(VECTORS)('resolves %s', (_label, candidate, expected) => {
        expect(resolveSafeRedirect(candidate)).toBe(expected);
    });

    it('covers both outcomes, so neither arm can pass by vacuity', () => {
        const accepted = VECTORS.filter(([, , expected]) => expected !== undefined);
        const refused = VECTORS.filter(([, , expected]) => expected === undefined);

        expect(accepted.length).toBeGreaterThan(0);
        expect(refused.length).toBeGreaterThan(0);
    });
});
