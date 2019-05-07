const StreamrClient = require('streamr-client')

module.exports = function create(body, apiKey, streamrOptions) {
    const options = { ...streamrOptions }
    if (apiKey != null) {
        options.auth = { apiKey }
    }

    const client = new StreamrClient(options)
    client.createStream(body).then((stream) => {
        console.info(JSON.stringify(stream.toObject(), null, 2))
        process.exit(0)
    }).catch((err) => {
        console.error(err.message ? err.message : err)
        process.exit(1)
    })
}
