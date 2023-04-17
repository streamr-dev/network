module.exports = {
    entryPoints: [
        'src/exports.ts'
    ],
    tsconfig: 'tsconfig.node.json',
    name: "Streamr Client",
    readme: 'none',
    exclude: ['**/dht/dist/**'],
    excludePrivate: true,
    excludeProtected: true,
    excludeInternal: true,
    includeVersion: true,
    disableSources: true,
    categorizeByGroup: false,
    treatWarningsAsErrors: true
}
