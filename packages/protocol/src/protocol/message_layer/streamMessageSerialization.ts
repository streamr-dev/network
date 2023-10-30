import StreamMessage, { SignatureType, VERSION } from './StreamMessage'
import MessageRef from './MessageRef'
import MessageID from './MessageID'
import EncryptedGroupKey from './EncryptedGroupKey'
import { binaryToHex, hexToBinary } from '@streamr/utils'

import ValidationError from '../../errors/ValidationError'

export const LEGACY_SIGNATURE_TYPE_IN_BRUBECK_PROTOCOL = 2

// These functions were used for reading data from Brubeck-era storage nodes.
// All data there is signed with the legacy signature type.
// Eventually this whole file will be removed.

export function toArray(streamMessage: StreamMessage): any[] {
    if (streamMessage.signatureType === SignatureType.LEGACY_SECP256K1) {
        return [
            VERSION,
            streamMessage.messageId.toArray(),
            streamMessage.prevMsgRef ? streamMessage.prevMsgRef.toArray() : null,
            streamMessage.messageType,
            streamMessage.contentType,
            streamMessage.encryptionType,
            streamMessage.groupKeyId,
            binaryToHex(streamMessage.serializedContent),
            streamMessage.newGroupKey ? streamMessage.newGroupKey.serialize() : null,
            LEGACY_SIGNATURE_TYPE_IN_BRUBECK_PROTOCOL,
            binaryToHex(streamMessage.signature),
        ]
    } else {
        throw new Error(`The legacy serializer only supports the legacy signature type! If you see this error, something new is using something old!`)
    }
}

export function fromArray(arr: any[]): StreamMessage {
    const [
        _version,
        messageIdArr,
        prevMsgRefArr,
        messageType,
        contentType,
        encryptionType,
        groupKeyId,
        serializedContent,
        serializedNewGroupKey,
        signatureType,
        signature
    ] = arr

    if (signatureType !== LEGACY_SIGNATURE_TYPE_IN_BRUBECK_PROTOCOL) {
        throw new ValidationError(`Unsupported signature type: ${signatureType}`)
    }

    return new StreamMessage({
        messageId: MessageID.fromArray(messageIdArr),
        prevMsgRef: prevMsgRefArr ? MessageRef.fromArray(prevMsgRefArr) : null,
        content: new Uint8Array(hexToBinary(serializedContent)),
        messageType,
        contentType,
        encryptionType,
        groupKeyId,
        newGroupKey: serializedNewGroupKey ? EncryptedGroupKey.deserialize(serializedNewGroupKey) : null,
        signature: hexToBinary(signature),
        signatureType: SignatureType.LEGACY_SECP256K1,
    })
}
