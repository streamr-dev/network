import { isValidAuthentication } from '../../src/apiAuthentication'
import { StrictConfig } from '../../src/config/config'
import { ApiPluginConfig, Plugin } from '../../src/Plugin'

const PLUGIN_NAME = 'mock-plugin'

const createPlugin = (brokerConfig: StrictConfig) => {
    return new (class extends Plugin<ApiPluginConfig> {
        // eslint-disable-next-line class-methods-use-this
        async start(): Promise<void> {}
        // eslint-disable-next-line class-methods-use-this
        async stop(): Promise<void> {}
    })(PLUGIN_NAME, brokerConfig)
}

describe('Plugin', () => {
    describe('API authentication', () => {
        it('no config', () => {
            const plugin = createPlugin({
                plugins: {
                    [PLUGIN_NAME]: {}
                }
            } as any)
            const apiAuthentication = plugin.getApiAuthentication()
            expect(isValidAuthentication(undefined, apiAuthentication)).toBe(true)
            expect(isValidAuthentication('anything', apiAuthentication)).toBe(true)
        })

        it('broker config', () => {
            const plugin = createPlugin({
                apiAuthentication: {
                    keys: ['broker-level-key']
                },
                plugins: {
                    [PLUGIN_NAME]: {}
                }
            } as any)
            const apiAuthentication = plugin.getApiAuthentication()
            expect(isValidAuthentication('broker-level-key', apiAuthentication)).toBe(true)
            expect(isValidAuthentication('invalid', apiAuthentication)).toBe(false)
        })

        it('plugin config', () => {
            const plugin = createPlugin({
                plugins: {
                    [PLUGIN_NAME]: {
                        apiAuthentication: {
                            keys: ['plugin-level-key']
                        }
                    }
                }
            } as any)
            const apiAuthentication = plugin.getApiAuthentication()
            expect(isValidAuthentication('plugin-level-key', apiAuthentication)).toBe(true)
            expect(isValidAuthentication('invalid', apiAuthentication)).toBe(false)
        })

        it('plugin overrides broker config', () => {
            const plugin = createPlugin({
                apiAuthentication: {
                    keys: ['broker-level-key']
                },
                plugins: {
                    [PLUGIN_NAME]: {
                        apiAuthentication: {
                            keys: ['plugin-level-key']
                        }
                    }
                }
            } as any)
            const apiAuthentication = plugin.getApiAuthentication()
            expect(isValidAuthentication('broker-level-key', apiAuthentication)).toBe(false)
            expect(isValidAuthentication('plugin-level-key', apiAuthentication)).toBe(true)
            expect(isValidAuthentication('invalid', apiAuthentication)).toBe(false)
        })

        it('plugin null config allows all access', () => {
            const plugin = createPlugin({
                apiAuthentication: {
                    keys: ['broker-level-key']
                },
                plugins: {
                    [PLUGIN_NAME]: {
                        apiAuthentication: null
                    }
                }
            } as any)
            const apiAuthentication = plugin.getApiAuthentication()
            expect(isValidAuthentication(undefined, apiAuthentication)).toBe(true)
            expect(isValidAuthentication('broker-level-key', apiAuthentication)).toBe(true)
            expect(isValidAuthentication('anything', apiAuthentication)).toBe(true)
        })
    })
})
