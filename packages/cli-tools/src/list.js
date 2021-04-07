const StreamrClient = require('streamr-client')
const EasyTable = require('easy-table')

module.exports = function list(query, streamrOptions) {
    const options = { ...streamrOptions }
    const client = new StreamrClient(options)
    client.listStreams(query).then((streams) => {
        if (streams.length > 0) {
            console.info(EasyTable.print(streams.map(({id, name, lastUpdated}) => ({
                lastUpdated,
                id,
                name
            }))))
        }
        process.exit(0)
    }, (err) => {
        console.error(err.message ? err.message : err)
        process.exit(1)
    })
}
