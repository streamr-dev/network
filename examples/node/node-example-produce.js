// To enable debug logging:
// DEBUG=StreamrClient node examples/node.js

const StreamrClient = require('streamr-client')

const STREAM_ID = 'MY-STREAM-ID'
const API_KEY = 'MY-API-KEY'

// Create the client and give the API key to use by default
const client = new StreamrClient({
    restUrl: 'http://localhost:8890/api/v1',
    apiKey: API_KEY
})

// Here is the event we'll be sending
const msg = {
    hello: 'world',
    random: Math.random()
}

// Produce the event to the Stream
client.produceToStream(STREAM_ID, msg)
    .then(() => console.log('Sent successfully: ', msg))
    .catch((err) => console.error(err))
