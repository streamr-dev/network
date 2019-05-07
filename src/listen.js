const StreamrClient = require('streamr-client')

module.exports = function listen(stream, apiKey, streamrOptions) {
    const options = { ...streamrOptions }
    if (apiKey != null) {
        options.auth = { apiKey }
    }
    new StreamrClient(options).subscribe({
        stream,
        apiKey
    }, (message, metadata) => console.info(JSON.stringify(message)))
}
