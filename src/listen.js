const StreamrClient = require('streamr-client')

module.exports = function listen(stream, apiKey, alternativeWsUrl, alternativeHttpUrl) {
    const auth = { apiKey }
    const options = alternativeWsUrl ? {
        url: alternativeWsUrl,
        restUrl: alternativeHttpUrl,
        auth
    } : { auth }

    new StreamrClient(options).subscribe({
        stream,
        apiKey
    }, (message, metadata) => console.info(JSON.stringify(message)))
}
