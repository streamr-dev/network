const StreamrBinaryMessage = require('./StreamrBinaryMessage')
const StreamrBinaryMessageV28 = require('./StreamrBinaryMessageV28')

const SIGNATURE_TYPE_NONE = 0
const SIGNATURE_TYPE_ETH = 1

function hexToBytes(buf, hex) {
    const hexToParse = hex.startsWith('0x') ? hex.substr(2) : hex
    const b = Buffer.from(hexToParse, 'hex')
    return buf.string(b)
}

function bytesToHex(bytes) {
    return `0x${bytes.toString('hex')}`
}

class StreamrBinaryMessageV29 extends StreamrBinaryMessageV28 {
    constructor(streamId, streamPartition, timestamp, ttl, contentType, content, signatureType, address, signature) {
        super(streamId, streamPartition, timestamp, ttl, contentType, content)
        this.version = StreamrBinaryMessage.VERSION_SIGNED
        this.signatureType = signatureType
        this.address = address
        this.signature = signature
    }

    toBufferMaker(bufferMaker) {
        let buf = super.toBufferMaker(bufferMaker)
        // 20 + streamIdLength + contentLength: signatureType (1)
        buf = buf.Int8(this.signatureType)
        if (this.signatureType === SIGNATURE_TYPE_ETH) {
            // 21 + streamIdLength + contentLength: address (20)
            buf = hexToBytes(buf, this.address)
            // 41 + streamIdLength + contentLength: signature (65)
            buf = hexToBytes(buf, this.signature)
        }
        return buf
    }

    toObject(contentAsBuffer) {
        const v28 = super.toObject(contentAsBuffer)
        v28.version = StreamrBinaryMessage.VERSION_SIGNED
        v28.signatureType = this.signatureType
        v28.address = this.address
        v28.signature = this.signature
        return v28
    }

    static fromBytes(reader) {
        const msgV28 = StreamrBinaryMessageV28.fromBytes(reader)
        const signatureType = reader.nextInt8()
        let address
        let signature
        if (signatureType === SIGNATURE_TYPE_ETH) {
            address = bytesToHex(reader.nextBuffer(20)) // an Ethereum address is 20 bytes.
            signature = bytesToHex(reader.nextBuffer(65)) // an Ethereum signature is 65 bytes.
        } else if (signatureType !== SIGNATURE_TYPE_NONE) {
            throw new Error(`Unknown signature type: ${signatureType}`)
        }
        return new StreamrBinaryMessageV29(
            msgV28.streamId,
            msgV28.streamPartition,
            msgV28.timestamp,
            msgV28.ttl,
            msgV28.contentType,
            msgV28.content,
            signatureType,
            address,
            signature,
        )
    }
}

/* static */ StreamrBinaryMessageV29.SIGNATURE_TYPE_NONE = SIGNATURE_TYPE_NONE
/* static */ StreamrBinaryMessageV29.SIGNATURE_TYPE_ETH = SIGNATURE_TYPE_ETH

module.exports = StreamrBinaryMessageV29
