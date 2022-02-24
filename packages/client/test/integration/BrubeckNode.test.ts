import { StreamrClient } from '../../src/StreamrClient'
import ConfigTest from '../../src/ConfigTest'
import { getCreateClient } from '../test-utils/utils'
import { fastWallet } from 'streamr-test-utils'

describe('BrubeckNode', () => {
    const createClient = getCreateClient()

    describe('id assignment/generation', () => {
        it('generates node id from address, if id not supplied', async () => {
            const client = await createClient()
            const node = await client.getNode()
            const expectedPrefix = `${await client.getAddress()}#`
            expect(node.getNodeId().startsWith(expectedPrefix)).toBe(true)
            expect(node.getNodeId().length).toBeGreaterThan(expectedPrefix.length) // has more characters after #
        })

        it('generates different ids for different clients with same private key', async () => {
            const client1 = await createClient()
            // @ts-expect-error
            const client2 = await createClient({ auth: client1.options.auth })
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

        it('uses supplied network node id, if compatible', async () => {
            const wallet = fastWallet()
            const nodeId = `${wallet.address}#my-custom-id`
            const client = await createClient({
                auth: {
                    privateKey: wallet.privateKey
                },
                network: {
                    ...ConfigTest.network,
                    id: nodeId,
                }
            })
            const node = await client.getNode()
            expect(node.getNodeId()).toEqual(nodeId)
        })

        it('throws error if supplied network node id not compatible', async () => {
            const nodeId = '0xafafafafafafafafafafafafafafafafafafafaf#my-custom-id'
            const client = await createClient({
                network: {
                    id: nodeId,
                }
            })
            await expect(async () => {
                await client.getNode()
            }).rejects.toThrow(/not compatible with authenticated wallet/)
        })

        it('throws error if supplied network id whilst unauthenticated', async () => {
            const nodeId = '0xafafafafafafafafafafafafafafafafafafafaf#my-custom-id'
            const client = new StreamrClient({
                network: {
                    id: nodeId,
                }
            })
            await expect(async () => {
                await client.getNode()
            }).rejects.toThrow(/without authentication/)
        })
    })

    describe('create/destroy', () => {
        let client: StreamrClient

        beforeEach(async () => {
            client = await createClient()
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
                    await Promise.all(tasks)
                }).rejects.toThrow('destroy')
            })
        })
    })
})
