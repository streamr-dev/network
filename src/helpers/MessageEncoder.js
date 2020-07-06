const { ControlLayer } = require('streamr-client-protocol')

const FindStorageNodesMessage = require('../messages/FindStorageNodesMessage')
const InstructionMessage = require('../messages/InstructionMessage')
const StatusMessage = require('../messages/StatusMessage')
const StorageNodesMessage = require('../messages/StorageNodesMessage')
const WrapperMessage = require('../messages/WrapperMessage')
const { StreamIdAndPartition } = require('../identifiers')
const { msgTypes, CURRENT_VERSION } = require('../messages/messageTypes')

const encode = (type, payload) => {
    if (type < 0 || type > 4) {
        throw new Error(`Unknown message type: ${type}`)
    }

    return JSON.stringify({
        version: CURRENT_VERSION,
        code: type,
        payload
    })
}

const decode = (source, message) => {
    let code
    let payload

    try {
        ({ code, payload } = JSON.parse(message))
    } catch (e) {
        return undefined
    }

    switch (code) {
        case msgTypes.STATUS:
            return new StatusMessage(payload, source)

        case msgTypes.INSTRUCTION:
            return new InstructionMessage(
                new StreamIdAndPartition(payload.streamId, payload.streamPartition),
                payload.nodeAddresses,
                payload.counter,
                source
            )

        case msgTypes.FIND_STORAGE_NODES:
            return new FindStorageNodesMessage(
                new StreamIdAndPartition(payload.streamId, payload.streamPartition),
                source
            )

        case msgTypes.STORAGE_NODES:
            return new StorageNodesMessage(
                new StreamIdAndPartition(payload.streamId, payload.streamPartition),
                payload.nodeAddresses,
                source
            )

        case msgTypes.WRAPPER:
            return new WrapperMessage(ControlLayer.ControlMessage.deserialize(payload.serializedControlLayerPayload, false), source)

        default:
            console.warn(`Got from "${source}" unknown message type with content: "${message}"`)
            return undefined
    }
}

module.exports = {
    decode,
    statusMessage: (status) => encode(msgTypes.STATUS, status),
    instructionMessage: (streamId, nodeAddresses, counter) => encode(msgTypes.INSTRUCTION, {
        streamId: streamId.id,
        streamPartition: streamId.partition,
        nodeAddresses,
        counter
    }),
    findStorageNodesMessage: (streamId) => encode(msgTypes.FIND_STORAGE_NODES, {
        streamId: streamId.id,
        streamPartition: streamId.partition
    }),
    storageNodesMessage: (streamId, nodeAddresses) => encode(msgTypes.STORAGE_NODES, {
        streamId: streamId.id,
        streamPartition: streamId.partition,
        nodeAddresses
    }),
    wrapperMessage: (controlLayerPayload) => encode(msgTypes.WRAPPER, {
        serializedControlLayerPayload: controlLayerPayload.serialize()
    }),
    ...msgTypes,
    CURRENT_VERSION
}
