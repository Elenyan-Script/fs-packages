import {BlockList, isIPv4, isIPv6} from 'node:net';

import type {CloudflareGate, CloudflareGateOptions, CloudflareGateRequest, CloudflareGateResponse} from './types';

import {CLOUDFLARE_IPV4, CLOUDFLARE_IPV6} from './ranges';

const HTTP_FORBIDDEN = 403;

const DEFAULT_HEADER = 'fly-client-ip';

const addSubnets = (blockList: BlockList, ranges: string[], family: 'ipv4' | 'ipv6'): void => {
    for (const range of ranges) {
        const separator = range.indexOf('/');
        blockList.addSubnet(range.slice(0, separator), Number(range.slice(separator + 1)), family);
    }
};

const buildBlockList = (): BlockList => {
    const blockList = new BlockList();
    addSubnets(blockList, CLOUDFLARE_IPV4, 'ipv4');
    addSubnets(blockList, CLOUDFLARE_IPV6, 'ipv6');

    return blockList;
};

export const createCloudflareGate = (options: CloudflareGateOptions = {}): CloudflareGate => {
    const {header = DEFAULT_HEADER} = options;
    const exemptPaths = new Set(options.exemptPaths);
    const readSocket = options.source === 'socket';
    const blockList = buildBlockList();

    const isCloudflareAddress = (value: string): boolean => {
        // An IPv4-mapped IPv6 address (::ffff:1.2.3.4) needs no unwrapping: BlockList matches it
        // against the v4 rules itself. The IPv4-mapped cases in the spec pin that.
        if (isIPv4(value)) return blockList.check(value, 'ipv4');

        return isIPv6(value) && blockList.check(value, 'ipv6');
    };

    const passes = (req: CloudflareGateRequest): boolean => {
        // Socket mode has no proxy in front: an absent peer address is unknowable, so it fails closed.
        if (readSocket) {
            const address = req.socket?.remoteAddress;

            return address !== undefined && isCloudflareAddress(address);
        }

        const address = req.get(header);

        // A missing header means the request never crossed the edge proxy (Fly 6PN/internal, local dev).
        return address === undefined || isCloudflareAddress(address);
    };

    const middleware = (req: CloudflareGateRequest, res: CloudflareGateResponse, next: () => void): void => {
        if (exemptPaths.has(req.path) || passes(req)) {
            next();

            return;
        }

        res.sendStatus(HTTP_FORBIDDEN);
    };

    return {middleware, isCloudflareAddress};
};
