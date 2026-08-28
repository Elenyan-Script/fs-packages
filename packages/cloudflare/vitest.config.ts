import {configDefaults, defineProject} from 'vitest/config';

export default defineProject({
    test: {
        // Leftover Stryker sandboxes (crash-abandoned .stryker-tmp/) are a full package
        // copy whose specs the default include glob would sweep in twice. Carried from
        // the pre-`test.projects` root config — root test.exclude is not inherited here.
        exclude: [...configDefaults.exclude, '**/.stryker-tmp/**'],
        name: 'cloudflare',
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            thresholds: {lines: 100, branches: 100, functions: 100, statements: 100},
        },
    },
});
