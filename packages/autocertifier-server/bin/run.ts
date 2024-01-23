import { AutoCertifierServer } from '../src/AutoCertifierServer'

const main = async () => {
    const autoCertifierServer = new AutoCertifierServer()
    await autoCertifierServer.start()
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main()
