// checks that require works
const StreamrClient = require('@streamr/sdk')

console.info("const StreamrClient = require('@streamr/sdk'):", { StreamrClient })

const auth = StreamrClient.generateEthereumAccount()
const client = new StreamrClient({
    auth
})

client.connect().then(async () => {
    console.info('success')
    await client.destroy()
    process.exit(0)
})
