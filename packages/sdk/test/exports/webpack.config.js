/* eslint-disable prefer-template */

process.env.NODE_ENV = process.env.NODE_ENV || 'development' // set a default NODE_ENV

const path = require('path')

module.exports = (env, argv) => {
    const isProduction = argv.mode === 'production' || process.env.NODE_ENV === 'production'

    return {
        mode: isProduction ? 'production' : 'development',
        target: 'web',
        entry: {
            commonjs: path.join(__dirname, 'tests/commonjs.js'),
            typescript: path.join(__dirname, 'tests/typescript.ts'),
            esm: path.join(__dirname, 'tests/esm.mjs')
        },
        devtool: false,
        output: {
            filename: '[name].webpacked.js'
        },
        optimization: {
            minimize: false
        },
        module: {
            rules: [
                {
                    test: /(\.jsx|\.js|\.ts)$/,
                    exclude: /(node_modules|bower_components)/,
                    use: {
                        loader: 'babel-loader',
                        options: {
                            configFile: path.resolve(__dirname, '../../.babel.browser.config.js'),
                            babelrc: false,
                            cacheDirectory: true
                        }
                    }
                }
            ]
        },
        resolve: {
            modules: [path.resolve('./node_modules'), path.resolve('./tests/'), ...require.resolve.paths('')],
            extensions: ['.json', '.js', '.ts', '.mjs']
        }
    }
}
