import { StreamrClient, StreamrClientOptions } from 'streamr-client'

export const show = (
    streamId: string,
    includePermissions: boolean | undefined,
    streamrOptions: StreamrClientOptions
): void => {
    const options = { ...streamrOptions }
    const client = new StreamrClient(options)
    client.getStream(streamId).then(async (stream) => {
        const obj = stream.toObject()
        if (includePermissions) {
            // @ts-expect-error permissions does not exist on {}
            obj.permissions = await stream.getPermissions()
        }
        console.info(JSON.stringify(obj, null, 2))
        process.exit(0)
        return true
    }).catch((err) => {
        console.error(err.message ? err.message : err)
        process.exit(1)
    })
}
