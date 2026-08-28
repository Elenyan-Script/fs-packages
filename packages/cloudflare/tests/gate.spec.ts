import {describe, expect, it, vi} from 'vitest';

import type {CloudflareGate, CloudflareGateRequest} from '../src';

import {createCloudflareGate} from '../src';

const CF_IPV4 = '104.16.0.1';
const CF_IPV6 = '2606:4700::1';
const OTHER_IPV4 = '203.0.113.1';
const OTHER_IPV6 = '2001:db8::1';

const createRequest = (
    path: string,
    headers: Record<string, string> = {},
    socket?: {remoteAddress?: string},
): CloudflareGateRequest => ({path, get: (name) => headers[name.toLowerCase()], socket});

const invoke = (gate: CloudflareGate, req: CloudflareGateRequest) => {
    const next = vi.fn();
    const sendStatus = vi.fn();

    gate.middleware(req, {sendStatus}, next);

    return {next, sendStatus};
};

const expectAllowed = ({next, sendStatus}: ReturnType<typeof invoke>): void => {
    expect(next).toHaveBeenCalledTimes(1);
    expect(sendStatus).not.toHaveBeenCalled();
};

const expectForbidden = ({next, sendStatus}: ReturnType<typeof invoke>): void => {
    expect(sendStatus).toHaveBeenCalledTimes(1);
    expect(sendStatus).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
};

describe('createCloudflareGate', () => {
    describe('factory contract', () => {
        it('should return a gate exposing middleware and isCloudflareAddress', () => {
            const gate = createCloudflareGate();

            expect(gate).toHaveProperty('middleware');
            expect(gate).toHaveProperty('isCloudflareAddress');
        });
    });

    describe('header mode', () => {
        it('should pass a request from a Cloudflare IPv4 address', () => {
            const gate = createCloudflareGate();

            expectAllowed(invoke(gate, createRequest('/', {'fly-client-ip': CF_IPV4})));
        });

        it('should pass a request from a Cloudflare IPv6 address', () => {
            const gate = createCloudflareGate();

            expectAllowed(invoke(gate, createRequest('/', {'fly-client-ip': CF_IPV6})));
        });

        it('should forbid a request from a non-Cloudflare IPv4 address', () => {
            const gate = createCloudflareGate();

            expectForbidden(invoke(gate, createRequest('/', {'fly-client-ip': OTHER_IPV4})));
        });

        it('should forbid a request from a non-Cloudflare IPv6 address', () => {
            const gate = createCloudflareGate();

            expectForbidden(invoke(gate, createRequest('/', {'fly-client-ip': OTHER_IPV6})));
        });

        it('should pass an IPv4-mapped Cloudflare address', () => {
            const gate = createCloudflareGate();

            expectAllowed(invoke(gate, createRequest('/', {'fly-client-ip': `::ffff:${CF_IPV4}`})));
        });

        it('should forbid an IPv4-mapped non-Cloudflare address', () => {
            const gate = createCloudflareGate();

            expectForbidden(invoke(gate, createRequest('/', {'fly-client-ip': `::ffff:${OTHER_IPV4}`})));
        });

        it('should pass a request without the client-IP header', () => {
            const gate = createCloudflareGate();

            expectAllowed(invoke(gate, createRequest('/')));
        });

        it('should forbid a request whose client-IP header is not an address', () => {
            const gate = createCloudflareGate();

            expectForbidden(invoke(gate, createRequest('/', {'fly-client-ip': 'not-an-ip'})));
        });

        it('should read fly-client-ip by default, ignoring other client-IP headers', () => {
            const gate = createCloudflareGate();

            expectForbidden(
                invoke(gate, createRequest('/', {'cf-connecting-ip': CF_IPV4, 'fly-client-ip': OTHER_IPV4})),
            );
        });

        it('should read the configured header instead of the default', () => {
            const gate = createCloudflareGate({header: 'x-edge-ip'});

            expectAllowed(invoke(gate, createRequest('/', {'fly-client-ip': OTHER_IPV4, 'x-edge-ip': CF_IPV4})));
        });

        it('should pass when the configured header is absent, ignoring the default header', () => {
            const gate = createCloudflareGate({header: 'x-edge-ip'});

            expectAllowed(invoke(gate, createRequest('/', {'fly-client-ip': OTHER_IPV4})));
        });
    });

    describe('exempt paths', () => {
        it('should pass an exempt path regardless of the client IP', () => {
            const gate = createCloudflareGate({exemptPaths: ['/health']});

            expectAllowed(invoke(gate, createRequest('/health', {'fly-client-ip': OTHER_IPV4})));
        });

        it('should forbid a non-exempt path from a non-Cloudflare IP', () => {
            const gate = createCloudflareGate({exemptPaths: ['/health']});

            expectForbidden(invoke(gate, createRequest('/jobs', {'fly-client-ip': OTHER_IPV4})));
        });

        it('should match exempt paths exactly, not by prefix', () => {
            const gate = createCloudflareGate({exemptPaths: ['/health']});

            expectForbidden(invoke(gate, createRequest('/health/live', {'fly-client-ip': OTHER_IPV4})));
        });
    });

    describe('socket mode', () => {
        it('should pass a Cloudflare socket address while ignoring the header', () => {
            const gate = createCloudflareGate({source: 'socket'});

            expectAllowed(invoke(gate, createRequest('/', {'fly-client-ip': OTHER_IPV4}, {remoteAddress: CF_IPV4})));
        });

        it('should forbid a non-Cloudflare socket address even when the header holds a Cloudflare address', () => {
            const gate = createCloudflareGate({source: 'socket'});

            expectForbidden(invoke(gate, createRequest('/', {'fly-client-ip': CF_IPV4}, {remoteAddress: OTHER_IPV4})));
        });

        it('should forbid a socket without a remote address', () => {
            const gate = createCloudflareGate({source: 'socket'});

            expectForbidden(invoke(gate, createRequest('/', {}, {})));
        });

        it('should forbid a request carrying no socket at all', () => {
            const gate = createCloudflareGate({source: 'socket'});

            expectForbidden(invoke(gate, createRequest('/')));
        });
    });

    // The gate is built inside each case, never in a describe body: a factory call at collection
    // time makes Stryker classify every mutant it touches as static, and static mutants survive.
    describe('range boundaries', () => {
        it('should accept the first and last address of an IPv4 range', () => {
            const {isCloudflareAddress} = createCloudflareGate();

            expect(isCloudflareAddress('173.245.48.0')).toBe(true);
            expect(isCloudflareAddress('173.245.63.255')).toBe(true);
        });

        it('should reject the addresses adjacent to an IPv4 range', () => {
            const {isCloudflareAddress} = createCloudflareGate();

            expect(isCloudflareAddress('173.245.47.255')).toBe(false);
            expect(isCloudflareAddress('173.245.64.0')).toBe(false);
        });

        it('should accept the first and last address of an IPv6 range', () => {
            const {isCloudflareAddress} = createCloudflareGate();

            expect(isCloudflareAddress('2400:cb00::')).toBe(true);
            expect(isCloudflareAddress('2400:cb00:ffff:ffff:ffff:ffff:ffff:ffff')).toBe(true);
        });

        it('should reject the addresses adjacent to an IPv6 range', () => {
            const {isCloudflareAddress} = createCloudflareGate();

            expect(isCloudflareAddress('2400:caff:ffff:ffff:ffff:ffff:ffff:ffff')).toBe(false);
            expect(isCloudflareAddress('2400:cb01::')).toBe(false);
        });
    });
});
