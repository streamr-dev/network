const StreamrClient = require('streamr-client')

module.exports = function listen(stream, apiKey, alternativeWsUrl, alternativeHttpUrl) {
    const auth = { apiKey }
    const options = alternativeWsUrl ? {
        url: alternativeWsUrl,
        restUrl: alternativeHttpUrl,
        auth
    } : { auth }

    const client = new StreamrClient(options)
    client.subscribe({
        stream,
        apiKey
    }, (message, metadata) => console.info(JSON.stringify(message)))
    client.on('error', (err) => {
        console.error(err.message ? err.message : err)
        process.exit(1)
    })
}
