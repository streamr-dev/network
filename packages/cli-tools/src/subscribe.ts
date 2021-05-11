import { StreamrClient, StreamrClientOptions } from 'streamr-client'

export const subscribe = (stream: string, partition: number, streamrOptions: StreamrClientOptions) => {
    const options = { ...streamrOptions }
    new StreamrClient(options).subscribe({
        stream,
        partition,
    }, (message, streamMessage) => console.info(JSON.stringify(message)))
}
