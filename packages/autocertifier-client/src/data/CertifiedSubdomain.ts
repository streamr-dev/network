import { Certificate } from './Certificate'

export interface CertifiedSubdomain {
    subdomain: string
    fqdn: string
    token: string
    certificate: Certificate
}
