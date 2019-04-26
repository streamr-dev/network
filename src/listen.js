const StreamrClient = require('streamr-client')

module.exports = function listen(stream, apiKey, alternativeWsUrl, alternativeHttpUrl) {
    const options = alternativeWsUrl ? {
        url: alternativeWsUrl,
        restUrl: alternativeHttpUrl
    } : {}

    new StreamrClient(options).subscribe({
        stream,
        apiKey
    }, (message, metadata) => console.info(JSON.stringify(message)))
}
