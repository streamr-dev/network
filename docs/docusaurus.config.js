// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require("prism-react-renderer/themes/github")
const darkCodeTheme = require("prism-react-renderer/themes/dracula")
const path = require("path")

/** @type {import('@docusaurus/types').Config} */
const config = {
    title: "Streamr Docs",
    tagline:
        "Publish and subscribe to real-time data powered by the decentralized Streamr network.",
    url: "https://docs.streamr.network/",
    baseUrl: "/",
    onBrokenLinks: "warn",  // TODO use "throw" instead and fix the broken link (currently the "Provider" class has broken links)
    onBrokenMarkdownLinks: "throw",
    favicon: "img/streamr-logo.svg",

    // GitHub pages deployment config.
    // If you aren't using GitHub pages, you don't need these.
    organizationName: "streamr-dev", // Usually your GitHub org/user name.
    projectName: "documentation", // Usually your repo name.

    // Even if you don't use internalization, you can use this field to set useful
    // metadata like html lang. For example, if your site is Chinese, you may want
    // to replace "en" with "zh-Hans".
    i18n: {
        defaultLocale: "en",
        locales: ["en"],
    },

    plugins: [
        [
            "docusaurus-plugin-typedoc",

            // Plugin / TypeDoc options
            {
                entryPoints: ["../packages/sdk/src/exports.ts"],
                disableSources: true,
                name: "API reference",
                excludePrivate: true,
                excludeProtected: true,
                excludeInternal: true,
                includeVersion: true,
                categorizeByGroup: true,
                treatWarningsAsErrors: true,
                watch: process.env.TYPEDOC_WATCH,
                sidebar: {
                    categoryLabel: "API reference",
                    indexLabel: " ",
                    position: 5,
                },
                out: "docs/usage/sdk/api",
                tsconfig: "../packages/sdk/tsconfig.json",
                exclude: [
                    // TODO what set of files we should exclude exactly? (by adding these, we got rid of all warnigs)
                    "../node_modules/**",
                    "../packages/sdk/src/generated/**",
                    "../packages/trackerless-network/dist/generated/**",
                    "../packages/dht/dist/generated/**"
                ]
            },
        ],
        // TODO re-enable this
        // path.resolve("plugins", "refine-docs")
    ],

    presets: [
        [
            "classic",
            /** @type {import('@docusaurus/preset-classic').Options} */
            ({  
                googleTagManager: {
                    containerId: 'GTM-W9HTMKM',
                },
                docs: {
                    routeBasePath: "/",
                    sidebarPath: require.resolve("./sidebars.js"),
                    editUrl:
                        "https://github.com/streamr-dev/network/tree/main/docs",
                    exclude: [
                        "**usage/sdk/api/modules.mdx",
                        "**usage/sdk/api/modules.md",
                    ],
                },
                blog: {
                    showReadingTime: true,
                    editUrl: "https://blog.streamr.network/",
                },
                theme: {
                    customCss: require.resolve("./src/css/custom.css"),
                },
            }),
        ],
    ],

    themeConfig:
        /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
        ({  
            metadata: [
                {name: "robots", content: "index, follow"}
            ],
            navbar: {
                title: "Streamr",
                logo: {
                    alt: "Streamr Logo",
                    src: "img/streamr-logo.svg",
                },
                // items: [
                //   {
                //     type: 'doc',
                //     docId: 'quickstart/nodejs',
                //     position: 'left',
                //     label: 'Quickstart',
                //   },
                //   {
                //     type: 'doc',
                //     docId: 'node-runners/run-a-node',
                //     position: 'left',
                //     label: 'Run A Node',
                //   },
                //   {
                //     href: 'https://streamr.network/core',
                //     label: 'Streamr Hub',
                //     position: 'right',
                //   },
                // ],
            },
            algolia: {
                // The application ID provided by Algolia
                appId: "NOLYN2Z67B",

                // Public API key: it is safe to commit it
                apiKey: "f9fcf2cbeb33f2edee5ee580110d8045",

                indexName: "streamr",

                // Optional: see doc section below
                contextualSearch: true,
                schedule: 'every 1 day at 3:00 pm',
                  
            },
            footer: {
                links: [
                    {
                        title: "DOCS",
                        items: [
                            {
                                label: "Quickstart guides",
                                to: "guides/nodejs",
                            },
                            {
                                label: "Usage",
                                to: "usage/authenticate",
                            },
                            {
                                label: "Streamr Network",
                                to: "streamr-network",
                            },
                            {
                                label: "Node operators",
                                to: "streamr-network/network-roles/operators",
                            },
                            {
                                label: "Help",
                                to: "help/developer-faq",
                            },
                        ],
                    },
                    {
                        title: "COMMUNITY",
                        items: [
                            {
                                label: "Discord",
                                href: "https://discord.gg/gZAm8P7hK8",
                            },
                            {
                                label: "Twitter",
                                href: "https://twitter.com/streamr",
                            },
                        ],
                    },
                    {
                        title: "MORE",
                        items: [
                            {
                                label: "Blog",
                                href: "https://blog.streamr.network/",
                            },
                            {
                                label: "GitHub",
                                href: "https://github.com/streamr-dev",
                            },
                        ],
                    },
                ],
                //copyright: `Copyright © ${new Date().getFullYear()} My Project, Inc. Built with Docusaurus.`,
            },
            prism: {
                theme: lightCodeTheme,
                darkTheme: darkCodeTheme,
            },
        }),
}

module.exports = config
