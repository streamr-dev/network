// checks that require works
const StreamrClient = require('streamr-client')

console.info('const StreamrClient = require(\'streamr-client\'):', { StreamrClient })

const auth = StreamrClient.generateEthereumAccount()
const client = new StreamrClient({
    auth,
})

client.connect().then(() => {
    console.info('success')
    return client.disconnect()
})
