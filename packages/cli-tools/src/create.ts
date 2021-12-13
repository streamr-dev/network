import { StreamProperties, StreamrClient } from 'streamr-client'

export const create = (
    // id is required
    body: Partial<StreamProperties> & Required<Pick<StreamProperties, "id">>,
    client: StreamrClient
): void => {
    client.createStream(body).then((stream) => {
        console.info(JSON.stringify(stream.toObject(), null, 2))
        process.exit(0)
        return true
    }).catch((err) => {
        console.error(err.message ? err.message : err)
        process.exit(1)
    })
}
