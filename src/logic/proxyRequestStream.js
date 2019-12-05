const { ResendResponseResending,
    ResendResponseResent,
    ResendResponseNoResend } = require('streamr-client-protocol').ControlLayer

module.exports = function proxyRequestStream(sendFn, request, requestStream) {
    const { streamId, streamPartition, requestId } = request
    let fulfilled = false
    requestStream
        .once('data', () => {
            sendFn(ResendResponseResending.create(streamId, streamPartition, requestId))
            fulfilled = true
        })
        .on('data', (unicastMessage) => {
            sendFn(unicastMessage)
        })
        .on('end', () => {
            if (fulfilled) {
                sendFn(ResendResponseResent.create(streamId, streamPartition, requestId))
            } else {
                sendFn(ResendResponseNoResend.create(streamId, streamPartition, requestId))
            }
        })
}
