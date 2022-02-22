module.exports = {
    entryPoints: [
        'src/index-exports.ts'
    ],
    tsconfig: 'tsconfig.node.json',
    readme: 'none',
    excludePrivate: true,
    excludeProtected: true,
    excludeInternal: true,
    includeVersion: true,
    disableSources: true
}
