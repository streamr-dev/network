const { StreamMessage } = require('streamr-client-protocol').MessageLayer

const { MessageNotSignedError, MessageNotEncryptedError } = require('./errors/MessageNotSignedError')
const VolumeLogger = require('./VolumeLogger')

module.exports = class Publisher {
    constructor(networkNode, volumeLogger = new VolumeLogger(0)) {
        this.networkNode = networkNode
        this.volumeLogger = volumeLogger
    }

    publish(stream, streamMessage) {
        if (stream.requireSignedData && !streamMessage.signature) {
            throw new MessageNotSignedError('This stream requires published data to be signed.')
        }

        if (stream.requireEncryptedData && streamMessage.encryptionType === StreamMessage.ENCRYPTION_TYPES.NONE) {
            throw new MessageNotEncryptedError('This stream requires published data to be encrypted.')
        }

        this.volumeLogger.logInput(streamMessage.getContent().length)

        this.networkNode.publish(streamMessage)
    }
}
