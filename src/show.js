const StreamrClient = require('streamr-client')

module.exports = function show(streamId, apiKey, includePermissions, streamrOptions) {
    const options = { ...streamrOptions }
    if (apiKey != null) {
        options.auth = { apiKey }
    }

    const client = new StreamrClient(options)
    client.getStream(streamId).then(async (stream) => {
        const obj = stream.toObject()
        if (includePermissions) {
            obj.permissions = await stream.getPermissions()
        }
        console.info(JSON.stringify(obj, null, 2))
        process.exit(0)
    }).catch((err) => {
        console.error(err.message ? err.message : err)
        process.exit(1)
    })
}
