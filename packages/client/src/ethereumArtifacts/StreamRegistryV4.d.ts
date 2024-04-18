import type { BaseContract, BigNumberish, BytesLike, FunctionFragment, Result, Interface, EventFragment, AddressLike, ContractRunner, ContractMethod, Listener } from "ethers";
import type { TypedContractEvent, TypedDeferredTopicFilter, TypedEventLog, TypedLogDescription, TypedListener, TypedContractMethod } from "../../common";
export declare namespace StreamRegistryV4 {
    type PermissionStruct = {
        canEdit: boolean;
        canDelete: boolean;
        publishExpiration: BigNumberish;
        subscribeExpiration: BigNumberish;
        canGrant: boolean;
    };
    type PermissionStructOutput = [
        canEdit: boolean,
        canDelete: boolean,
        publishExpiration: bigint,
        subscribeExpiration: bigint,
        canGrant: boolean
    ] & {
        canEdit: boolean;
        canDelete: boolean;
        publishExpiration: bigint;
        subscribeExpiration: bigint;
        canGrant: boolean;
    };
}
export interface StreamRegistryV4Interface extends Interface {
    getFunction(nameOrSignature: "DEFAULT_ADMIN_ROLE" | "ENScreateStreamCallback" | "MAX_INT" | "TRUSTED_ROLE" | "addressToString" | "createMultipleStreamsWithPermissions" | "createStream" | "createStreamWithENS" | "createStreamWithPermissions" | "deleteStream" | "exists" | "getAddressKey" | "getDirectPermissionsForUser" | "getPermissionsForUser" | "getRoleAdmin" | "getStreamMetadata" | "getTrustedRole" | "grantPermission" | "grantPublicPermission" | "grantRole" | "hasDirectPermission" | "hasPermission" | "hasPublicPermission" | "hasRole" | "initialize" | "proxiableUUID" | "renounceRole" | "revokeAllPermissionsForUser" | "revokePermission" | "revokePublicPermission" | "revokeRole" | "setEnsCache" | "setExpirationTime" | "setPermissions" | "setPermissionsForUser" | "setPermissionsMultipleStreams" | "setPermissionsMultipleStreans" | "setPublicPermission" | "streamIdToMetadata" | "streamIdToPermissions" | "supportsInterface" | "transferAllPermissionsToUser" | "transferPermissionToUser" | "trustedCreateStreams" | "trustedSetPermissions" | "trustedSetPermissionsForUser" | "trustedSetStreamMetadata" | "trustedSetStreamWithPermission" | "trustedSetStreams" | "updateStreamMetadata" | "upgradeTo" | "upgradeToAndCall"): FunctionFragment;
    getEvent(nameOrSignatureOrTopic: "AdminChanged" | "BeaconUpgraded" | "Initialized" | "PermissionUpdated" | "RoleAdminChanged" | "RoleGranted" | "RoleRevoked" | "StreamCreated" | "StreamDeleted" | "StreamUpdated" | "Upgraded"): EventFragment;
    encodeFunctionData(functionFragment: "DEFAULT_ADMIN_ROLE", values?: undefined): string;
    encodeFunctionData(functionFragment: "ENScreateStreamCallback", values: [AddressLike, string, string, string]): string;
    encodeFunctionData(functionFragment: "MAX_INT", values?: undefined): string;
    encodeFunctionData(functionFragment: "TRUSTED_ROLE", values?: undefined): string;
    encodeFunctionData(functionFragment: "addressToString", values: [AddressLike]): string;
    encodeFunctionData(functionFragment: "createMultipleStreamsWithPermissions", values: [
        string[],
        string[],
        AddressLike[][],
        StreamRegistryV4.PermissionStruct[][]
    ]): string;
    encodeFunctionData(functionFragment: "createStream", values: [string, string]): string;
    encodeFunctionData(functionFragment: "createStreamWithENS", values: [string, string, string]): string;
    encodeFunctionData(functionFragment: "createStreamWithPermissions", values: [string, string, AddressLike[], StreamRegistryV4.PermissionStruct[]]): string;
    encodeFunctionData(functionFragment: "deleteStream", values: [string]): string;
    encodeFunctionData(functionFragment: "exists", values: [string]): string;
    encodeFunctionData(functionFragment: "getAddressKey", values: [string, AddressLike]): string;
    encodeFunctionData(functionFragment: "getDirectPermissionsForUser", values: [string, AddressLike]): string;
    encodeFunctionData(functionFragment: "getPermissionsForUser", values: [string, AddressLike]): string;
    encodeFunctionData(functionFragment: "getRoleAdmin", values: [BytesLike]): string;
    encodeFunctionData(functionFragment: "getStreamMetadata", values: [string]): string;
    encodeFunctionData(functionFragment: "getTrustedRole", values?: undefined): string;
    encodeFunctionData(functionFragment: "grantPermission", values: [string, AddressLike, BigNumberish]): string;
    encodeFunctionData(functionFragment: "grantPublicPermission", values: [string, BigNumberish]): string;
    encodeFunctionData(functionFragment: "grantRole", values: [BytesLike, AddressLike]): string;
    encodeFunctionData(functionFragment: "hasDirectPermission", values: [string, AddressLike, BigNumberish]): string;
    encodeFunctionData(functionFragment: "hasPermission", values: [string, AddressLike, BigNumberish]): string;
    encodeFunctionData(functionFragment: "hasPublicPermission", values: [string, BigNumberish]): string;
    encodeFunctionData(functionFragment: "hasRole", values: [BytesLike, AddressLike]): string;
    encodeFunctionData(functionFragment: "initialize", values: [AddressLike, AddressLike]): string;
    encodeFunctionData(functionFragment: "proxiableUUID", values?: undefined): string;
    encodeFunctionData(functionFragment: "renounceRole", values: [BytesLike, AddressLike]): string;
    encodeFunctionData(functionFragment: "revokeAllPermissionsForUser", values: [string, AddressLike]): string;
    encodeFunctionData(functionFragment: "revokePermission", values: [string, AddressLike, BigNumberish]): string;
    encodeFunctionData(functionFragment: "revokePublicPermission", values: [string, BigNumberish]): string;
    encodeFunctionData(functionFragment: "revokeRole", values: [BytesLike, AddressLike]): string;
    encodeFunctionData(functionFragment: "setEnsCache", values: [AddressLike]): string;
    encodeFunctionData(functionFragment: "setExpirationTime", values: [string, AddressLike, BigNumberish, BigNumberish]): string;
    encodeFunctionData(functionFragment: "setPermissions", values: [string, AddressLike[], StreamRegistryV4.PermissionStruct[]]): string;
    encodeFunctionData(functionFragment: "setPermissionsForUser", values: [
        string,
        AddressLike,
        boolean,
        boolean,
        BigNumberish,
        BigNumberish,
        boolean
    ]): string;
    encodeFunctionData(functionFragment: "setPermissionsMultipleStreams", values: [string[], AddressLike[][], StreamRegistryV4.PermissionStruct[][]]): string;
    encodeFunctionData(functionFragment: "setPermissionsMultipleStreans", values: [string[], AddressLike[][], StreamRegistryV4.PermissionStruct[][]]): string;
    encodeFunctionData(functionFragment: "setPublicPermission", values: [string, BigNumberish, BigNumberish]): string;
    encodeFunctionData(functionFragment: "streamIdToMetadata", values: [string]): string;
    encodeFunctionData(functionFragment: "streamIdToPermissions", values: [string, BytesLike]): string;
    encodeFunctionData(functionFragment: "supportsInterface", values: [BytesLike]): string;
    encodeFunctionData(functionFragment: "transferAllPermissionsToUser", values: [string, AddressLike]): string;
    encodeFunctionData(functionFragment: "transferPermissionToUser", values: [string, AddressLike, BigNumberish]): string;
    encodeFunctionData(functionFragment: "trustedCreateStreams", values: [string[], string[]]): string;
    encodeFunctionData(functionFragment: "trustedSetPermissions", values: [string[], AddressLike[], StreamRegistryV4.PermissionStruct[]]): string;
    encodeFunctionData(functionFragment: "trustedSetPermissionsForUser", values: [
        string,
        AddressLike,
        boolean,
        boolean,
        BigNumberish,
        BigNumberish,
        boolean
    ]): string;
    encodeFunctionData(functionFragment: "trustedSetStreamMetadata", values: [string, string]): string;
    encodeFunctionData(functionFragment: "trustedSetStreamWithPermission", values: [
        string,
        string,
        AddressLike,
        boolean,
        boolean,
        BigNumberish,
        BigNumberish,
        boolean
    ]): string;
    encodeFunctionData(functionFragment: "trustedSetStreams", values: [
        string[],
        AddressLike[],
        string[],
        StreamRegistryV4.PermissionStruct[]
    ]): string;
    encodeFunctionData(functionFragment: "updateStreamMetadata", values: [string, string]): string;
    encodeFunctionData(functionFragment: "upgradeTo", values: [AddressLike]): string;
    encodeFunctionData(functionFragment: "upgradeToAndCall", values: [AddressLike, BytesLike]): string;
    decodeFunctionResult(functionFragment: "DEFAULT_ADMIN_ROLE", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "ENScreateStreamCallback", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "MAX_INT", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "TRUSTED_ROLE", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "addressToString", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "createMultipleStreamsWithPermissions", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "createStream", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "createStreamWithENS", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "createStreamWithPermissions", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "deleteStream", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "exists", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "getAddressKey", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "getDirectPermissionsForUser", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "getPermissionsForUser", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "getRoleAdmin", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "getStreamMetadata", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "getTrustedRole", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "grantPermission", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "grantPublicPermission", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "grantRole", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "hasDirectPermission", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "hasPermission", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "hasPublicPermission", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "hasRole", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "initialize", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "proxiableUUID", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "renounceRole", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "revokeAllPermissionsForUser", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "revokePermission", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "revokePublicPermission", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "revokeRole", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "setEnsCache", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "setExpirationTime", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "setPermissions", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "setPermissionsForUser", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "setPermissionsMultipleStreams", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "setPermissionsMultipleStreans", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "setPublicPermission", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "streamIdToMetadata", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "streamIdToPermissions", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "supportsInterface", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "transferAllPermissionsToUser", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "transferPermissionToUser", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "trustedCreateStreams", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "trustedSetPermissions", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "trustedSetPermissionsForUser", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "trustedSetStreamMetadata", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "trustedSetStreamWithPermission", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "trustedSetStreams", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "updateStreamMetadata", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "upgradeTo", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "upgradeToAndCall", data: BytesLike): Result;
}
export declare namespace AdminChangedEvent {
    type InputTuple = [previousAdmin: AddressLike, newAdmin: AddressLike];
    type OutputTuple = [previousAdmin: string, newAdmin: string];
    interface OutputObject {
        previousAdmin: string;
        newAdmin: string;
    }
    type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
    type Filter = TypedDeferredTopicFilter<Event>;
    type Log = TypedEventLog<Event>;
    type LogDescription = TypedLogDescription<Event>;
}
export declare namespace BeaconUpgradedEvent {
    type InputTuple = [beacon: AddressLike];
    type OutputTuple = [beacon: string];
    interface OutputObject {
        beacon: string;
    }
    type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
    type Filter = TypedDeferredTopicFilter<Event>;
    type Log = TypedEventLog<Event>;
    type LogDescription = TypedLogDescription<Event>;
}
export declare namespace InitializedEvent {
    type InputTuple = [version: BigNumberish];
    type OutputTuple = [version: bigint];
    interface OutputObject {
        version: bigint;
    }
    type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
    type Filter = TypedDeferredTopicFilter<Event>;
    type Log = TypedEventLog<Event>;
    type LogDescription = TypedLogDescription<Event>;
}
export declare namespace PermissionUpdatedEvent {
    type InputTuple = [
        streamId: string,
        user: AddressLike,
        canEdit: boolean,
        canDelete: boolean,
        publishExpiration: BigNumberish,
        subscribeExpiration: BigNumberish,
        canGrant: boolean
    ];
    type OutputTuple = [
        streamId: string,
        user: string,
        canEdit: boolean,
        canDelete: boolean,
        publishExpiration: bigint,
        subscribeExpiration: bigint,
        canGrant: boolean
    ];
    interface OutputObject {
        streamId: string;
        user: string;
        canEdit: boolean;
        canDelete: boolean;
        publishExpiration: bigint;
        subscribeExpiration: bigint;
        canGrant: boolean;
    }
    type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
    type Filter = TypedDeferredTopicFilter<Event>;
    type Log = TypedEventLog<Event>;
    type LogDescription = TypedLogDescription<Event>;
}
export declare namespace RoleAdminChangedEvent {
    type InputTuple = [
        role: BytesLike,
        previousAdminRole: BytesLike,
        newAdminRole: BytesLike
    ];
    type OutputTuple = [
        role: string,
        previousAdminRole: string,
        newAdminRole: string
    ];
    interface OutputObject {
        role: string;
        previousAdminRole: string;
        newAdminRole: string;
    }
    type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
    type Filter = TypedDeferredTopicFilter<Event>;
    type Log = TypedEventLog<Event>;
    type LogDescription = TypedLogDescription<Event>;
}
export declare namespace RoleGrantedEvent {
    type InputTuple = [
        role: BytesLike,
        account: AddressLike,
        sender: AddressLike
    ];
    type OutputTuple = [role: string, account: string, sender: string];
    interface OutputObject {
        role: string;
        account: string;
        sender: string;
    }
    type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
    type Filter = TypedDeferredTopicFilter<Event>;
    type Log = TypedEventLog<Event>;
    type LogDescription = TypedLogDescription<Event>;
}
export declare namespace RoleRevokedEvent {
    type InputTuple = [
        role: BytesLike,
        account: AddressLike,
        sender: AddressLike
    ];
    type OutputTuple = [role: string, account: string, sender: string];
    interface OutputObject {
        role: string;
        account: string;
        sender: string;
    }
    type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
    type Filter = TypedDeferredTopicFilter<Event>;
    type Log = TypedEventLog<Event>;
    type LogDescription = TypedLogDescription<Event>;
}
export declare namespace StreamCreatedEvent {
    type InputTuple = [id: string, metadata: string];
    type OutputTuple = [id: string, metadata: string];
    interface OutputObject {
        id: string;
        metadata: string;
    }
    type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
    type Filter = TypedDeferredTopicFilter<Event>;
    type Log = TypedEventLog<Event>;
    type LogDescription = TypedLogDescription<Event>;
}
export declare namespace StreamDeletedEvent {
    type InputTuple = [id: string];
    type OutputTuple = [id: string];
    interface OutputObject {
        id: string;
    }
    type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
    type Filter = TypedDeferredTopicFilter<Event>;
    type Log = TypedEventLog<Event>;
    type LogDescription = TypedLogDescription<Event>;
}
export declare namespace StreamUpdatedEvent {
    type InputTuple = [id: string, metadata: string];
    type OutputTuple = [id: string, metadata: string];
    interface OutputObject {
        id: string;
        metadata: string;
    }
    type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
    type Filter = TypedDeferredTopicFilter<Event>;
    type Log = TypedEventLog<Event>;
    type LogDescription = TypedLogDescription<Event>;
}
export declare namespace UpgradedEvent {
    type InputTuple = [implementation: AddressLike];
    type OutputTuple = [implementation: string];
    interface OutputObject {
        implementation: string;
    }
    type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
    type Filter = TypedDeferredTopicFilter<Event>;
    type Log = TypedEventLog<Event>;
    type LogDescription = TypedLogDescription<Event>;
}
export interface StreamRegistryV4 extends BaseContract {
    connect(runner?: ContractRunner | null): StreamRegistryV4;
    waitForDeployment(): Promise<this>;
    interface: StreamRegistryV4Interface;
    queryFilter<TCEvent extends TypedContractEvent>(event: TCEvent, fromBlockOrBlockhash?: string | number | undefined, toBlock?: string | number | undefined): Promise<Array<TypedEventLog<TCEvent>>>;
    queryFilter<TCEvent extends TypedContractEvent>(filter: TypedDeferredTopicFilter<TCEvent>, fromBlockOrBlockhash?: string | number | undefined, toBlock?: string | number | undefined): Promise<Array<TypedEventLog<TCEvent>>>;
    on<TCEvent extends TypedContractEvent>(event: TCEvent, listener: TypedListener<TCEvent>): Promise<this>;
    on<TCEvent extends TypedContractEvent>(filter: TypedDeferredTopicFilter<TCEvent>, listener: TypedListener<TCEvent>): Promise<this>;
    once<TCEvent extends TypedContractEvent>(event: TCEvent, listener: TypedListener<TCEvent>): Promise<this>;
    once<TCEvent extends TypedContractEvent>(filter: TypedDeferredTopicFilter<TCEvent>, listener: TypedListener<TCEvent>): Promise<this>;
    listeners<TCEvent extends TypedContractEvent>(event: TCEvent): Promise<Array<TypedListener<TCEvent>>>;
    listeners(eventName?: string): Promise<Array<Listener>>;
    removeAllListeners<TCEvent extends TypedContractEvent>(event?: TCEvent): Promise<this>;
    DEFAULT_ADMIN_ROLE: TypedContractMethod<[], [string], "view">;
    ENScreateStreamCallback: TypedContractMethod<[
        ownerAddress: AddressLike,
        ensName: string,
        streamIdPath: string,
        metadataJsonString: string
    ], [
        void
    ], "nonpayable">;
    MAX_INT: TypedContractMethod<[], [bigint], "view">;
    TRUSTED_ROLE: TypedContractMethod<[], [string], "view">;
    addressToString: TypedContractMethod<[
        _address: AddressLike
    ], [
        string
    ], "view">;
    createMultipleStreamsWithPermissions: TypedContractMethod<[
        streamIdPaths: string[],
        metadataJsonStrings: string[],
        users: AddressLike[][],
        permissions: StreamRegistryV4.PermissionStruct[][]
    ], [
        void
    ], "nonpayable">;
    createStream: TypedContractMethod<[
        streamIdPath: string,
        metadataJsonString: string
    ], [
        void
    ], "nonpayable">;
    createStreamWithENS: TypedContractMethod<[
        ensName: string,
        streamIdPath: string,
        metadataJsonString: string
    ], [
        void
    ], "nonpayable">;
    createStreamWithPermissions: TypedContractMethod<[
        streamIdPath: string,
        metadataJsonString: string,
        users: AddressLike[],
        permissions: StreamRegistryV4.PermissionStruct[]
    ], [
        void
    ], "nonpayable">;
    deleteStream: TypedContractMethod<[streamId: string], [void], "nonpayable">;
    exists: TypedContractMethod<[streamId: string], [boolean], "view">;
    getAddressKey: TypedContractMethod<[
        streamId: string,
        user: AddressLike
    ], [
        string
    ], "view">;
    getDirectPermissionsForUser: TypedContractMethod<[
        streamId: string,
        user: AddressLike
    ], [
        StreamRegistryV4.PermissionStructOutput
    ], "view">;
    getPermissionsForUser: TypedContractMethod<[
        streamId: string,
        user: AddressLike
    ], [
        StreamRegistryV4.PermissionStructOutput
    ], "view">;
    getRoleAdmin: TypedContractMethod<[role: BytesLike], [string], "view">;
    getStreamMetadata: TypedContractMethod<[streamId: string], [string], "view">;
    getTrustedRole: TypedContractMethod<[], [string], "view">;
    grantPermission: TypedContractMethod<[
        streamId: string,
        user: AddressLike,
        permissionType: BigNumberish
    ], [
        void
    ], "nonpayable">;
    grantPublicPermission: TypedContractMethod<[
        streamId: string,
        permissionType: BigNumberish
    ], [
        void
    ], "nonpayable">;
    grantRole: TypedContractMethod<[
        role: BytesLike,
        account: AddressLike
    ], [
        void
    ], "nonpayable">;
    hasDirectPermission: TypedContractMethod<[
        streamId: string,
        user: AddressLike,
        permissionType: BigNumberish
    ], [
        boolean
    ], "view">;
    hasPermission: TypedContractMethod<[
        streamId: string,
        user: AddressLike,
        permissionType: BigNumberish
    ], [
        boolean
    ], "view">;
    hasPublicPermission: TypedContractMethod<[
        streamId: string,
        permissionType: BigNumberish
    ], [
        boolean
    ], "view">;
    hasRole: TypedContractMethod<[
        role: BytesLike,
        account: AddressLike
    ], [
        boolean
    ], "view">;
    initialize: TypedContractMethod<[
        ensCacheAddr: AddressLike,
        arg1: AddressLike
    ], [
        void
    ], "nonpayable">;
    proxiableUUID: TypedContractMethod<[], [string], "view">;
    renounceRole: TypedContractMethod<[
        role: BytesLike,
        account: AddressLike
    ], [
        void
    ], "nonpayable">;
    revokeAllPermissionsForUser: TypedContractMethod<[
        streamId: string,
        user: AddressLike
    ], [
        void
    ], "nonpayable">;
    revokePermission: TypedContractMethod<[
        streamId: string,
        user: AddressLike,
        permissionType: BigNumberish
    ], [
        void
    ], "nonpayable">;
    revokePublicPermission: TypedContractMethod<[
        streamId: string,
        permissionType: BigNumberish
    ], [
        void
    ], "nonpayable">;
    revokeRole: TypedContractMethod<[
        role: BytesLike,
        account: AddressLike
    ], [
        void
    ], "nonpayable">;
    setEnsCache: TypedContractMethod<[
        ensCacheAddr: AddressLike
    ], [
        void
    ], "nonpayable">;
    setExpirationTime: TypedContractMethod<[
        streamId: string,
        user: AddressLike,
        permissionType: BigNumberish,
        expirationTime: BigNumberish
    ], [
        void
    ], "nonpayable">;
    setPermissions: TypedContractMethod<[
        streamId: string,
        users: AddressLike[],
        permissions: StreamRegistryV4.PermissionStruct[]
    ], [
        void
    ], "nonpayable">;
    setPermissionsForUser: TypedContractMethod<[
        streamId: string,
        user: AddressLike,
        canEdit: boolean,
        deletePerm: boolean,
        publishExpiration: BigNumberish,
        subscribeExpiration: BigNumberish,
        canGrant: boolean
    ], [
        void
    ], "nonpayable">;
    setPermissionsMultipleStreams: TypedContractMethod<[
        streamIds: string[],
        users: AddressLike[][],
        permissions: StreamRegistryV4.PermissionStruct[][]
    ], [
        void
    ], "nonpayable">;
    setPermissionsMultipleStreans: TypedContractMethod<[
        streamIds: string[],
        users: AddressLike[][],
        permissions: StreamRegistryV4.PermissionStruct[][]
    ], [
        void
    ], "nonpayable">;
    setPublicPermission: TypedContractMethod<[
        streamId: string,
        publishExpiration: BigNumberish,
        subscribeExpiration: BigNumberish
    ], [
        void
    ], "nonpayable">;
    streamIdToMetadata: TypedContractMethod<[arg0: string], [string], "view">;
    streamIdToPermissions: TypedContractMethod<[
        arg0: string,
        arg1: BytesLike
    ], [
        [
            boolean,
            boolean,
            bigint,
            bigint,
            boolean
        ] & {
            canEdit: boolean;
            canDelete: boolean;
            publishExpiration: bigint;
            subscribeExpiration: bigint;
            canGrant: boolean;
        }
    ], "view">;
    supportsInterface: TypedContractMethod<[
        interfaceId: BytesLike
    ], [
        boolean
    ], "view">;
    transferAllPermissionsToUser: TypedContractMethod<[
        streamId: string,
        recipient: AddressLike
    ], [
        void
    ], "nonpayable">;
    transferPermissionToUser: TypedContractMethod<[
        streamId: string,
        recipient: AddressLike,
        permissionType: BigNumberish
    ], [
        void
    ], "nonpayable">;
    trustedCreateStreams: TypedContractMethod<[
        streamIds: string[],
        metadatas: string[]
    ], [
        void
    ], "nonpayable">;
    trustedSetPermissions: TypedContractMethod<[
        streamids: string[],
        users: AddressLike[],
        permissions: StreamRegistryV4.PermissionStruct[]
    ], [
        void
    ], "nonpayable">;
    trustedSetPermissionsForUser: TypedContractMethod<[
        streamId: string,
        user: AddressLike,
        canEdit: boolean,
        deletePerm: boolean,
        publishExpiration: BigNumberish,
        subscribeExpiration: BigNumberish,
        canGrant: boolean
    ], [
        void
    ], "nonpayable">;
    trustedSetStreamMetadata: TypedContractMethod<[
        streamId: string,
        metadata: string
    ], [
        void
    ], "nonpayable">;
    trustedSetStreamWithPermission: TypedContractMethod<[
        streamId: string,
        metadata: string,
        user: AddressLike,
        canEdit: boolean,
        deletePerm: boolean,
        publishExpiration: BigNumberish,
        subscribeExpiration: BigNumberish,
        canGrant: boolean
    ], [
        void
    ], "nonpayable">;
    trustedSetStreams: TypedContractMethod<[
        streamids: string[],
        users: AddressLike[],
        metadatas: string[],
        permissions: StreamRegistryV4.PermissionStruct[]
    ], [
        void
    ], "nonpayable">;
    updateStreamMetadata: TypedContractMethod<[
        streamId: string,
        metadata: string
    ], [
        void
    ], "nonpayable">;
    upgradeTo: TypedContractMethod<[
        newImplementation: AddressLike
    ], [
        void
    ], "nonpayable">;
    upgradeToAndCall: TypedContractMethod<[
        newImplementation: AddressLike,
        data: BytesLike
    ], [
        void
    ], "payable">;
    getFunction<T extends ContractMethod = ContractMethod>(key: string | FunctionFragment): T;
    getFunction(nameOrSignature: "DEFAULT_ADMIN_ROLE"): TypedContractMethod<[], [string], "view">;
    getFunction(nameOrSignature: "ENScreateStreamCallback"): TypedContractMethod<[
        ownerAddress: AddressLike,
        ensName: string,
        streamIdPath: string,
        metadataJsonString: string
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "MAX_INT"): TypedContractMethod<[], [bigint], "view">;
    getFunction(nameOrSignature: "TRUSTED_ROLE"): TypedContractMethod<[], [string], "view">;
    getFunction(nameOrSignature: "addressToString"): TypedContractMethod<[_address: AddressLike], [string], "view">;
    getFunction(nameOrSignature: "createMultipleStreamsWithPermissions"): TypedContractMethod<[
        streamIdPaths: string[],
        metadataJsonStrings: string[],
        users: AddressLike[][],
        permissions: StreamRegistryV4.PermissionStruct[][]
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "createStream"): TypedContractMethod<[
        streamIdPath: string,
        metadataJsonString: string
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "createStreamWithENS"): TypedContractMethod<[
        ensName: string,
        streamIdPath: string,
        metadataJsonString: string
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "createStreamWithPermissions"): TypedContractMethod<[
        streamIdPath: string,
        metadataJsonString: string,
        users: AddressLike[],
        permissions: StreamRegistryV4.PermissionStruct[]
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "deleteStream"): TypedContractMethod<[streamId: string], [void], "nonpayable">;
    getFunction(nameOrSignature: "exists"): TypedContractMethod<[streamId: string], [boolean], "view">;
    getFunction(nameOrSignature: "getAddressKey"): TypedContractMethod<[
        streamId: string,
        user: AddressLike
    ], [
        string
    ], "view">;
    getFunction(nameOrSignature: "getDirectPermissionsForUser"): TypedContractMethod<[
        streamId: string,
        user: AddressLike
    ], [
        StreamRegistryV4.PermissionStructOutput
    ], "view">;
    getFunction(nameOrSignature: "getPermissionsForUser"): TypedContractMethod<[
        streamId: string,
        user: AddressLike
    ], [
        StreamRegistryV4.PermissionStructOutput
    ], "view">;
    getFunction(nameOrSignature: "getRoleAdmin"): TypedContractMethod<[role: BytesLike], [string], "view">;
    getFunction(nameOrSignature: "getStreamMetadata"): TypedContractMethod<[streamId: string], [string], "view">;
    getFunction(nameOrSignature: "getTrustedRole"): TypedContractMethod<[], [string], "view">;
    getFunction(nameOrSignature: "grantPermission"): TypedContractMethod<[
        streamId: string,
        user: AddressLike,
        permissionType: BigNumberish
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "grantPublicPermission"): TypedContractMethod<[
        streamId: string,
        permissionType: BigNumberish
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "grantRole"): TypedContractMethod<[
        role: BytesLike,
        account: AddressLike
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "hasDirectPermission"): TypedContractMethod<[
        streamId: string,
        user: AddressLike,
        permissionType: BigNumberish
    ], [
        boolean
    ], "view">;
    getFunction(nameOrSignature: "hasPermission"): TypedContractMethod<[
        streamId: string,
        user: AddressLike,
        permissionType: BigNumberish
    ], [
        boolean
    ], "view">;
    getFunction(nameOrSignature: "hasPublicPermission"): TypedContractMethod<[
        streamId: string,
        permissionType: BigNumberish
    ], [
        boolean
    ], "view">;
    getFunction(nameOrSignature: "hasRole"): TypedContractMethod<[
        role: BytesLike,
        account: AddressLike
    ], [
        boolean
    ], "view">;
    getFunction(nameOrSignature: "initialize"): TypedContractMethod<[
        ensCacheAddr: AddressLike,
        arg1: AddressLike
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "proxiableUUID"): TypedContractMethod<[], [string], "view">;
    getFunction(nameOrSignature: "renounceRole"): TypedContractMethod<[
        role: BytesLike,
        account: AddressLike
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "revokeAllPermissionsForUser"): TypedContractMethod<[
        streamId: string,
        user: AddressLike
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "revokePermission"): TypedContractMethod<[
        streamId: string,
        user: AddressLike,
        permissionType: BigNumberish
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "revokePublicPermission"): TypedContractMethod<[
        streamId: string,
        permissionType: BigNumberish
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "revokeRole"): TypedContractMethod<[
        role: BytesLike,
        account: AddressLike
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "setEnsCache"): TypedContractMethod<[ensCacheAddr: AddressLike], [void], "nonpayable">;
    getFunction(nameOrSignature: "setExpirationTime"): TypedContractMethod<[
        streamId: string,
        user: AddressLike,
        permissionType: BigNumberish,
        expirationTime: BigNumberish
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "setPermissions"): TypedContractMethod<[
        streamId: string,
        users: AddressLike[],
        permissions: StreamRegistryV4.PermissionStruct[]
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "setPermissionsForUser"): TypedContractMethod<[
        streamId: string,
        user: AddressLike,
        canEdit: boolean,
        deletePerm: boolean,
        publishExpiration: BigNumberish,
        subscribeExpiration: BigNumberish,
        canGrant: boolean
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "setPermissionsMultipleStreams"): TypedContractMethod<[
        streamIds: string[],
        users: AddressLike[][],
        permissions: StreamRegistryV4.PermissionStruct[][]
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "setPermissionsMultipleStreans"): TypedContractMethod<[
        streamIds: string[],
        users: AddressLike[][],
        permissions: StreamRegistryV4.PermissionStruct[][]
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "setPublicPermission"): TypedContractMethod<[
        streamId: string,
        publishExpiration: BigNumberish,
        subscribeExpiration: BigNumberish
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "streamIdToMetadata"): TypedContractMethod<[arg0: string], [string], "view">;
    getFunction(nameOrSignature: "streamIdToPermissions"): TypedContractMethod<[
        arg0: string,
        arg1: BytesLike
    ], [
        [
            boolean,
            boolean,
            bigint,
            bigint,
            boolean
        ] & {
            canEdit: boolean;
            canDelete: boolean;
            publishExpiration: bigint;
            subscribeExpiration: bigint;
            canGrant: boolean;
        }
    ], "view">;
    getFunction(nameOrSignature: "supportsInterface"): TypedContractMethod<[interfaceId: BytesLike], [boolean], "view">;
    getFunction(nameOrSignature: "transferAllPermissionsToUser"): TypedContractMethod<[
        streamId: string,
        recipient: AddressLike
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "transferPermissionToUser"): TypedContractMethod<[
        streamId: string,
        recipient: AddressLike,
        permissionType: BigNumberish
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "trustedCreateStreams"): TypedContractMethod<[
        streamIds: string[],
        metadatas: string[]
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "trustedSetPermissions"): TypedContractMethod<[
        streamids: string[],
        users: AddressLike[],
        permissions: StreamRegistryV4.PermissionStruct[]
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "trustedSetPermissionsForUser"): TypedContractMethod<[
        streamId: string,
        user: AddressLike,
        canEdit: boolean,
        deletePerm: boolean,
        publishExpiration: BigNumberish,
        subscribeExpiration: BigNumberish,
        canGrant: boolean
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "trustedSetStreamMetadata"): TypedContractMethod<[
        streamId: string,
        metadata: string
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "trustedSetStreamWithPermission"): TypedContractMethod<[
        streamId: string,
        metadata: string,
        user: AddressLike,
        canEdit: boolean,
        deletePerm: boolean,
        publishExpiration: BigNumberish,
        subscribeExpiration: BigNumberish,
        canGrant: boolean
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "trustedSetStreams"): TypedContractMethod<[
        streamids: string[],
        users: AddressLike[],
        metadatas: string[],
        permissions: StreamRegistryV4.PermissionStruct[]
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "updateStreamMetadata"): TypedContractMethod<[
        streamId: string,
        metadata: string
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "upgradeTo"): TypedContractMethod<[
        newImplementation: AddressLike
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "upgradeToAndCall"): TypedContractMethod<[
        newImplementation: AddressLike,
        data: BytesLike
    ], [
        void
    ], "payable">;
    getEvent(key: "AdminChanged"): TypedContractEvent<AdminChangedEvent.InputTuple, AdminChangedEvent.OutputTuple, AdminChangedEvent.OutputObject>;
    getEvent(key: "BeaconUpgraded"): TypedContractEvent<BeaconUpgradedEvent.InputTuple, BeaconUpgradedEvent.OutputTuple, BeaconUpgradedEvent.OutputObject>;
    getEvent(key: "Initialized"): TypedContractEvent<InitializedEvent.InputTuple, InitializedEvent.OutputTuple, InitializedEvent.OutputObject>;
    getEvent(key: "PermissionUpdated"): TypedContractEvent<PermissionUpdatedEvent.InputTuple, PermissionUpdatedEvent.OutputTuple, PermissionUpdatedEvent.OutputObject>;
    getEvent(key: "RoleAdminChanged"): TypedContractEvent<RoleAdminChangedEvent.InputTuple, RoleAdminChangedEvent.OutputTuple, RoleAdminChangedEvent.OutputObject>;
    getEvent(key: "RoleGranted"): TypedContractEvent<RoleGrantedEvent.InputTuple, RoleGrantedEvent.OutputTuple, RoleGrantedEvent.OutputObject>;
    getEvent(key: "RoleRevoked"): TypedContractEvent<RoleRevokedEvent.InputTuple, RoleRevokedEvent.OutputTuple, RoleRevokedEvent.OutputObject>;
    getEvent(key: "StreamCreated"): TypedContractEvent<StreamCreatedEvent.InputTuple, StreamCreatedEvent.OutputTuple, StreamCreatedEvent.OutputObject>;
    getEvent(key: "StreamDeleted"): TypedContractEvent<StreamDeletedEvent.InputTuple, StreamDeletedEvent.OutputTuple, StreamDeletedEvent.OutputObject>;
    getEvent(key: "StreamUpdated"): TypedContractEvent<StreamUpdatedEvent.InputTuple, StreamUpdatedEvent.OutputTuple, StreamUpdatedEvent.OutputObject>;
    getEvent(key: "Upgraded"): TypedContractEvent<UpgradedEvent.InputTuple, UpgradedEvent.OutputTuple, UpgradedEvent.OutputObject>;
    filters: {
        "AdminChanged(address,address)": TypedContractEvent<AdminChangedEvent.InputTuple, AdminChangedEvent.OutputTuple, AdminChangedEvent.OutputObject>;
        AdminChanged: TypedContractEvent<AdminChangedEvent.InputTuple, AdminChangedEvent.OutputTuple, AdminChangedEvent.OutputObject>;
        "BeaconUpgraded(address)": TypedContractEvent<BeaconUpgradedEvent.InputTuple, BeaconUpgradedEvent.OutputTuple, BeaconUpgradedEvent.OutputObject>;
        BeaconUpgraded: TypedContractEvent<BeaconUpgradedEvent.InputTuple, BeaconUpgradedEvent.OutputTuple, BeaconUpgradedEvent.OutputObject>;
        "Initialized(uint8)": TypedContractEvent<InitializedEvent.InputTuple, InitializedEvent.OutputTuple, InitializedEvent.OutputObject>;
        Initialized: TypedContractEvent<InitializedEvent.InputTuple, InitializedEvent.OutputTuple, InitializedEvent.OutputObject>;
        "PermissionUpdated(string,address,bool,bool,uint256,uint256,bool)": TypedContractEvent<PermissionUpdatedEvent.InputTuple, PermissionUpdatedEvent.OutputTuple, PermissionUpdatedEvent.OutputObject>;
        PermissionUpdated: TypedContractEvent<PermissionUpdatedEvent.InputTuple, PermissionUpdatedEvent.OutputTuple, PermissionUpdatedEvent.OutputObject>;
        "RoleAdminChanged(bytes32,bytes32,bytes32)": TypedContractEvent<RoleAdminChangedEvent.InputTuple, RoleAdminChangedEvent.OutputTuple, RoleAdminChangedEvent.OutputObject>;
        RoleAdminChanged: TypedContractEvent<RoleAdminChangedEvent.InputTuple, RoleAdminChangedEvent.OutputTuple, RoleAdminChangedEvent.OutputObject>;
        "RoleGranted(bytes32,address,address)": TypedContractEvent<RoleGrantedEvent.InputTuple, RoleGrantedEvent.OutputTuple, RoleGrantedEvent.OutputObject>;
        RoleGranted: TypedContractEvent<RoleGrantedEvent.InputTuple, RoleGrantedEvent.OutputTuple, RoleGrantedEvent.OutputObject>;
        "RoleRevoked(bytes32,address,address)": TypedContractEvent<RoleRevokedEvent.InputTuple, RoleRevokedEvent.OutputTuple, RoleRevokedEvent.OutputObject>;
        RoleRevoked: TypedContractEvent<RoleRevokedEvent.InputTuple, RoleRevokedEvent.OutputTuple, RoleRevokedEvent.OutputObject>;
        "StreamCreated(string,string)": TypedContractEvent<StreamCreatedEvent.InputTuple, StreamCreatedEvent.OutputTuple, StreamCreatedEvent.OutputObject>;
        StreamCreated: TypedContractEvent<StreamCreatedEvent.InputTuple, StreamCreatedEvent.OutputTuple, StreamCreatedEvent.OutputObject>;
        "StreamDeleted(string)": TypedContractEvent<StreamDeletedEvent.InputTuple, StreamDeletedEvent.OutputTuple, StreamDeletedEvent.OutputObject>;
        StreamDeleted: TypedContractEvent<StreamDeletedEvent.InputTuple, StreamDeletedEvent.OutputTuple, StreamDeletedEvent.OutputObject>;
        "StreamUpdated(string,string)": TypedContractEvent<StreamUpdatedEvent.InputTuple, StreamUpdatedEvent.OutputTuple, StreamUpdatedEvent.OutputObject>;
        StreamUpdated: TypedContractEvent<StreamUpdatedEvent.InputTuple, StreamUpdatedEvent.OutputTuple, StreamUpdatedEvent.OutputObject>;
        "Upgraded(address)": TypedContractEvent<UpgradedEvent.InputTuple, UpgradedEvent.OutputTuple, UpgradedEvent.OutputObject>;
        Upgraded: TypedContractEvent<UpgradedEvent.InputTuple, UpgradedEvent.OutputTuple, UpgradedEvent.OutputObject>;
    };
}
