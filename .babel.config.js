module.exports = {
    presets: [
        ['@babel/preset-env', {
            useBuiltIns: 'usage',
            corejs: 3,
            loose: false,
            bugfixes: true,
            shippedProposals: true,
            targets: {
                browsers: [
                    'supports async-functions',
                    'supports cryptography',
                    'supports es6',
                    'supports async-iterations-and-generators',
                    'not dead',
                    'not ie <= 11',
                    'not ie_mob <= 11'
                ]
            },
            exclude: ['transform-regenerator', '@babel/plugin-transform-regenerator']
        }]
    ],
    plugins: [
         "add-module-exports",
        ['@babel/plugin-transform-runtime', {
            corejs: false,
            helpers: true,
            regenerator: false
        }],
         "@babel/plugin-transform-modules-commonjs",
        ['@babel/plugin-proposal-class-properties', {
            loose: false
        }]
    ]
}
