module.exports = {
    entryPoints: [
        'src/index-exports.ts'
    ],
    tsconfig: 'tsconfig.node.json',
    name: "Streamr Client",
    readme: 'none',
    excludePrivate: true,
    excludeProtected: true,
    excludeInternal: true,
    includeVersion: true,
    disableSources: true
}
