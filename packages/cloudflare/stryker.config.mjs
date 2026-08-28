/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
    testRunner: 'vitest',
    vitest: {configFile: 'vitest.config.ts'},
    // src/ranges.ts is vendored data (CIDR strings): its mutants are only killable by
    // pinning every range individually, which guards nothing — drift is the scheduled
    // cf-ranges-drift workflow's job, against the live endpoints.
    mutate: ['src/**/*.ts', '!src/**/types.ts', '!src/ranges.ts'],
    thresholds: {high: 95, low: 90, break: 90},
    reporters: ['clear-text', 'progress', 'json', 'html'],
    jsonReporter: {fileName: 'reports/mutation/mutation.json'},
    htmlReporter: {fileName: 'reports/mutation/mutation.html'},
    incremental: true,
    incrementalFile: '.stryker-incremental.json',
    cleanTempDir: 'always',
};
