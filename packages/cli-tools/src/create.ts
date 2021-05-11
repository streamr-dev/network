import { StreamProperties, StreamrClient } from 'streamr-client'

export const create = (body: any, streamrOptions: StreamProperties) => {
    const options = { ...streamrOptions }

    const client = new StreamrClient(options)
    client.createStream(body).then((stream) => {
        // @ts-expect-error
        console.info(JSON.stringify(stream.toObject(), null, 2))
        process.exit(0)
    }).catch((err) => {
        console.error(err.message ? err.message : err)
        process.exit(1)
    })
}
