module.exports = {
    presets: [
        ['@babel/preset-env', {
            useBuiltIns: 'usage',
            modules: false,
            corejs: 3,
            loose: false,
            bugfixes: true,
            shippedProposals: true,
            targets: {
                node: true
            }
        }]
    ],
    plugins: [
        'add-module-exports',
        ['@babel/plugin-transform-runtime', {
            useESModules: false,
            corejs: 3,
            helpers: true,
            regenerator: false
        }],
        '@babel/plugin-transform-modules-commonjs',
        ['@babel/plugin-proposal-class-properties', {
            loose: false
        }]
    ]
}
