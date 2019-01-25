import UnsupportedVersionError from '../../errors/UnsupportedVersionError'
import StreamMessageV28 from './StreamMessageV28'
import StreamMessageV29 from './StreamMessageV29'
import StreamMessageV30 from './StreamMessageV30'

export default class StreamMessageFactory {
    static deserialize(stringOrArray, parseContent = true) {
        const message = (typeof stringOrArray === 'string' ? JSON.parse(stringOrArray) : stringOrArray)
        let result

        /**
         * Version 28: [version, streamId, streamPartition, timestamp, ttl, offset, previousOffset, contentType, content]
         * Version 29: [version, streamId, streamPartition, timestamp, ttl, offset, previousOffset, contentType, content,
         * signatureType, address, signature]
         * Version 30: [version, [streamId, streamPartition, timestamp, sequenceNumber, producerId],
         * [prevTimestamp, prevSequenceNumber], ttl, contentType, content, signatureType, signature]
         */
        if (message[0] === 28) {
            result = new StreamMessageV28(...message.slice(1))
        } else if (message[0] === 29) {
            result = new StreamMessageV29(...message.slice(1))
        } else if (message[0] === 30) {
            result = new StreamMessageV30(...message.slice(1))
        } else {
            throw new UnsupportedVersionError(message[0], 'Supported versions: [28, 29, 30]')
        }
        // Ensure that the content parses
        if (parseContent) {
            result.getParsedContent()
        }
        return result
    }
}
