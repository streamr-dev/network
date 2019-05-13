const StreamrClient = require('streamr-client')

module.exports = async function resend(streamId, apiKey, resendOpts, streamrOptions) {
    const options = { ...streamrOptions }
    if (apiKey != null) {
        options.auth = { apiKey }
    }
    const client = new StreamrClient(options)

    let sub
    try {
        sub = await client.resend({
            stream: streamId,
            resend: resendOpts
        }, (message) => {
            console.info(JSON.stringify(message))
        })
    } catch (err) {
        console.error(err.message ? err.message : err)
        process.exit(1)
    }

    sub.on('error', (err) => {
        console.error(err)
        process.exit(1)
    })

    sub.on('resent', () => {
        process.exit(0)
    })

    sub.on('no_resend', () => {
        process.exit(0)
    })
}
