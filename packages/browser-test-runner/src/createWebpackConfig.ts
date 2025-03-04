import path from 'path'
import webpack from 'webpack'
import NodePolyfillPlugin from 'node-polyfill-webpack-plugin'

interface CreateWebpackConfigOptions {
    entry: string
    libraryName: string
    alias?: Record<string, string>
    fallback?: Record<string, string>
    externals?: Record<string, string>
}

export const createWebpackConfig = (
    { entry, libraryName, alias = {}, fallback = {}, externals = {} }: CreateWebpackConfigOptions
): Record<string, any> => {
    return () => {
        return {
            cache: {
                type: 'filesystem',
            },
            mode: 'development',
            entry,
            devtool: 'eval-source-map',
            module: {
                rules: [
                    {
                        test: /\.ts?$/,
                        exclude: [/(node_modules|simulation)/, /\.d\.ts$/],
                        use: [{
                            loader: 'ts-loader',
                            options: { configFile: 'tsconfig.browser.json' },
                        }]
                    }
                ],
            },
            plugins: [
                new NodePolyfillPlugin({
                    additionalAliases: ['process']
                }),
                new webpack.ProvidePlugin({
                    Buffer: ['buffer', 'Buffer']
                }),
            ],
            resolve: {
                extensions: ['.ts', '.js'],
                alias,
                fallback,
            },
            output: {
                filename: `${libraryName}.js`,
                sourceMapFilename: `[name].[contenthash].js.map`,
                chunkFilename: '[id].[contenthash].js',
                path: path.resolve('.', 'dist'),
                library: libraryName,
                libraryTarget: 'umd2',
                umdNamedDefine: true,
            },
            externals,
        }
    }
}
