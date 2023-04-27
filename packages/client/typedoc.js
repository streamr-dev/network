module.exports = {
    entryPoints: ["src/exports.ts"],
    tsconfig: "tsconfig.node.json",
    name: "Streamr SDK",
    readme: "none",
    excludePrivate: true,
    excludeProtected: true,
    excludeInternal: true,
    includeVersion: true,
    disableSources: true,
    categorizeByGroup: false,
    treatWarningsAsErrors: true,
}
