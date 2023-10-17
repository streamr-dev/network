import { AutoCertifier } from '../src/AutoCertifier'

const main = async () => {
    const autoCertifier = new AutoCertifier()
    await autoCertifier.start()
}

main()
