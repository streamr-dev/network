const { MessageID, MessageReference } = require('../identifiers')
const { msgTypes, CURRENT_VERSION } = require('./messageTypes')

module.exports = class DataMessage {
    constructor(messageId, previousMessageReference, data, signature, signatureType, source = null) {
        if (!(messageId instanceof MessageID)) {
            throw new Error(`invalid messageId: ${messageId}`)
        }
        if (!(previousMessageReference instanceof MessageReference) && previousMessageReference !== null) {
            throw new Error(`invalid previousMessageReference: ${previousMessageReference}`)
        }
        if (typeof data === 'undefined') {
            throw new Error(`invalid data: ${data}`)
        }

        this.version = CURRENT_VERSION
        this.code = msgTypes.DATA
        this.source = source

        this.messageId = messageId
        this.previousMessageReference = previousMessageReference
        this.data = data
        this.signature = signature
        this.signatureType = signatureType
    }

    getVersion() {
        return this.version
    }

    getCode() {
        return this.code
    }

    getSource() {
        return this.source
    }

    getMessageId() {
        return this.messageId
    }

    getPreviousMessageReference() {
        return this.previousMessageReference
    }

    getData() {
        return this.data
    }

    getSignature() {
        return this.signature
    }

    getSignatureType() {
        return this.signatureType
    }
}

