import { StreamrClient } from 'streamr-client'

export const show = (
    streamId: string,
    includePermissions: boolean | undefined,
    client: StreamrClient
): void => {
    client.getStream(streamId).then(async (stream) => {
        const obj = stream.toObject()
        if (includePermissions) {
            // @ts-expect-error permissions not on {}
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
