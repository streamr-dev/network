import { AutoCertifier } from './AutoCertifier'

const autoCertifier = new AutoCertifier()
autoCertifier.start().catch((err) => {
    console.error(err)
})
