import { StreamrClient, StreamrClientOptions } from 'streamr-client'

export const subscribe = (streamId: string, streamPartition: number, streamrOptions: StreamrClientOptions): void => {
    const options = { ...streamrOptions }
    new StreamrClient(options).subscribe({
        streamId,
        streamPartition,
    }, (message) => console.info(JSON.stringify(message)))
}
