import { StreamrClient, StreamrClientOptions } from 'streamr-client'

export const show = (streamId: string, includePermissions: boolean|undefined, streamrOptions: StreamrClientOptions) => {
    const options = { ...streamrOptions }
    const client = new StreamrClient(options)
    client.getStream(streamId).then(async (stream) => {
        // @ts-expect-error
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
