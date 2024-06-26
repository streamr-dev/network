/* Autogenerated file. Do not edit manually. */
/* eslint-disable */
import type { BaseContract, BigNumberish, BytesLike, FunctionFragment, Result, Interface, EventFragment, AddressLike, ContractRunner, ContractMethod, Listener } from "ethers";
import type { TypedContractEvent, TypedDeferredTopicFilter, TypedEventLog, TypedLogDescription, TypedListener, TypedContractMethod } from "../../common";
export interface SponsorshipFactoryInterface extends Interface {
    getFunction(nameOrSignature: "ADMIN_ROLE" | "DEFAULT_ADMIN_ROLE" | "addTrustedPolicies" | "addTrustedPolicy" | "deploySponsorship" | "deploymentTimestamp" | "getRoleAdmin" | "grantRole" | "hasRole" | "initialize" | "isTrustedPolicy" | "onTokenTransfer" | "proxiableUUID" | "removeTrustedPolicy" | "renounceRole" | "revokeRole" | "sponsorshipContractTemplate" | "streamrConfig" | "supportsInterface" | "tokenAddress" | "trustedPolicies" | "updateTemplate" | "upgradeTo" | "upgradeToAndCall"): FunctionFragment;
    getEvent(nameOrSignatureOrTopic: "AdminChanged" | "BeaconUpgraded" | "Initialized" | "NewSponsorship" | "PolicyWhitelisted" | "RoleAdminChanged" | "RoleGranted" | "RoleRevoked" | "TemplateAddress" | "Upgraded"): EventFragment;
    encodeFunctionData(functionFragment: "ADMIN_ROLE", values?: undefined): string;
    encodeFunctionData(functionFragment: "DEFAULT_ADMIN_ROLE", values?: undefined): string;
    encodeFunctionData(functionFragment: "addTrustedPolicies", values: [AddressLike[]]): string;
    encodeFunctionData(functionFragment: "addTrustedPolicy", values: [AddressLike]): string;
    encodeFunctionData(functionFragment: "deploySponsorship", values: [BigNumberish, string, string, AddressLike[], BigNumberish[]]): string;
    encodeFunctionData(functionFragment: "deploymentTimestamp", values: [AddressLike]): string;
    encodeFunctionData(functionFragment: "getRoleAdmin", values: [BytesLike]): string;
    encodeFunctionData(functionFragment: "grantRole", values: [BytesLike, AddressLike]): string;
    encodeFunctionData(functionFragment: "hasRole", values: [BytesLike, AddressLike]): string;
    encodeFunctionData(functionFragment: "initialize", values: [AddressLike, AddressLike, AddressLike]): string;
    encodeFunctionData(functionFragment: "isTrustedPolicy", values: [AddressLike]): string;
    encodeFunctionData(functionFragment: "onTokenTransfer", values: [AddressLike, BigNumberish, BytesLike]): string;
    encodeFunctionData(functionFragment: "proxiableUUID", values?: undefined): string;
    encodeFunctionData(functionFragment: "removeTrustedPolicy", values: [AddressLike]): string;
    encodeFunctionData(functionFragment: "renounceRole", values: [BytesLike, AddressLike]): string;
    encodeFunctionData(functionFragment: "revokeRole", values: [BytesLike, AddressLike]): string;
    encodeFunctionData(functionFragment: "sponsorshipContractTemplate", values?: undefined): string;
    encodeFunctionData(functionFragment: "streamrConfig", values?: undefined): string;
    encodeFunctionData(functionFragment: "supportsInterface", values: [BytesLike]): string;
    encodeFunctionData(functionFragment: "tokenAddress", values?: undefined): string;
    encodeFunctionData(functionFragment: "trustedPolicies", values: [AddressLike]): string;
    encodeFunctionData(functionFragment: "updateTemplate", values: [AddressLike]): string;
    encodeFunctionData(functionFragment: "upgradeTo", values: [AddressLike]): string;
    encodeFunctionData(functionFragment: "upgradeToAndCall", values: [AddressLike, BytesLike]): string;
    decodeFunctionResult(functionFragment: "ADMIN_ROLE", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "DEFAULT_ADMIN_ROLE", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "addTrustedPolicies", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "addTrustedPolicy", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "deploySponsorship", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "deploymentTimestamp", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "getRoleAdmin", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "grantRole", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "hasRole", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "initialize", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "isTrustedPolicy", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "onTokenTransfer", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "proxiableUUID", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "removeTrustedPolicy", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "renounceRole", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "revokeRole", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "sponsorshipContractTemplate", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "streamrConfig", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "supportsInterface", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "tokenAddress", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "trustedPolicies", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "updateTemplate", data: BytesLike): Result;
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
export declare namespace NewSponsorshipEvent {
    type InputTuple = [
        sponsorshipContract: AddressLike,
        streamId: string,
        metadata: string,
        policies: AddressLike[],
        policyParams: BigNumberish[],
        creator: AddressLike
    ];
    type OutputTuple = [
        sponsorshipContract: string,
        streamId: string,
        metadata: string,
        policies: string[],
        policyParams: bigint[],
        creator: string
    ];
    interface OutputObject {
        sponsorshipContract: string;
        streamId: string;
        metadata: string;
        policies: string[];
        policyParams: bigint[];
        creator: string;
    }
    type Event = TypedContractEvent<InputTuple, OutputTuple, OutputObject>;
    type Filter = TypedDeferredTopicFilter<Event>;
    type Log = TypedEventLog<Event>;
    type LogDescription = TypedLogDescription<Event>;
}
export declare namespace PolicyWhitelistedEvent {
    type InputTuple = [policyAddress: AddressLike, isWhitelisted: boolean];
    type OutputTuple = [policyAddress: string, isWhitelisted: boolean];
    interface OutputObject {
        policyAddress: string;
        isWhitelisted: boolean;
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
export declare namespace TemplateAddressEvent {
    type InputTuple = [templateAddress: AddressLike];
    type OutputTuple = [templateAddress: string];
    interface OutputObject {
        templateAddress: string;
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
export interface SponsorshipFactory extends BaseContract {
    connect(runner?: ContractRunner | null): SponsorshipFactory;
    waitForDeployment(): Promise<this>;
    interface: SponsorshipFactoryInterface;
    queryFilter<TCEvent extends TypedContractEvent>(event: TCEvent, fromBlockOrBlockhash?: string | number | undefined, toBlock?: string | number | undefined): Promise<Array<TypedEventLog<TCEvent>>>;
    queryFilter<TCEvent extends TypedContractEvent>(filter: TypedDeferredTopicFilter<TCEvent>, fromBlockOrBlockhash?: string | number | undefined, toBlock?: string | number | undefined): Promise<Array<TypedEventLog<TCEvent>>>;
    on<TCEvent extends TypedContractEvent>(event: TCEvent, listener: TypedListener<TCEvent>): Promise<this>;
    on<TCEvent extends TypedContractEvent>(filter: TypedDeferredTopicFilter<TCEvent>, listener: TypedListener<TCEvent>): Promise<this>;
    once<TCEvent extends TypedContractEvent>(event: TCEvent, listener: TypedListener<TCEvent>): Promise<this>;
    once<TCEvent extends TypedContractEvent>(filter: TypedDeferredTopicFilter<TCEvent>, listener: TypedListener<TCEvent>): Promise<this>;
    listeners<TCEvent extends TypedContractEvent>(event: TCEvent): Promise<Array<TypedListener<TCEvent>>>;
    listeners(eventName?: string): Promise<Array<Listener>>;
    removeAllListeners<TCEvent extends TypedContractEvent>(event?: TCEvent): Promise<this>;
    ADMIN_ROLE: TypedContractMethod<[], [string], "view">;
    DEFAULT_ADMIN_ROLE: TypedContractMethod<[], [string], "view">;
    addTrustedPolicies: TypedContractMethod<[
        policyAddresses: AddressLike[]
    ], [
        void
    ], "nonpayable">;
    addTrustedPolicy: TypedContractMethod<[
        policyAddress: AddressLike
    ], [
        void
    ], "nonpayable">;
    deploySponsorship: TypedContractMethod<[
        minOperatorCount: BigNumberish,
        streamId: string,
        metadata: string,
        policies: AddressLike[],
        policyParams: BigNumberish[]
    ], [
        string
    ], "nonpayable">;
    deploymentTimestamp: TypedContractMethod<[
        arg0: AddressLike
    ], [
        bigint
    ], "view">;
    getRoleAdmin: TypedContractMethod<[role: BytesLike], [string], "view">;
    grantRole: TypedContractMethod<[
        role: BytesLike,
        account: AddressLike
    ], [
        void
    ], "nonpayable">;
    hasRole: TypedContractMethod<[
        role: BytesLike,
        account: AddressLike
    ], [
        boolean
    ], "view">;
    initialize: TypedContractMethod<[
        templateAddress: AddressLike,
        dataTokenAddress: AddressLike,
        streamrConfigAddress: AddressLike
    ], [
        void
    ], "nonpayable">;
    isTrustedPolicy: TypedContractMethod<[
        policyAddress: AddressLike
    ], [
        boolean
    ], "view">;
    onTokenTransfer: TypedContractMethod<[
        from: AddressLike,
        amount: BigNumberish,
        param: BytesLike
    ], [
        void
    ], "nonpayable">;
    proxiableUUID: TypedContractMethod<[], [string], "view">;
    removeTrustedPolicy: TypedContractMethod<[
        policyAddress: AddressLike
    ], [
        void
    ], "nonpayable">;
    renounceRole: TypedContractMethod<[
        role: BytesLike,
        account: AddressLike
    ], [
        void
    ], "nonpayable">;
    revokeRole: TypedContractMethod<[
        role: BytesLike,
        account: AddressLike
    ], [
        void
    ], "nonpayable">;
    sponsorshipContractTemplate: TypedContractMethod<[], [string], "view">;
    streamrConfig: TypedContractMethod<[], [string], "view">;
    supportsInterface: TypedContractMethod<[
        interfaceId: BytesLike
    ], [
        boolean
    ], "view">;
    tokenAddress: TypedContractMethod<[], [string], "view">;
    trustedPolicies: TypedContractMethod<[arg0: AddressLike], [boolean], "view">;
    updateTemplate: TypedContractMethod<[
        templateAddress: AddressLike
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
    getFunction(nameOrSignature: "ADMIN_ROLE"): TypedContractMethod<[], [string], "view">;
    getFunction(nameOrSignature: "DEFAULT_ADMIN_ROLE"): TypedContractMethod<[], [string], "view">;
    getFunction(nameOrSignature: "addTrustedPolicies"): TypedContractMethod<[
        policyAddresses: AddressLike[]
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "addTrustedPolicy"): TypedContractMethod<[policyAddress: AddressLike], [void], "nonpayable">;
    getFunction(nameOrSignature: "deploySponsorship"): TypedContractMethod<[
        minOperatorCount: BigNumberish,
        streamId: string,
        metadata: string,
        policies: AddressLike[],
        policyParams: BigNumberish[]
    ], [
        string
    ], "nonpayable">;
    getFunction(nameOrSignature: "deploymentTimestamp"): TypedContractMethod<[arg0: AddressLike], [bigint], "view">;
    getFunction(nameOrSignature: "getRoleAdmin"): TypedContractMethod<[role: BytesLike], [string], "view">;
    getFunction(nameOrSignature: "grantRole"): TypedContractMethod<[
        role: BytesLike,
        account: AddressLike
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "hasRole"): TypedContractMethod<[
        role: BytesLike,
        account: AddressLike
    ], [
        boolean
    ], "view">;
    getFunction(nameOrSignature: "initialize"): TypedContractMethod<[
        templateAddress: AddressLike,
        dataTokenAddress: AddressLike,
        streamrConfigAddress: AddressLike
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "isTrustedPolicy"): TypedContractMethod<[policyAddress: AddressLike], [boolean], "view">;
    getFunction(nameOrSignature: "onTokenTransfer"): TypedContractMethod<[
        from: AddressLike,
        amount: BigNumberish,
        param: BytesLike
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "proxiableUUID"): TypedContractMethod<[], [string], "view">;
    getFunction(nameOrSignature: "removeTrustedPolicy"): TypedContractMethod<[policyAddress: AddressLike], [void], "nonpayable">;
    getFunction(nameOrSignature: "renounceRole"): TypedContractMethod<[
        role: BytesLike,
        account: AddressLike
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "revokeRole"): TypedContractMethod<[
        role: BytesLike,
        account: AddressLike
    ], [
        void
    ], "nonpayable">;
    getFunction(nameOrSignature: "sponsorshipContractTemplate"): TypedContractMethod<[], [string], "view">;
    getFunction(nameOrSignature: "streamrConfig"): TypedContractMethod<[], [string], "view">;
    getFunction(nameOrSignature: "supportsInterface"): TypedContractMethod<[interfaceId: BytesLike], [boolean], "view">;
    getFunction(nameOrSignature: "tokenAddress"): TypedContractMethod<[], [string], "view">;
    getFunction(nameOrSignature: "trustedPolicies"): TypedContractMethod<[arg0: AddressLike], [boolean], "view">;
    getFunction(nameOrSignature: "updateTemplate"): TypedContractMethod<[templateAddress: AddressLike], [void], "nonpayable">;
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
    getEvent(key: "NewSponsorship"): TypedContractEvent<NewSponsorshipEvent.InputTuple, NewSponsorshipEvent.OutputTuple, NewSponsorshipEvent.OutputObject>;
    getEvent(key: "PolicyWhitelisted"): TypedContractEvent<PolicyWhitelistedEvent.InputTuple, PolicyWhitelistedEvent.OutputTuple, PolicyWhitelistedEvent.OutputObject>;
    getEvent(key: "RoleAdminChanged"): TypedContractEvent<RoleAdminChangedEvent.InputTuple, RoleAdminChangedEvent.OutputTuple, RoleAdminChangedEvent.OutputObject>;
    getEvent(key: "RoleGranted"): TypedContractEvent<RoleGrantedEvent.InputTuple, RoleGrantedEvent.OutputTuple, RoleGrantedEvent.OutputObject>;
    getEvent(key: "RoleRevoked"): TypedContractEvent<RoleRevokedEvent.InputTuple, RoleRevokedEvent.OutputTuple, RoleRevokedEvent.OutputObject>;
    getEvent(key: "TemplateAddress"): TypedContractEvent<TemplateAddressEvent.InputTuple, TemplateAddressEvent.OutputTuple, TemplateAddressEvent.OutputObject>;
    getEvent(key: "Upgraded"): TypedContractEvent<UpgradedEvent.InputTuple, UpgradedEvent.OutputTuple, UpgradedEvent.OutputObject>;
    filters: {
        "AdminChanged(address,address)": TypedContractEvent<AdminChangedEvent.InputTuple, AdminChangedEvent.OutputTuple, AdminChangedEvent.OutputObject>;
        AdminChanged: TypedContractEvent<AdminChangedEvent.InputTuple, AdminChangedEvent.OutputTuple, AdminChangedEvent.OutputObject>;
        "BeaconUpgraded(address)": TypedContractEvent<BeaconUpgradedEvent.InputTuple, BeaconUpgradedEvent.OutputTuple, BeaconUpgradedEvent.OutputObject>;
        BeaconUpgraded: TypedContractEvent<BeaconUpgradedEvent.InputTuple, BeaconUpgradedEvent.OutputTuple, BeaconUpgradedEvent.OutputObject>;
        "Initialized(uint8)": TypedContractEvent<InitializedEvent.InputTuple, InitializedEvent.OutputTuple, InitializedEvent.OutputObject>;
        Initialized: TypedContractEvent<InitializedEvent.InputTuple, InitializedEvent.OutputTuple, InitializedEvent.OutputObject>;
        "NewSponsorship(address,string,string,address[],uint256[],address)": TypedContractEvent<NewSponsorshipEvent.InputTuple, NewSponsorshipEvent.OutputTuple, NewSponsorshipEvent.OutputObject>;
        NewSponsorship: TypedContractEvent<NewSponsorshipEvent.InputTuple, NewSponsorshipEvent.OutputTuple, NewSponsorshipEvent.OutputObject>;
        "PolicyWhitelisted(address,bool)": TypedContractEvent<PolicyWhitelistedEvent.InputTuple, PolicyWhitelistedEvent.OutputTuple, PolicyWhitelistedEvent.OutputObject>;
        PolicyWhitelisted: TypedContractEvent<PolicyWhitelistedEvent.InputTuple, PolicyWhitelistedEvent.OutputTuple, PolicyWhitelistedEvent.OutputObject>;
        "RoleAdminChanged(bytes32,bytes32,bytes32)": TypedContractEvent<RoleAdminChangedEvent.InputTuple, RoleAdminChangedEvent.OutputTuple, RoleAdminChangedEvent.OutputObject>;
        RoleAdminChanged: TypedContractEvent<RoleAdminChangedEvent.InputTuple, RoleAdminChangedEvent.OutputTuple, RoleAdminChangedEvent.OutputObject>;
        "RoleGranted(bytes32,address,address)": TypedContractEvent<RoleGrantedEvent.InputTuple, RoleGrantedEvent.OutputTuple, RoleGrantedEvent.OutputObject>;
        RoleGranted: TypedContractEvent<RoleGrantedEvent.InputTuple, RoleGrantedEvent.OutputTuple, RoleGrantedEvent.OutputObject>;
        "RoleRevoked(bytes32,address,address)": TypedContractEvent<RoleRevokedEvent.InputTuple, RoleRevokedEvent.OutputTuple, RoleRevokedEvent.OutputObject>;
        RoleRevoked: TypedContractEvent<RoleRevokedEvent.InputTuple, RoleRevokedEvent.OutputTuple, RoleRevokedEvent.OutputObject>;
        "TemplateAddress(address)": TypedContractEvent<TemplateAddressEvent.InputTuple, TemplateAddressEvent.OutputTuple, TemplateAddressEvent.OutputObject>;
        TemplateAddress: TypedContractEvent<TemplateAddressEvent.InputTuple, TemplateAddressEvent.OutputTuple, TemplateAddressEvent.OutputObject>;
        "Upgraded(address)": TypedContractEvent<UpgradedEvent.InputTuple, UpgradedEvent.OutputTuple, UpgradedEvent.OutputObject>;
        Upgraded: TypedContractEvent<UpgradedEvent.InputTuple, UpgradedEvent.OutputTuple, UpgradedEvent.OutputObject>;
    };
}
