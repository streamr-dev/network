// checks that require works
const StreamrClient = require('streamr-client')

console.info('const StreamrClient = require(\'streamr-client\'):', { StreamrClient })

const auth = StreamrClient.generateEthereumAccount()
const client = new StreamrClient({
    auth,
})

client.connect().then(async () => {
    console.info('success')
    await client.disconnect()
    process.exit(0)
})
