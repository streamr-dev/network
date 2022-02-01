import { createStorageNodeRegistry } from '../../../src/utils/StorageNodeRegistry'

describe('StorageNodeRegistry', () => {
    describe('createStorageNodeRegistry', () => {
        test('creates storage node registry', () => {
            const storageNodeRegistry = createStorageNodeRegistry([
                {
                    address: "0xde1112f631486CfC759A50196853011528bC5FA0",
                    url: "http://10.200.10.1:8891/api/v1",
                }
            ])

            expect(storageNodeRegistry.getAllStorageNodes()).toStrictEqual([
                {
                    address: "0xde1112f631486CfC759A50196853011528bC5FA0",
                    url: "http://10.200.10.1:8891/api/v1",
                }
            ])
        })
    })
})
