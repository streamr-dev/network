module.exports = {
    entryPoints: [
        'src/dataunion/DataUnion.ts',
        'src/Config.ts',
        'src/StreamrClient.ts'
    ],
    tsconfig: 'tsconfig.node.json',
    excludeInternal: true,
    includeVersion: true,
}
