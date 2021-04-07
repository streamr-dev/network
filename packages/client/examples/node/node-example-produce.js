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
}).then((stream) => setInterval(() => {
    // Generate a message payload with a random number
    const msg = {
        random: Math.random(),
    }

    // Publish the message to the Stream
    stream.publish(msg)
        .then(() => console.log('Sent successfully: ', msg))
        .catch((err) => console.error(err))
}, 1000))
