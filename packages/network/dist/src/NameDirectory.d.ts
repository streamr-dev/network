import { EthereumAddress } from '@streamr/utils';
export declare class NameDirectory {
    static MAX_FALLBACK_NAME_LENGTH: number;
    static getName(address: EthereumAddress | string | undefined): string | undefined;
}
