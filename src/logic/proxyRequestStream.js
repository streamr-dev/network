const { ResendResponseResending,
    ResendResponseResent,
    ResendResponseNoResend } = require('streamr-client-protocol').ControlLayer

module.exports = function proxyRequestStream(sendFn, request, requestStream) {
    const { streamId, streamPartition, subId } = request
    let fulfilled = false
    requestStream
        .once('data', () => {
            sendFn(ResendResponseResending.create(streamId, streamPartition, subId))
            fulfilled = true
        })
        .on('data', (unicastMessage) => {
            sendFn(unicastMessage)
        })
        .on('end', () => {
            if (fulfilled) {
                sendFn(ResendResponseResent.create(streamId, streamPartition, subId))
            } else {
                sendFn(ResendResponseNoResend.create(streamId, streamPartition, subId))
            }
        })
}
