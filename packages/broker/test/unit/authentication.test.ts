import { fastWallet } from '@streamr/test-utils'
import { ExternalProvider, StreamrClientConfig, NodeType } from 'streamr-client'
import { createBroker } from '../../src/broker'
import { Config } from '../../src/config/config'

const formConfig = (auth: StreamrClientConfig['auth']): Config => {
    return {
        client: {
            auth,
            network: {
                layer0: {
                    peerDescriptor: {
                        id: 'broker',
                        type: NodeType.NODEJS,
                    },
                    entryPoints: [{
                        id: 'broker',
                        type: NodeType.NODEJS,
                    }]
                }
            }
        },
        plugins: {}
    }
}

const createExternalProvider = (address: string): ExternalProvider => {
    return {
        request: async (request: { method: string }): Promise<any> => {
            if (request.method === 'eth_requestAccounts') {
                return [address]
            } else {
                throw new Error(`unknown method: ${request.method}`)
            }
        }
    }
}

describe('authentication', () => {

    const wallet = fastWallet()

    it('private key', async () => {
        const broker = await createBroker(formConfig({
            privateKey: wallet.privateKey
        }))
        await broker.start()
        expect(await broker.getAddress()).toEqualCaseInsensitive(wallet.address)
        await broker.stop()
    })

    it('ethereum', async () => {
        const broker = await createBroker(formConfig({
            ethereum: createExternalProvider(wallet.address)
        }))
        await broker.start()
        expect(await broker.getAddress()).toEqualCaseInsensitive(wallet.address)
        await broker.stop()
    })
})
