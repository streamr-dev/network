import { Certificate } from './Certificate'

// TODO: remove subdomain field? information is already in fqdn
export interface CertifiedSubdomain {
    subdomain: string
    fqdn: string
    token: string
    certificate: Certificate
}
