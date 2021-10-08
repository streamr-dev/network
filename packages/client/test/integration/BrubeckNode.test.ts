import { StreamrClient } from '../../src/StreamrClient'
import { getCreateClient, uid } from '../utils'

describe('BrubeckNode', () => {
    const createClient = getCreateClient()

    describe('id assignment/generation', () => {
        it('uses passed-in network node id, if supplied', async () => {
            const nodeId = uid('NetworkNode')
            const client = createClient({
                network: {
                    id: nodeId,
                }
            })
            const node = await client.getNode()
            expect(node.getNodeId()).toEqual(nodeId)
        })

        it('generates node id from address, if id not supplied', async () => {
            const client = createClient()
            const node = await client.getNode()
            const expectedPrefix = `${await client.getAddress()}#`
            expect(node.getNodeId().startsWith(expectedPrefix)).toBe(true)
            expect(node.getNodeId().length).toBeGreaterThan(expectedPrefix.length) // has more characters after #
        })

        it('generates different ids for different clients with same private key', async () => {
            const client1 = createClient()
            const client2 = createClient({ auth: client1.options.auth })
            // same key, same address
            expect(await client1.getAddress()).toEqual(await client2.getAddress())
            const expectedPrefix = `${await client1.getAddress()}#`
            const node1 = await client1.getNode()
            const node2 = await client2.getNode()
            expect(node1).not.toBe(node2)
            // both start with same prefix
            expect(node1.getNodeId().startsWith(expectedPrefix)).toBe(true)
            expect(node2.getNodeId().startsWith(expectedPrefix)).toBe(true)
            expect(node1.getNodeId()).not.toEqual(node2.getNodeId())
        })
    })

    describe('create/destroy', () => {
        let client: StreamrClient

        beforeEach(() => {
            client = createClient()
        })

        it('caches node', async () => {
            const node1 = await client.getNode()
            const node2 = await client.getNode()
            expect(node1).toBe(node2)
        })

        it('caches node with parallel calls', async () => {
            const [node1, node2] = await Promise.all([
                client.getNode(),
                client.getNode(),
            ])
            expect(node1).toBe(node2)
        })

        describe('getting node after destroy is an error', () => {
            it('can destroy after start', async () => {
                await client.getNode()
                await client.destroy()
                await expect(async () => {
                    await client.getNode()
                }).rejects.toThrow('destroy')
            })

            it('can call destroy multiple times', async () => {
                await client.getNode()
                await Promise.all([
                    client.destroy(),
                    client.destroy(),
                ])
                await client.destroy()
                await expect(async () => {
                    await client.getNode()
                }).rejects.toThrow('destroy')
            })

            it('can destroy before start', async () => {
                await client.destroy()
                await expect(async () => {
                    await client.getNode()
                }).rejects.toThrow('destroy')
            })

            it('can destroy during start', async () => {
                await expect(async () => {
                    const tasks = [
                        client.getNode(),
                        client.destroy(),
                    ]
                    await Promise.allSettled(tasks)
                    // @ts-expect-error ts wants getNode to be Promise<void>, seems wrong.
                    await Promise.all(tasks)
                }).rejects.toThrow('destroy')
            })
        })
    })
})
