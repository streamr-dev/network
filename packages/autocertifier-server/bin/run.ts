import { AutoCertifierServer } from '../src/AutoCertifierServer'

const main = async () => {
    const autoCertifierServer = new AutoCertifierServer()
    await autoCertifierServer.start()
}

// TODO: catch handling
main()
