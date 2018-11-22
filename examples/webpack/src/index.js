import StreamrClient from 'streamr-client'

const log = (msg) => {
    const elem = document.createElement('p')
    elem.innerHTML = msg
    document.body.appendChild(elem)
}

// Create the client with default options
const client = new StreamrClient()

document.getElementById('subscribe').addEventListener('click', () => {
    // Subscribe to a stream
    const subscription = client.subscribe({
        stream: '7wa7APtlTq6EC5iTCBy6dw',
        // Resend the last 10 messages on connect
        resend_last: 10,
    }, (message) => {
        // Handle the messages in this stream
        log(JSON.stringify(message))
    })

    // Event binding examples
    client.on('connected', () => {
        log('A connection has been established!')
    })

    subscription.on('subscribed', () => {
        log(`Subscribed to ${subscription.streamId}`)
    })

    subscription.on('resending', () => {
        log(`Resending from ${subscription.streamId}`)
    })

    subscription.on('resent', () => {
        log(`Resend complete for ${subscription.streamId}`)
    })

    subscription.on('no_resend', () => {
        log(`Nothing to resend for ${subscription.streamId}`)
    })
})

document.getElementById('publish').addEventListener('click', () => {
    // Here is the event we'll be sending
    const msg = {
        hello: 'world',
        random: Math.random(),
    }

    // Publish the event to the Stream
    client.publish('MY-STREAM-ID', msg, 'MY-API-KEY')
        .then(() => log('Sent successfully: ', msg))
        .catch((err) => log(err))
})
