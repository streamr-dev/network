const { ResendResponseResending,
    ResendResponseResent,
    ResendResponseNoResend } = require('streamr-client-protocol').ControlLayer

module.exports = function proxyRequestStream(sendFn, request, requestStream) {
    const { streamId, streamPartition, requestId } = request
    let fulfilled = false
    requestStream
        .once('data', () => {
            sendFn(new ResendResponseResending({
                requestId, streamId, streamPartition
            }))
            fulfilled = true
        })
        .on('data', (unicastMessage) => {
            sendFn(unicastMessage)
        })
        .on('end', () => {
            if (fulfilled) {
                sendFn(new ResendResponseResent({
                    requestId, streamId, streamPartition
                }))
            } else {
                sendFn(new ResendResponseNoResend({
                    requestId, streamId, streamPartition
                }))
            }
        })
}
