import { Config } from '../config'
import { StorageNodeRegistry } from '../../src/StorageNodeRegistry'
import { Server } from 'http'
import { once } from 'events'
import express, { Request, Response} from 'express'

const mockCoreApiServerPort = 17755

const createMockCoreApiServer = async () => {
    const app = express()
    const registry: Record<string,string[]> = {
        'stream-id-1': ['0x1111111111111111111111111111111111111111', '0x3333333333333333333333333333333333333333'],
        'stream-id-2': ['0x2222222222222222222222222222222222222222']
    }
    app.use('/api/v1/streams/:streamId/storageNodes', (req: Request, res: Response) => {
        const addresses = registry[req.params.streamId] ?? []
        res.json(addresses.map((address: string) => ({
            storageNodeAddress: address
        })))
    })
    app.use('/fail', (_req: Request, res: Response) => {
        res.status(500).end()
    })
    const server = app.listen(mockCoreApiServerPort)
    await once(server, 'listening')
    return server
}

describe('StorageNodeRegistry', () => {

    let registry: StorageNodeRegistry
    let mockCoreApiServer: Server

    beforeAll(async () => {
        mockCoreApiServer = await createMockCoreApiServer()
    })

    afterAll(async () => {
        mockCoreApiServer.close()
        await once(mockCoreApiServer, 'close')
    })
    
    beforeEach(() => {
        const config = {
            storageNodeRegistry: [{
                address: '0x1111111111111111111111111111111111111111',
                url: 'http://one.mock'
            }, {
                address: '0x3333333333333333333333333333333333333333',
                url: 'http://three.mock'
            }],
            streamrUrl: `http://127.0.0.1:${mockCoreApiServerPort}`
        } as Config
        registry = StorageNodeRegistry.createInstance(config)
    })

    it('get url by address', () => {
        expect(registry.getUrlByAddress('0x1111111111111111111111111111111111111111')).toStrictEqual('http://one.mock')
        expect(registry.getUrlByAddress('0x3333333333333333333333333333333333333333')).toStrictEqual('http://three.mock')
        expect(registry.getUrlByAddress('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')).toStrictEqual(undefined)
    })

    describe('get url by streamId', () => {

        it('happy path', async () => {
            const actualUrl = await registry.getUrlsByStreamId('stream-id-1')
            expect(actualUrl).toStrictEqual(['http://one.mock', 'http://three.mock'])
        })

        it('no storage nodes', async () => {
            return expect(() => registry.getUrlsByStreamId('stream-id-nonexisting')).rejects.toThrow('No storage nodes: stream-id-nonexisting')
        })

        it('node not in registry', async () => {
            return expect(() => registry.getUrlsByStreamId('stream-id-2')).rejects.toThrow('Storage node not in registry: 0x2222222222222222222222222222222222222222')
        })

        it('unable to list storage nodes', async () => {
            registry.streamrUrl = `http://127.0.0.1:${mockCoreApiServerPort}/fail`
            return expect(() => registry.getUrlsByStreamId('stream-id-3')).rejects.toThrow('Unable to list storage nodes: stream-id-3')
        })
    })
})