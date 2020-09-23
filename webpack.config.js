/* eslint-disable prefer-template */
/* eslint-disable prefer-destructuring */

process.env.NODE_ENV = process.env.NODE_ENV || 'development' // set a default NODE_ENV

const path = require('path')

const TerserPlugin = require('terser-webpack-plugin')
const { merge } = require('webpack-merge')
const nodeExternals = require('webpack-node-externals')

const pkg = require('./package.json')

const isProduction = process.env.NODE_ENV === 'production'
const libraryName = pkg.name

const commonConfig = {
    mode: isProduction ? 'production' : 'development',
    entry: path.join(__dirname, 'src', 'index.js'),
    devtool: isProduction ? 'nosources-source-map' : 'source-map',
    optimization: {
        minimize: false
    },
    output: {
        path: path.join(__dirname, 'dist'),
        library: {
            root: 'Protocol',
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
            },
            {
                test: /(\.jsx|\.js)$/,
                loader: 'eslint-loader',
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        modules: [path.resolve('./node_modules'), path.resolve('./src')],
        extensions: ['.json', '.js'],
    },
    plugins: [],
}

const serverConfig = merge({}, commonConfig, {
    target: 'node',
    externals: [nodeExternals()],
    output: {
        libraryTarget: 'commonjs2',
        filename: libraryName + '.js',
    },
})

const clientConfig = merge({}, commonConfig, {
    target: 'web',
    output: {
        libraryTarget: 'umd2',
        filename: libraryName + '.web.js',
    },
})

let clientMinifiedConfig = {}

if (isProduction) {
    clientMinifiedConfig = merge({}, clientConfig, {
        optimization: {
            minimize: true,
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
