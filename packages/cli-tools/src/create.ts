import { StreamProperties, StreamrClient, StreamrClientOptions} from 'streamr-client'

export const create = (
    // id is required
    body: Partial<StreamProperties> & Required<Pick<StreamProperties, "id">>,
    streamrOptions: StreamrClientOptions
): void => {
    const options = { ...streamrOptions }

    const client = new StreamrClient(options)
    client.createStream(body).then((stream) => {
        // @ts-expect-error toObject is internal
        console.info(JSON.stringify(stream.toObject(), null, 2))
        process.exit(0)
        return true
    }).catch((err) => {
        console.error(err.message ? err.message : err)
        process.exit(1)
    })
}
