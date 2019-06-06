const { ControlLayer } = require('streamr-client-protocol')
const FindStorageNodesMessage = require('../messages/FindStorageNodesMessage')
const InstructionMessage = require('../messages/InstructionMessage')
const StatusMessage = require('../messages/StatusMessage')
const SubscribeMessage = require('../messages/SubscribeMessage')
const ResendLastRequest = require('../messages/ResendLastRequest')
const ResendFromRequest = require('../messages/ResendFromRequest')
const ResendRangeRequest = require('../messages/ResendRangeRequest')
const ResendResponseResent = require('../messages/ResendResponseResent')
const ResendResponseResending = require('../messages/ResendResponseResending')
const ResendResponseNoResend = require('../messages/ResendResponseNoResend')
const StorageNodesMessage = require('../messages/StorageNodesMessage')
const { StreamID, MessageReference } = require('../identifiers')
const { msgTypes, CURRENT_VERSION } = require('../messages/messageTypes')

const encode = (type, payload) => {
    if (type < 0 || type > 14) {
        throw new Error(`Unknown message type: ${type}`)
    }

    return JSON.stringify({
        version: CURRENT_VERSION,
        code: type,
        payload
    })
}

const decode = (source, message) => {
    const { code, payload } = JSON.parse(message)
    if (code === undefined) {
        return ControlLayer.ControlMessage.deserialize(message)
    }

    switch (code) {
        case msgTypes.STATUS:
            return new StatusMessage(payload, source)

        case msgTypes.INSTRUCTION:
            return new InstructionMessage(
                new StreamID(payload.streamId, payload.streamPartition),
                payload.nodeAddresses,
                source
            )

        case msgTypes.SUBSCRIBE:
            return new SubscribeMessage(
                new StreamID(payload.streamId, payload.streamPartition),
                payload.leechOnly,
                source
            )

        case msgTypes.RESEND_LAST:
            return new ResendLastRequest(
                new StreamID(payload.streamId, payload.streamPartition),
                payload.subId,
                payload.numberLast,
                source
            )

        case msgTypes.RESEND_FROM:
            return new ResendFromRequest(
                new StreamID(payload.streamId, payload.streamPartition),
                payload.subId,
                MessageReference.fromObject(payload.fromMsgRef),
                payload.publisherId,
                payload.msgChainId,
                source
            )

        case msgTypes.RESEND_RANGE:
            return new ResendRangeRequest(
                new StreamID(payload.streamId, payload.streamPartition),
                payload.subId,
                MessageReference.fromObject(payload.fromMsgRef),
                MessageReference.fromObject(payload.toMsgRef),
                payload.publisherId,
                payload.msgChainId,
                source
            )

        case msgTypes.RESEND_RESPONSE_RESENDING:
            return new ResendResponseResending(
                new StreamID(payload.streamId, payload.streamPartition),
                payload.subId,
                source
            )

        case msgTypes.RESEND_RESPONSE_RESENT:
            return new ResendResponseResent(
                new StreamID(payload.streamId, payload.streamPartition),
                payload.subId,
                source
            )

        case msgTypes.RESEND_RESPONSE_NO_RESEND:
            return new ResendResponseNoResend(
                new StreamID(payload.streamId, payload.streamPartition),
                payload.subId,
                source
            )

        case msgTypes.FIND_STORAGE_NODES:
            return new FindStorageNodesMessage(
                new StreamID(payload.streamId, payload.streamPartition),
                source
            )

        case msgTypes.STORAGE_NODES:
            return new StorageNodesMessage(
                new StreamID(payload.streamId, payload.streamPartition),
                payload.nodeAddresses,
                source
            )

        default:
            throw new Error(`Unknown message type: ${code}`)
    }
}

module.exports = {
    decode,
    statusMessage: (status) => encode(msgTypes.STATUS, status),
    subscribeMessage: (streamId, leechOnly) => encode(msgTypes.SUBSCRIBE, {
        streamId: streamId.id,
        streamPartition: streamId.partition,
        leechOnly
    }),
    instructionMessage: (streamId, nodeAddresses) => encode(msgTypes.INSTRUCTION, {
        streamId: streamId.id,
        streamPartition: streamId.partition,
        nodeAddresses
    }),
    resendLastRequest: (streamId, subId, numberLast) => encode(msgTypes.RESEND_LAST, {
        streamId: streamId.id,
        streamPartition: streamId.partition,
        subId,
        numberLast
    }),
    resendFromRequest: (streamId, subId, fromMsgRef, publisherId, msgChainId) => encode(msgTypes.RESEND_FROM, {
        streamId: streamId.id,
        streamPartition: streamId.partition,
        subId,
        fromMsgRef,
        publisherId,
        msgChainId
    }),
    resendRangeRequest: (streamId, subId, fromMsgRef, toMsgRef, publisherId, msgChainId) => encode(msgTypes.RESEND_RANGE, {
        streamId: streamId.id,
        streamPartition: streamId.partition,
        subId,
        fromMsgRef,
        toMsgRef,
        publisherId,
        msgChainId
    }),
    resendResponseResending: (streamId, subId) => encode(msgTypes.RESEND_RESPONSE_RESENDING, {
        streamId: streamId.id,
        streamPartition: streamId.partition,
        subId,
    }),
    resendResponseResent: (streamId, subId) => encode(msgTypes.RESEND_RESPONSE_RESENT, {
        streamId: streamId.id,
        streamPartition: streamId.partition,
        subId,
    }),
    resendResponseNoResend: (streamId, subId) => encode(msgTypes.RESEND_RESPONSE_NO_RESEND, {
        streamId: streamId.id,
        streamPartition: streamId.partition,
        subId,
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
    ...msgTypes,
    CURRENT_VERSION
}
