const path = require('path')

module.exports = {
    entry: './src/index.ts',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
        fallback: {
            "events": require.resolve("events/"),
            "path": require.resolve("path-browserify")
        },
        alias: {
            process: "process/browser"
        }
    },
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist'),
    },
    externals: {
        'uWebSockets.js': 'commonjs uWebSockets.js',
        'geoip-lite': 'commonjs geoip-lite',
        'node-datachannel': 'commonjs node-datachannel'

    },
    plugins: [
		new webpack.ProvidePlugin({
            process: 'process/browser',
        })
	],
    
}