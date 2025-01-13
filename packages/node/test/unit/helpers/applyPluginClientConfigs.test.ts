import { applyPluginClientConfigs } from '../../../src/helpers/applyPluginClientConfigs'

describe('applyPluginClientConfigs', () => {
    const applyConfig = (item: { path: string; value: any }, mutatedClientConfig: any) => {
        const plugin = {
            getClientConfig: () => [item],
            name: 'mock'
        }
        applyPluginClientConfigs([plugin as any], mutatedClientConfig)
    }

    it('no existing value', () => {
        const config = {}
        applyConfig({ path: 'foo.bar', value: 123 }, config)
        expect(config).toEqual({
            foo: {
                bar: 123
            }
        })
    })

    it('equal existing value', () => {
        const config = {
            foo: {
                bar: 123
            }
        }
        applyConfig({ path: 'foo.bar', value: 123 }, config)
        expect(config).toEqual({
            foo: {
                bar: 123
            }
        })
    })

    describe('non-equal existing value', () => {
        it('primitive', () => {
            const config = {
                foo: {
                    bar: 0
                }
            }
            expect(() => {
                applyConfig({ path: 'foo.bar', value: 123 }, config)
            }).toThrow('Plugin mock doesn\'t support client config value "0" in foo.bar')
        })

        it('object', () => {
            const config = {
                foo: {
                    bar: {
                        x: 1,
                        y: 2
                    }
                }
            }
            expect(() => {
                applyConfig({ path: 'foo.bar', value: { x: 1, y: 3 } }, config)
            }).toThrow('Plugin mock doesn\'t support client config value "{"x":1,"y":2}" in foo.bar')
        })

        it('array', () => {
            const config = {
                foo: {
                    bar: ['lorem', 'ipsum']
                }
            }
            expect(() => {
                applyConfig({ path: 'foo.bar', value: ['dolor', 'sit'] }, config)
            }).toThrow('Plugin mock doesn\'t support client config value "["lorem","ipsum"]" in foo.bar')
        })
    })
})
