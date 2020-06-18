const StreamrClient = require('streamr-client')

module.exports = function subscribe(stream, partition, streamrOptions) {
    const options = { ...streamrOptions }
    new StreamrClient(options).subscribe({
        stream,
        partition,
    }, (message, streamMessage) => console.info(JSON.stringify(message)))
}
