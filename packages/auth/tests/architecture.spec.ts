import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

/**
 * ADR-0050 § Enforcement. The package fires events and returns outcomes; it
 * navigates nowhere and it owns no clock. Both properties are invisible in the
 * public types and would be lost to one convenient line, so they are asserted
 * over the source rather than trusted to review.
 */
const SOURCE_ROOT = path.join(import.meta.dirname, '..', 'src');

const FORBIDDEN_TOKENS = ['window', 'location', 'document', 'setTimeout', 'setInterval', 'alert'];

const sourceFiles = (directory: string): string[] =>
    readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
        const entryPath = path.join(directory, entry.name);

        if (entry.isDirectory()) return sourceFiles(entryPath);

        return entry.name.endsWith('.ts') ? [entryPath] : [];
    });

const FILES = sourceFiles(SOURCE_ROOT);

describe('package architecture', () => {
    it('found the source tree it is meant to scan', () => {
        // Without this the whole spec passes over an empty list — a clean report
        // from a scan that never ran (the war room's Null-Result Gate).
        expect(FILES.length).toBeGreaterThanOrEqual(7);
    });

    it.each(FORBIDDEN_TOKENS)('never reaches for %s', (token) => {
        const pattern = new RegExp(String.raw`\b${token}\b`, 'u');
        const offenders = FILES.filter((file) => pattern.test(readFileSync(file, 'utf8')));

        expect(offenders).toEqual([]);
    });

    it('imports nothing from axios directly', () => {
        // fs-packages convention: sibling types route through fs-http's re-exports.
        // A direct axios import also breaks rolldown's `d.cts` emission on a dual bundle.
        const pattern = /from\s+['"]axios['"]/u;
        const offenders = FILES.filter((file) => pattern.test(readFileSync(file, 'utf8')));

        expect(offenders).toEqual([]);
    });
});
