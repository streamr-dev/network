import { overrideConfigToEnvVarsIfGiven } from '../../src/config/config'

describe('overrideConfigToEnvVarsIfGiven', () => {

    beforeEach(() => {
        const PREFIX = 'STREAMR__BROKER__'
        Object.keys(process.env).forEach((variableName: string) => {
            if (variableName.startsWith(PREFIX)) {
                delete process.env[variableName]
            }
        })
    })

    it('happy path', () => {
        const config = {
            client: {
                auth: {
                    privateKey: 'will-be-overridden'
                }
            },
            plugins: {
                info: {}
            }
        }
        process.env.STREAMR__BROKER__CLIENT__AUTH__PRIVATE_KEY = '0x111'
        process.env.STREAMR__BROKER__CLIENT__ORDER_MESSAGES = 'true'
        process.env.STREAMR__BROKER__CLIENT__GAP_FILL = 'false'
        // process.env.STREAMR__BROKER__CLIENT_NETWORK__LAYER0__PEER_DESCRIPTOR__KADEMLIA_ID = 'kademliaID'
        // process.env.STREAMR__BROKER__CLIENT_NETWORK__LAYER0__PEER_DESCRIPTOR__TYPE = '0'
        process.env.STREAMR__BROKER__AUTHENTICATION__KEYS_1 = 'key-1'
        process.env.STREAMR__BROKER__AUTHENTICATION__KEYS_2 = 'key-2'
        overrideConfigToEnvVarsIfGiven(config)
        expect(config).toEqual({
            client: {
                auth: {
                    privateKey: '0x111'
                },
                // network: {
                //     layer0: {
                //         peerDescriptor: {
                //             kademliaId: 'kademliaID',
                //             type: 0
                //         }
                //     }
                // },
                orderMessages: true,
                gapFill: false
            },
            authentication: {
                keys: ['key-1', 'key-2']
            },
            plugins: {
                info: {}
            }
        })
    })

    it('empty variable', () => {
        process.env.STREAMR__BROKER__CLIENT__AUTH__PRIVATE_KEY = ''
        const config = {} as any
        overrideConfigToEnvVarsIfGiven(config)
        expect(config).toEqual({})
    })

    it('malformed variable', () => {
        expect(() => {
            process.env.STREAMR__BROKER__AUTHENTICATION__KEYS1 = 'key-1'
            overrideConfigToEnvVarsIfGiven({} as any)
        }).toThrow('STREAMR__BROKER__AUTHENTICATION__KEYS1')
    })
})
