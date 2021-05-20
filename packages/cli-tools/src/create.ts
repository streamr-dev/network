import { StreamProperties, StreamrClient, StreamrClientOptions} from 'streamr-client'

export const create = (body: Partial<StreamProperties>, streamrOptions: StreamrClientOptions): void => {
    const options = { ...streamrOptions }

    const client = new StreamrClient(options)
    client.createStream(body).then((stream) => {
        // @ts-expect-error TODO: toObject() is internal in streamr-client-javascript
        console.info(JSON.stringify(stream.toObject(), null, 2))
        process.exit(0)
        return true
    }).catch((err) => {
        console.error(err.message ? err.message : err)
        process.exit(1)
    })
}
