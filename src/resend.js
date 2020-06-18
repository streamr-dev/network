const StreamrClient = require('streamr-client')

module.exports = async function resend(streamId, resendOpts, streamrOptions) {
    const options = { ...streamrOptions }
    const client = new StreamrClient(options)

    let sub
    try {
        const subscribeOpts = {
            stream: streamId,
            resend: resendOpts
        }
        const handler = (message) => {
            console.info(JSON.stringify(message))
        }

        if (options.subscribe) {
            sub = await client.subscribe(subscribeOpts, handler)
        } else {
            sub = await client.resend(subscribeOpts, handler)
        }
    } catch (err) {
        console.error(err.message ? err.message : err)
        process.exit(1)
    }

    sub.on('error', (err) => {
        console.error(err)
        process.exit(1)
    })

    sub.on('resent', () => {
        if (!options.subscribe) {
            process.exit(0)
        }
    })

    sub.on('no_resend', () => {
        if (!options.subscribe) {
            process.exit(0)
        }
    })
}
