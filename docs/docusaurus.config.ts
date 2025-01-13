import { themes as prismThemes } from 'prism-react-renderer'
import type { Config } from '@docusaurus/types'
import type * as Preset from '@docusaurus/preset-classic'
const path = require('path')

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
    title: 'Streamr Docs',
    tagline: 'Publish and subscribe to real-time data powered by the decentralized Streamr network."',
    favicon: 'img/streamr-logo.svg',

    // Set the production url of your site here
    url: 'https://docs.streamr.network/',
    // Set the /<baseUrl>/ pathname under which your site is served
    // For GitHub pages deployment, it is often '/<projectName>/'
    baseUrl: '/',

    // GitHub pages deployment config.
    // If you aren't using GitHub pages, you don't need these.
    organizationName: 'streamr-dev', // Usually your GitHub org/user name.
    projectName: 'documentation', // Usually your repo name.

    onBrokenLinks: 'throw',
    onBrokenMarkdownLinks: 'throw',

    // Even if you don't use internationalization, you can use this field to set
    // useful metadata like html lang. For example, if your site is Chinese, you
    // may want to replace "en" with "zh-Hans".
    i18n: {
        defaultLocale: 'en',
        locales: ['en']
    },
    plugins: [
        [
            'docusaurus-plugin-typedoc',

            // Plugin / TypeDoc options
            {
                entryPoints: ['../packages/sdk/src/exports.ts'],
                disableSources: true,
                name: 'API reference',
                excludePrivate: true,
                excludeProtected: true,
                excludeInternal: true,
                excludeExternals: true,
                includeVersion: true,
                categorizeByGroup: true,
                treatWarningsAsErrors: true,
                watch: process.env.TYPEDOC_WATCH,
                sidebar: {
                    categoryLabel: 'API reference',
                    indexLabel: 'API reference',
                    position: 5
                },
                out: 'docs/usage/sdk/api',
                tsconfig: '../packages/sdk/tsconfig.json',
                entryFileName: 'api.md',
                membersWithOwnFile: ['Class', 'Enum', 'Interface'],
                mergeReadme: false,
                readme: 'none'
            }
        ]
    ],

    presets: [
        [
            'classic',
            {
                googleTagManager: {
                    containerId: 'GTM-W9HTMKM'
                },
                docs: {
                    routeBasePath: '/',
                    sidebarPath: './sidebars.ts',
                    editUrl: 'https://github.com/streamr-dev/network/tree/main/docs'
                },
                blog: {
                    showReadingTime: true,
                    editUrl: 'https://blog.streamr.network/'
                },
                theme: {
                    customCss: './src/css/custom.css'
                }
            } satisfies Preset.Options
        ]
    ],

    themeConfig: {
        metadata: [{ name: 'robots', content: 'index, follow' }],
        navbar: {
            title: 'Streamr',
            logo: {
                alt: 'Streamr Logo',
                src: 'img/streamr-logo.svg'
            }
        },
        algolia: {
            // The application ID provided by Algolia
            appId: 'NOLYN2Z67B',

            // Public API key: it is safe to commit it
            apiKey: 'f9fcf2cbeb33f2edee5ee580110d8045',

            indexName: 'streamr',

            // Optional: see doc section below
            contextualSearch: true,
            schedule: 'every 1 day at 3:00 pm'
        },
        footer: {
            links: [
                {
                    title: 'DOCS',
                    items: [
                        {
                            label: 'Quickstart guides',
                            to: 'guides/nodejs'
                        },
                        {
                            label: 'Usage',
                            to: 'usage/authenticate'
                        },
                        {
                            label: 'Streamr Network',
                            to: 'streamr-network'
                        },
                        {
                            label: 'Node operators',
                            to: 'streamr-network/network-roles/operators'
                        },
                        {
                            label: 'Help',
                            to: 'help/developer-faq'
                        }
                    ]
                },
                {
                    title: 'COMMUNITY',
                    items: [
                        {
                            label: 'Discord',
                            href: 'https://discord.gg/gZAm8P7hK8'
                        },
                        {
                            label: 'Twitter',
                            href: 'https://twitter.com/streamr'
                        }
                    ]
                },
                {
                    title: 'MORE',
                    items: [
                        {
                            label: 'Blog',
                            href: 'https://blog.streamr.network/'
                        },
                        {
                            label: 'GitHub',
                            href: 'https://github.com/streamr-dev'
                        }
                    ]
                }
            ]
        },
        prism: {
            theme: prismThemes.github,
            darkTheme: prismThemes.dracula
        }
    } satisfies Preset.ThemeConfig
}

export default config
