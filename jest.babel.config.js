module.exports = {
    presets: [
        ['@babel/preset-env', {
            useBuiltIns: 'usage',
            corejs: 3,
            targets: {
                node: true
            },
        }]
    ],
    plugins: [
        'add-module-exports',
        '@babel/plugin-transform-modules-commonjs',
        ['@babel/plugin-proposal-class-properties', {
            loose: false
        }]
    ]
}
