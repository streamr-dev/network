/* eslint-disable prefer-template */
/* eslint-disable prefer-destructuring */

const path = require('path')

module.exports = {
    entry: path.join(__dirname, 'src', 'index.js'),
    target: 'web',
    devtool: 'source-map',
    output: {
        libraryTarget: 'umd2',
        path: path.join(__dirname, 'dist'),
        filename: 'webpack-example.js',
    },
    module: {
        rules: [
            {
                test: /(\.jsx|\.js)$/,
                loader: 'babel-loader',
                exclude: /(node_modules|bower_components)/
            },
        ],
    },
    resolve: {
        modules: [path.resolve('./node_modules'), path.resolve('./src')],
        extensions: ['.json', '.js'],
    },
    plugins: [],
}
