module.exports = {
    presets: [
        [
            '@babel/preset-env',
            {
                modules: false,
                useBuiltIns: 'usage',
                corejs: 3,
                bugfixes: true,
                shippedProposals: true,
                targets: {
                    browsers: [
                        'supports async-functions',
                        'supports cryptography',
                        'supports es6',
                        'supports promises',
                        'supports promise-finally',
                        'supports es6-generators',
                        'supports rtcpeerconnection',
                        'not dead',
                        'not ie <= 11',
                        'not ie_mob <= 11'
                    ]
                },
                exclude: ['transform-regenerator', '@babel/plugin-transform-regenerator']
            }
        ],
        ['@babel/preset-typescript']
    ],
    plugins: [
        'transform-typescript-metadata',
        ['@babel/plugin-proposal-decorators', { legacy: true }],
        'add-module-exports',
        '@babel/plugin-transform-modules-commonjs'
    ]
}
