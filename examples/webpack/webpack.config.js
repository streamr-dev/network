/* eslint-disable prefer-template */
/* eslint-disable prefer-destructuring */

const path = require('path')

module.exports = {
    entry: path.join(__dirname, 'src', 'index.js'),
    devtool: 'source-map',
    output: {
        path: path.join(__dirname, 'dist'),
        filename: 'webpack-example.js',
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
        ],
    },
    resolve: {
        modules: [path.resolve('./node_modules'), path.resolve('./src')],
        extensions: ['.json', '.js'],
    },
    plugins: [],
}
