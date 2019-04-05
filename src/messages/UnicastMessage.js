const { MessageID, MessageReference } = require('../identifiers')
const DataMessage = require('./DataMessage')
const { msgTypes, CURRENT_VERSION } = require('./messageTypes')

module.exports = class UnicastMessage extends DataMessage {
    constructor(messageId, previousMessageReference, data, signature, signatureType, subId, source = null) {
        super(messageId, previousMessageReference, data, signature, signatureType, source)
        if (subId == null) {
            throw new Error('subId not given')
        }

        this.code = msgTypes.UNICAST
        this.subId = subId
    }

    getSubId() {
        return this.subId
    }
}

