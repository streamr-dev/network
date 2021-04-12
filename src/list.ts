import { StreamListQuery, StreamrClient, StreamrClientOptions } from 'streamr-client'
import EasyTable from 'easy-table'

export const list = (query: StreamListQuery, streamrOptions: StreamrClientOptions) => {
    const options = { ...streamrOptions }
    const client = new StreamrClient(options)
    client.listStreams(query).then((streams) => {
        if (streams.length > 0) {
            // @ts-expect-error
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
