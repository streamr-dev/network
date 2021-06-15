export const dataUnionMainnetABI = [{
    name: 'sendTokensToBridge',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
}, {
    name: 'token',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'owner',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'setAdminFee',
    inputs: [{ type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
}, {
    name: 'adminFeeFraction',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}]

export const dataUnionSidechainABI = [{
    name: 'addMembers',
    inputs: [{ type: 'address[]', internalType: 'address payable[]', }],
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
}, {
    name: 'partMembers',
    inputs: [{ type: 'address[]' }],
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
}, {
    name: 'withdrawAll',
    inputs: [{ type: 'address' }, { type: 'bool' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
}, {
    name: 'withdrawAllTo',
    inputs: [{ type: 'address' }, { type: 'bool' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
}, {
    name: 'withdrawAllToSigned',
    inputs: [{ type: 'address' }, { type: 'address' }, { type: 'bool' }, { type: 'bytes' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
}, {
    // enum ActiveStatus {None, Active, Inactive, Blocked}
    // struct MemberInfo {
    //     ActiveStatus status;
    //     uint256 earnings_before_last_join;
    //     uint256 lme_at_join;
    //     uint256 withdrawnEarnings;
    // }
    name: 'memberData',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint8' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}, {
    inputs: [],
    name: 'getStats',
    outputs: [{ type: 'uint256[6]' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'getEarnings',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'getWithdrawableEarnings',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'lifetimeMemberEarnings',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'totalWithdrawable',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'totalEarnings',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'activeMemberCount',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}, {
    // this event is emitted by withdrawing process,
    //   see https://github.com/poanetwork/tokenbridge-contracts/blob/master/contracts/upgradeable_contracts/arbitrary_message/HomeAMB.sol
    name: 'UserRequestForSignature',
    inputs: [
        { indexed: true, name: 'messageId', type: 'bytes32' },
        { indexed: false, name: 'encodedData', type: 'bytes' }
    ],
    anonymous: false,
    type: 'event'
}, {
    name: 'transferToMemberInContract',
    inputs: [
        { name: 'recipient', type: 'address', internalType: 'address' },
        { name: 'amount', type: 'uint256', internalType: 'uint256' }
    ],
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
}]

// Only the part of ABI that is needed by deployment (and address resolution)
export const factoryMainnetABI = [{
    type: 'constructor',
    inputs: [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'uint256' }],
    stateMutability: 'nonpayable'
}, {
    name: 'sidechainAddress',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'mainnetAddress',
    inputs: [{ type: 'address' }, { type: 'string' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'deployNewDataUnion',
    inputs: [{ type: 'address' }, { type: 'uint256' }, { type: 'address[]' }, { type: 'string' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function'
}, {
    name: 'amb',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'data_union_sidechain_factory',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function'
}]

export const mainnetAmbABI = [{
    name: 'executeSignatures',
    inputs: [{ type: 'bytes' }, { type: 'bytes' }], // data, signatures
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
}, {
    name: 'messageCallStatus',
    inputs: [{ type: 'bytes32' }], // messageId
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'failedMessageSender',
    inputs: [{ type: 'bytes32' }], // messageId
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'relayedMessages',
    inputs: [{ type: 'bytes32' }], // messageId, was called "_txhash" though?!
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'validatorContract',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function'
}]

export const sidechainAmbABI = [{
    name: 'signature',
    inputs: [{ type: 'bytes32' }, { type: 'uint256' }], // messageHash, index
    outputs: [{ type: 'bytes' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'message',
    inputs: [{ type: 'bytes32' }], // messageHash
    outputs: [{ type: 'bytes' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'requiredSignatures',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'numMessagesSigned',
    inputs: [{ type: 'bytes32' }], // messageHash (TODO: double check)
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}]

export const erc20AllowanceAbi = [{
    name: 'allowance',
    inputs: [{ type: 'address' }, { type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
}, {
    name: 'increaseAllowance',
    inputs: [{ type: 'address' }, { type: 'uint256' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function'
}]
