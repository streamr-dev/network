const encoder = require('../../src/helpers/MessageEncoder')
const { version } = require('../../package.json')
const FindStorageNodesMessage = require('../../src/messages/FindStorageNodesMessage')
const InstructionMessage = require('../../src/messages/InstructionMessage')
const StorageNodesMessage = require('../../src/messages/StorageNodesMessage')
const { StreamID } = require('../../src/identifiers')

describe('encoder', () => {
    it('check streamMessage encoding/decoding', () => {
        const json = encoder.instructionMessage(new StreamID('stream-id', 0), ['node-1', 'node-2'])
        expect(JSON.parse(json)).toEqual({
            code: encoder.INSTRUCTION,
            version,
            payload: {
                streamId: 'stream-id',
                streamPartition: 0,
                nodeAddresses: [
                    'node-1',
                    'node-2'
                ]
            }
        })

        const source = '127.0.0.1'
        const streamMessage = encoder.decode(source, json)

        expect(streamMessage).toBeInstanceOf(InstructionMessage)
        expect(streamMessage.getSource()).toEqual('127.0.0.1')
        expect(streamMessage.getStreamId()).toEqual(new StreamID('stream-id', 0))
        expect(streamMessage.getNodeAddresses()).toEqual(['node-1', 'node-2'])
    })

    it('check encoding FIND_STORAGE_NODES', () => {
        const actual = encoder.findStorageNodesMessage(new StreamID('stream-id', 0))
        expect(JSON.parse(actual)).toEqual({
            code: encoder.FIND_STORAGE_NODES,
            version,
            payload: {
                streamId: 'stream-id',
                streamPartition: 0
            }
        })
    })

    it('check decoding FIND_STORAGE_NODES', () => {
        const unicastMessage = encoder.decode('source', JSON.stringify({
            code: encoder.FIND_STORAGE_NODES,
            version,
            payload: {
                streamId: 'stream-id',
                streamPartition: 0
            }
        }))

        expect(unicastMessage).toBeInstanceOf(FindStorageNodesMessage)
        expect(unicastMessage.getVersion()).toEqual(version)
        expect(unicastMessage.getCode()).toEqual(encoder.FIND_STORAGE_NODES)
        expect(unicastMessage.getSource()).toEqual('source')

        expect(unicastMessage.getStreamId()).toEqual(new StreamID('stream-id', 0))
    })

    it('check encoding STORAGE_NODES', () => {
        const actual = encoder.storageNodesMessage(new StreamID('stream-id', 0), ['ws://node-1', 'ws://node-2'])
        expect(JSON.parse(actual)).toEqual({
            code: encoder.STORAGE_NODES,
            version,
            payload: {
                streamId: 'stream-id',
                streamPartition: 0,
                nodeAddresses: [
                    'ws://node-1',
                    'ws://node-2'
                ]
            }
        })
    })

    it('check decoding STORAGE_NODES', () => {
        const unicastMessage = encoder.decode('source', JSON.stringify({
            code: encoder.STORAGE_NODES,
            version,
            payload: {
                streamId: 'stream-id',
                streamPartition: 0,
                nodeAddresses: [
                    'ws://node-1',
                    'ws://node-2'
                ]
            }
        }))

        expect(unicastMessage).toBeInstanceOf(StorageNodesMessage)
        expect(unicastMessage.getVersion()).toEqual(version)
        expect(unicastMessage.getCode()).toEqual(encoder.STORAGE_NODES)
        expect(unicastMessage.getSource()).toEqual('source')

        expect(unicastMessage.getStreamId()).toEqual(new StreamID('stream-id', 0))
        expect(unicastMessage.getNodeAddresses()).toEqual(['ws://node-1', 'ws://node-2'])
    })
})

