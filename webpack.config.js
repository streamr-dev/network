/* eslint-disable prefer-template */
/* eslint-disable prefer-destructuring */

process.env.NODE_ENV = process.env.NODE_ENV || 'development' // set a default NODE_ENV

const path = require('path')
const webpack = require('webpack')
const TerserPlugin = require('terser-webpack-plugin')
const merge = require('lodash').merge
const nodeExternals = require('webpack-node-externals')
const pkg = require('./package.json')

const isProduction = process.env.NODE_ENV === 'production'
const libraryName = pkg.name

const commonConfig = {
    mode: isProduction ? 'production' : 'development',
    entry: path.join(__dirname, 'src', 'index.js'),
    devtool: isProduction ? 'nosources-source-map' : 'source-map',
    output: {
        path: path.join(__dirname, 'dist'),
        library: {
            root: 'StreamrClient',
            amd: libraryName,
        },
        libraryTarget: 'umd',
        umdNamedDefine: true,
    },
    module: {
        rules: [
            {
                test: /(\.jsx|\.js)$/,
                loader: 'babel-loader',
                exclude: /(node_modules|bower_components)/,
                query: {
                    plugins: ['transform-runtime'],
                },
            },
            {
                test: /(\.jsx|\.js)$/,
                loader: 'eslint-loader',
                exclude: /(node_modules|streamr-client-protocol)/, // excluding streamr-client-protocol makes build work when 'npm link'ed
            },
        ],
    },
    resolve: {
        modules: [path.resolve('./node_modules'), path.resolve('./src')],
        extensions: ['.json', '.js'],
    },
    plugins: [
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
        }),
    ],
}

const serverConfig = merge({}, commonConfig, {
    target: 'node',
    externals: [nodeExternals()],
    output: {
        filename: libraryName + '.js',
    },
})

const clientConfig = merge({}, commonConfig, {
    target: 'web',
    output: {
        filename: libraryName + '.web.js',
    },
})

let clientMinifiedConfig = {}

if (isProduction) {
    clientMinifiedConfig = merge({}, clientConfig, {
        optimization: {
            minimizer: [
                new TerserPlugin({
                    cache: true,
                    parallel: true,
                    sourceMap: true,
                    terserOptions: {
                        output: {
                            comments: false,
                        },
                    },
                }),
            ],
        },
        output: {
            filename: libraryName + '.web.min.js',
        },
    })
}

module.exports = [serverConfig, clientConfig, clientMinifiedConfig]
