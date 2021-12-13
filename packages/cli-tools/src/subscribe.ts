import { StreamrClient } from 'streamr-client'

export const subscribe = (streamId: string, streamPartition: number, client: StreamrClient): void => {
    client.subscribe({
        streamId,
        streamPartition,
    }, (message) => console.info(JSON.stringify(message)))
}
