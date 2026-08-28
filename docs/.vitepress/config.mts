import {defineConfig} from 'vitepress';

export default defineConfig({
    title: 'FS Packages',
    description: 'Shared frontend service packages by Script Development',

    themeConfig: {
        nav: [
            {text: 'Home', link: '/'},
            {text: 'Getting Started', link: '/getting-started'},
            {text: 'Architecture', link: '/architecture'},
            {text: 'Packages', link: '/packages/http'},
            {text: 'Contributing', link: '/contributing'},
        ],

        sidebar: {
            '/': [
                {
                    text: 'Guide',
                    items: [
                        {text: 'Getting Started', link: '/getting-started'},
                        {text: 'Architecture', link: '/architecture'},
                        {text: 'Contributing', link: '/contributing'},
                    ],
                },
                {
                    text: 'Foundation',
                    collapsed: false,
                    items: [
                        {text: 'fs-http', link: '/packages/http'},
                        {text: 'fs-storage', link: '/packages/storage'},
                        {text: 'fs-helpers', link: '/packages/helpers'},
                    ],
                },
                {
                    text: 'Services',
                    collapsed: false,
                    items: [
                        {text: 'fs-theme', link: '/packages/theme'},
                        {text: 'fs-loading', link: '/packages/loading'},
                        {text: 'fs-toast', link: '/packages/toast'},
                        {text: 'fs-dialog', link: '/packages/dialog'},
                        {text: 'fs-form', link: '/packages/form'},
                        {text: 'fs-translation', link: '/packages/translation'},
                    ],
                },
                {
                    text: 'Domain',
                    collapsed: false,
                    items: [
                        {text: 'fs-adapter-store', link: '/packages/adapter-store'},
                        {text: 'fs-router', link: '/packages/router'},
                    ],
                },
                {text: 'UI Components', collapsed: false, items: [{text: 'ui-inputs', link: '/packages/ui-inputs'}]},
                {
                    text: 'Integrations',
                    collapsed: false,
                    items: [{text: 'fs-cloudflare', link: '/packages/cloudflare'}],
                },
            ],
        },

        socialLinks: [
            {icon: 'github', link: 'https://github.com/script-development/fs-packages'},
            {icon: 'npm', link: 'https://www.npmjs.com/org/script-development'},
        ],

        search: {provider: 'local'},

        outline: {level: [2, 3]},

        footer: {message: 'Built by Script Development & Back to Code'},
    },
});
