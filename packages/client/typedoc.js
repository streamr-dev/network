module.exports = {
    entryPoints: [
        'src/dataunion/DataUnion.ts',
        'src/Config.ts',
        'src/StreamrClient.ts'
    ],
    tsconfig: 'tsconfig.node.json',
    readme: false,
    excludeInternal: true,
    includeVersion: true,
}
