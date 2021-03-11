import { StreamrClient } from 'streamr-client';

// Create the client and supply either an API key or an Ethereum private key to authenticate
const client = new StreamrClient({
    auth: {
        privateKey: 'ETHEREUM-PRIVATE-KEY',
    },
})

// Create a stream for this example if it doesn't exist
client.getOrCreateStream({
    name: 'node-example-data',
}).then((stream) => {
    client.subscribe(
        {
            stream: stream.id,
            // Resend the last 10 messages on connect
            resend: {
                last: 10,
            },
        },
        (message) => {
            // Do something with the messages as they are received
            console.log(JSON.stringify(message))
        },
    )
})
