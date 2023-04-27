// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require("prism-react-renderer/themes/github")
const darkCodeTheme = require("prism-react-renderer/themes/dracula")

/** @type {import('@docusaurus/types').Config} */
const config = {
    title: "Streamr Docs",
    tagline:
        "Publish and subscribe to your json based real-time data powered by the decentralized Streamr network.",
    url: "https://streamr.network/",
    baseUrl: "/",
    onBrokenLinks: "throw",
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
                entryPoints: ["../packages/client/src/exports.ts"],
                disableSources: true,
                name: "⚙️ Streamr SDK",
                excludePrivate: true,
                excludeProtected: true,
                excludeInternal: true,
                includeVersion: true,
                categorizeByGroup: true,
                treatWarningsAsErrors: true,
                watch: process.env.TYPEDOC_WATCH,
                sidebar: {
                    categoryLabel: "⚙️ API",
                },
                tsconfig: "../packages/client/tsconfig.json",
            },
        ],
    ],

    presets: [
        [
            "classic",
            /** @type {import('@docusaurus/preset-classic').Options} */
            ({
                docs: {
                    routeBasePath: "/",
                    sidebarPath: require.resolve("./sidebars.js"),
                    editUrl:
                        "https://github.com/streamr-dev/documentation/blob/main",
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
            footer: {
                links: [
                    {
                        title: "DOCS",
                        items: [
                            {
                                label: "Quickstart",
                                to: "quickstart/nodejs",
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
                                label: "Node runners",
                                to: "node-runners/run-a-node",
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
