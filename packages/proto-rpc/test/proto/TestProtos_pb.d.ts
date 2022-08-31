// package: 
// file: TestProtos.proto

import * as jspb from "google-protobuf";

export class RouteMessageWrapper extends jspb.Message {
  hasSourcepeer(): boolean;
  clearSourcepeer(): void;
  getSourcepeer(): PeerDescriptor | undefined;
  setSourcepeer(value?: PeerDescriptor): void;

  getNonce(): string;
  setNonce(value: string): void;

  hasDestinationpeer(): boolean;
  clearDestinationpeer(): void;
  getDestinationpeer(): PeerDescriptor | undefined;
  setDestinationpeer(value?: PeerDescriptor): void;

  hasPreviouspeer(): boolean;
  clearPreviouspeer(): void;
  getPreviouspeer(): PeerDescriptor | undefined;
  setPreviouspeer(value?: PeerDescriptor): void;

  getMessage(): Uint8Array | string;
  getMessage_asU8(): Uint8Array;
  getMessage_asB64(): string;
  setMessage(value: Uint8Array | string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): RouteMessageWrapper.AsObject;
  static toObject(includeInstance: boolean, msg: RouteMessageWrapper): RouteMessageWrapper.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: RouteMessageWrapper, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): RouteMessageWrapper;
  static deserializeBinaryFromReader(message: RouteMessageWrapper, reader: jspb.BinaryReader): RouteMessageWrapper;
}

export namespace RouteMessageWrapper {
  export type AsObject = {
    sourcepeer?: PeerDescriptor.AsObject,
    nonce: string,
    destinationpeer?: PeerDescriptor.AsObject,
    previouspeer?: PeerDescriptor.AsObject,
    message: Uint8Array | string,
  }
}

export class RouteMessageAck extends jspb.Message {
  hasSourcepeer(): boolean;
  clearSourcepeer(): void;
  getSourcepeer(): PeerDescriptor | undefined;
  setSourcepeer(value?: PeerDescriptor): void;

  getNonce(): string;
  setNonce(value: string): void;

  hasDestinationpeer(): boolean;
  clearDestinationpeer(): void;
  getDestinationpeer(): PeerDescriptor | undefined;
  setDestinationpeer(value?: PeerDescriptor): void;

  getError(): string;
  setError(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): RouteMessageAck.AsObject;
  static toObject(includeInstance: boolean, msg: RouteMessageAck): RouteMessageAck.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: RouteMessageAck, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): RouteMessageAck;
  static deserializeBinaryFromReader(message: RouteMessageAck, reader: jspb.BinaryReader): RouteMessageAck;
}

export namespace RouteMessageAck {
  export type AsObject = {
    sourcepeer?: PeerDescriptor.AsObject,
    nonce: string,
    destinationpeer?: PeerDescriptor.AsObject,
    error: string,
  }
}

export class PingRequest extends jspb.Message {
  getNonce(): string;
  setNonce(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): PingRequest.AsObject;
  static toObject(includeInstance: boolean, msg: PingRequest): PingRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: PingRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): PingRequest;
  static deserializeBinaryFromReader(message: PingRequest, reader: jspb.BinaryReader): PingRequest;
}

export namespace PingRequest {
  export type AsObject = {
    nonce: string,
  }
}

export class PingResponse extends jspb.Message {
  getNonce(): string;
  setNonce(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): PingResponse.AsObject;
  static toObject(includeInstance: boolean, msg: PingResponse): PingResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: PingResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): PingResponse;
  static deserializeBinaryFromReader(message: PingResponse, reader: jspb.BinaryReader): PingResponse;
}

export namespace PingResponse {
  export type AsObject = {
    nonce: string,
  }
}

export class ClosestPeersRequest extends jspb.Message {
  hasPeerdescriptor(): boolean;
  clearPeerdescriptor(): void;
  getPeerdescriptor(): PeerDescriptor | undefined;
  setPeerdescriptor(value?: PeerDescriptor): void;

  getNonce(): string;
  setNonce(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ClosestPeersRequest.AsObject;
  static toObject(includeInstance: boolean, msg: ClosestPeersRequest): ClosestPeersRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: ClosestPeersRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ClosestPeersRequest;
  static deserializeBinaryFromReader(message: ClosestPeersRequest, reader: jspb.BinaryReader): ClosestPeersRequest;
}

export namespace ClosestPeersRequest {
  export type AsObject = {
    peerdescriptor?: PeerDescriptor.AsObject,
    nonce: string,
  }
}

export class ClosestPeersResponse extends jspb.Message {
  clearPeersList(): void;
  getPeersList(): Array<PeerDescriptor>;
  setPeersList(value: Array<PeerDescriptor>): void;
  addPeers(value?: PeerDescriptor, index?: number): PeerDescriptor;

  getNonce(): string;
  setNonce(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ClosestPeersResponse.AsObject;
  static toObject(includeInstance: boolean, msg: ClosestPeersResponse): ClosestPeersResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: ClosestPeersResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ClosestPeersResponse;
  static deserializeBinaryFromReader(message: ClosestPeersResponse, reader: jspb.BinaryReader): ClosestPeersResponse;
}

export namespace ClosestPeersResponse {
  export type AsObject = {
    peersList: Array<PeerDescriptor.AsObject>,
    nonce: string,
  }
}

export class PeerDescriptor extends jspb.Message {
  getPeerid(): Uint8Array | string;
  getPeerid_asU8(): Uint8Array;
  getPeerid_asB64(): string;
  setPeerid(value: Uint8Array | string): void;

  getType(): NodeTypeMap[keyof NodeTypeMap];
  setType(value: NodeTypeMap[keyof NodeTypeMap]): void;

  hasUdp(): boolean;
  clearUdp(): void;
  getUdp(): ConnectivityMethod | undefined;
  setUdp(value?: ConnectivityMethod): void;

  hasTcp(): boolean;
  clearTcp(): void;
  getTcp(): ConnectivityMethod | undefined;
  setTcp(value?: ConnectivityMethod): void;

  hasWebsocket(): boolean;
  clearWebsocket(): void;
  getWebsocket(): ConnectivityMethod | undefined;
  setWebsocket(value?: ConnectivityMethod): void;

  hasOpeninternet(): boolean;
  clearOpeninternet(): void;
  getOpeninternet(): boolean;
  setOpeninternet(value: boolean): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): PeerDescriptor.AsObject;
  static toObject(includeInstance: boolean, msg: PeerDescriptor): PeerDescriptor.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: PeerDescriptor, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): PeerDescriptor;
  static deserializeBinaryFromReader(message: PeerDescriptor, reader: jspb.BinaryReader): PeerDescriptor;
}

export namespace PeerDescriptor {
  export type AsObject = {
    peerid: Uint8Array | string,
    type: NodeTypeMap[keyof NodeTypeMap],
    udp?: ConnectivityMethod.AsObject,
    tcp?: ConnectivityMethod.AsObject,
    websocket?: ConnectivityMethod.AsObject,
    openinternet: boolean,
  }
}

export class ConnectivityMethod extends jspb.Message {
  getPort(): number;
  setPort(value: number): void;

  getIp(): string;
  setIp(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): ConnectivityMethod.AsObject;
  static toObject(includeInstance: boolean, msg: ConnectivityMethod): ConnectivityMethod.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: ConnectivityMethod, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): ConnectivityMethod;
  static deserializeBinaryFromReader(message: ConnectivityMethod, reader: jspb.BinaryReader): ConnectivityMethod;
}

export namespace ConnectivityMethod {
  export type AsObject = {
    port: number,
    ip: string,
  }
}

export interface NodeTypeMap {
  NODEJS: 0;
  BROWSER: 1;
}

export const NodeType: NodeTypeMap;

