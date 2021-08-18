import {createStorageNodeRegistry, getStorageNodeRegistryFromContract} from '../../src/utils/StorageNodeRegistry'

const contractAddress = '0xbAA81A0179015bE47Ad439566374F2Bae098686F'
const jsonRpcProvider = `http://${process.env.STREAMR_DOCKER_DEV_HOST || 'localhost'}:8546`

describe('StorageNodeRegistry', () => {

    test('throw exception if address is wrong (ENS)', async (done) => {
        try {
            await getStorageNodeRegistryFromContract({
                contractAddress: 'address', jsonRpcProvider
            })
        } catch (e) {
            expect(e.toString()).toContain('ENS')
            done()
        }
    })

    test('throw exception if address is wrong', async (done) => {
        try {
            await getStorageNodeRegistryFromContract({
                contractAddress: '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', jsonRpcProvider
            })
        } catch (e) {
            expect(e.toString()).toContain('Error: call revert exception')
            done()
        }
    })

    test('throw exception if jsonRpcProvider is wrong', async (done) => {
        try {
            await getStorageNodeRegistryFromContract({
                contractAddress, jsonRpcProvider: 'jsonRpcProvider'
            })
        } catch (e) {
            expect(e.toString()).toContain('Error: could not detect network')
            done()
        }
    })

    describe('getAllStorageNodes', () => {
        test('get array of storage nodes', async () => {
            const storageNodeRegistry = await getStorageNodeRegistryFromContract({
                contractAddress, jsonRpcProvider
            })

            expect(storageNodeRegistry.getAllStorageNodes()).toStrictEqual([
                {
                    address: "0xde1112f631486CfC759A50196853011528bC5FA0",
                    url: "http://10.200.10.1:8891",
                }
            ])
        })
    })

    describe('getStorageNodeHTTP', () => {
        test('get storage node HTTP with address', async () => {
            const storageNodeRegistry = await getStorageNodeRegistryFromContract({
                contractAddress, jsonRpcProvider
            })

            expect(
                storageNodeRegistry.getStorageNodeHTTP("0xde1112f631486CfC759A50196853011528bC5FA0")
            ).toEqual("http://10.200.10.1:8891")
        })

        test('throw error if address not found', async () => {
            const storageNodeRegistry = await getStorageNodeRegistryFromContract({
                contractAddress, jsonRpcProvider
            })

            expect(() => {
                storageNodeRegistry.getStorageNodeHTTP("0xincorrectAddress")
            }).toThrow()
        })
    })

    describe('createStorageNodeRegistry', () => {
        test('creates storage node registry', () => {
            const storageNodeRegistry = createStorageNodeRegistry([
                {
                    address: "0xde1112f631486CfC759A50196853011528bC5FA0",
                    url: "http://10.200.10.1:8891",
                }
            ])

            expect(storageNodeRegistry.getAllStorageNodes()).toStrictEqual([
                {
                    address: "0xde1112f631486CfC759A50196853011528bC5FA0",
                    url: "http://10.200.10.1:8891",
                }
            ])
        })
    })
})