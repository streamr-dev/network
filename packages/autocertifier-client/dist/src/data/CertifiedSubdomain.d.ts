import { Certificate } from './Certificate';
export interface CertifiedSubdomain {
    subdomain: string;
    token: string;
    certificate: Certificate;
}
