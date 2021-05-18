import { StreamrClient, StreamrClientOptions } from 'streamr-client'

export const subscribe = (stream: string, partition: number, streamrOptions: StreamrClientOptions): void => {
    const options = { ...streamrOptions }
    new StreamrClient(options).subscribe({
        stream,
        partition,
    }, (message) => console.info(JSON.stringify(message)))
}
