import { AutoCertifier } from './AutoCertifier'

const main = async () => {
    const autoCertifier = new AutoCertifier()
    await autoCertifier.start()
}

main()
