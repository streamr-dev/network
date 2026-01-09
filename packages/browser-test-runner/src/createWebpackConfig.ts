import path from 'path'
import webpack, { type Configuration } from 'webpack'
import NodePolyfillPlugin from 'node-polyfill-webpack-plugin'

interface CreateWebpackConfigOptions {
    libraryName: string
    alias?: webpack.ResolveOptions['alias']
    fallback?: webpack.ResolveOptions['fallback']
    externals?: webpack.Externals
}

type CreateWebpackConfigReturnType = () => Configuration

export const createWebpackConfig = (
    { libraryName, alias = {}, fallback = {}, externals = {} }: CreateWebpackConfigOptions
): CreateWebpackConfigReturnType => {
    return () => {
        return {
            cache: {
                type: 'filesystem',
            },
            mode: 'development',
            devtool: 'eval-source-map',
            module: {
                rules: [
                    {
                        test: /\.ts?$/,
                        exclude: [/(node_modules|simulation)/, /\.d\.ts$/],
                        use: [{
                            loader: 'ts-loader',
                            options: { configFile: 'tsconfig.karma.json' },
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
                fallback: {
                    timers: false,
                    ...fallback
                },
            },
            output: {
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
