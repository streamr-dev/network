import InvalidJsonError from './errors/InvalidJsonError'

const jsonContentTypeCode = 27
const fieldsByProtocolVersion = {
    '28': ['version', 'streamId', 'streamPartition', 'timestamp', 'ttl', 'offset', 'previousOffset', 'contentType', 'content'],
}
export const messageTypesByCode = ['b', 'u', 'subscribed', 'unsubscribed', 'resending', 'resent', 'no_resend', 'error']

export const messageCodesByType = {}
messageTypesByCode.forEach((type, idx) => {
    messageCodesByType[type] = idx
})

const BYE_KEY = '_bye'

// Slow, use only in exceptional situations
function getField(fieldName, msg) {
    return msg[fieldsByProtocolVersion[msg[0]].indexOf(fieldName)]
}

export const decodeBrowserWrapper = (rawMsg) => {
    const jsonMsg = JSON.parse(rawMsg)
    const version = jsonMsg[0]
    if (version !== 0) {
        throw new Error(`Unknown message version: ${version}`)
    }

    return {
        type: messageTypesByCode[jsonMsg[1]],
        subId: jsonMsg[2],
        msg: jsonMsg[3],
    }
}

export const decodeMessage = (type, message) => {
    if (type === 'b' || type === 'u') {
        if (fieldsByProtocolVersion[message[0]] === undefined) {
            throw new Error(`Unsupported version: ${message[0]}`)
        }
        const result = {}
        const fields = fieldsByProtocolVersion[message[0]]

        for (let i = 0; i < message.length; i++) {
            // Parse content if necessary
            if (fields[i] === 'content') {
                if (result.contentType === jsonContentTypeCode) {
                    try {
                        result[fields[i]] = JSON.parse(message[i])
                    } catch (err) {
                        throw new InvalidJsonError(
                            result.streamId,
                            message[i],
                            err,
                            getField('offset', message),
                            getField('previousOffset', message),
                        )
                    }
                } else {
                    throw new Error(`Unknown content type: ${result.contentType}`)
                }
            } else {
                result[fields[i]] = message[i]
            }
        }
        return result
    }
    return message
}

export const createSubscribeRequest = (stream, resendOptions) => {
    const req = {
        stream,
    }
    Object.keys(resendOptions).forEach((key) => {
        req[key] = resendOptions[key]
    })
    return req
}

export const isByeMessage = (message) => !!message[BYE_KEY]
