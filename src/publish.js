const Writable = require('stream').Writable
const StreamrClient = require('streamr-client')

module.exports = function publishStream(stream, apiKey, alternativeWsUrl, alternativeHttpUrl) {
    const auth = { apiKey }
    const options = alternativeWsUrl ? {
        url: alternativeWsUrl,
        restUrl: alternativeHttpUrl,
        auth,
    } : { auth }

    const client = new StreamrClient(options)
    const writable = new Writable({
        objectMode: true,
        write: (data, _, done) => {
            let json = null
            // ignore newlines, etc
            if (!data || String(data).trim() === '') {
                done()
                return
            }

            try {
                json = JSON.parse(data)
            } catch (e) {
                console.error(data.toString())
                done(e)
                return
            }

            client.publish(stream, json, Date.now(), apiKey).then(
                () => done(),
                (err) => done(err)
            )
        }
    })

    client.on('error', (err) => writable.emit('error', err))
    // disconnect client when upstream pipe ends and data flushed
    writable.once('finish', () => client.ensureDisconnected())
    return writable
}
