/* global __dirname, require, module */

// const webpack = require('webpack')
const UglifyJsPlugin = require('uglifyjs-webpack-plugin')
const path = require('path')
const yargs = require('yargs')
const pkg = require('./package.json')

const { env } = yargs.argv // use --env with webpack 2
const libraryName = pkg.name

const plugins = []

let outputFile = libraryName
if (env === 'prod') {
    plugins.push(new UglifyJsPlugin())
    outputFile += '.min.js'
} else {
    outputFile += '.js'
}

const config = {
    entry: path.join(__dirname, 'src', 'index.js'),
    devtool: 'source-map',
    output: {
        path: path.join(__dirname, 'dist'),
        filename: outputFile,
        library: {
            root: 'StreamrClient',
            amd: libraryName,
            commonjs: libraryName,
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
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        modules: [path.resolve('./node_modules'), path.resolve('./src')],
        extensions: ['.json', '.js'],
    },
    plugins,
}

module.exports = config
