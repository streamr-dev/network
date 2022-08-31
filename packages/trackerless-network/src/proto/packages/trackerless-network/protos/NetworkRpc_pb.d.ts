// package: 
// file: packages/trackerless-network/protos/NetworkRpc.proto

import * as jspb from "google-protobuf";
import * as google_protobuf_empty_pb from "google-protobuf/google/protobuf/empty_pb";
import * as packages_dht_protos_DhtRpc_pb from "../../../packages/dht/protos/DhtRpc_pb";

export class MessageRef extends jspb.Message {
  getTimestamp(): number;
  setTimestamp(value: number): void;

  getSequencenumber(): number;
  setSequencenumber(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): MessageRef.AsObject;
  static toObject(includeInstance: boolean, msg: MessageRef): MessageRef.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: MessageRef, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): MessageRef;
  static deserializeBinaryFromReader(message: MessageRef, reader: jspb.BinaryReader): MessageRef;
}

export namespace MessageRef {
  export type AsObject = {
    timestamp: number,
    sequencenumber: number,
  }
}

export class DataMessage extends jspb.Message {
  getContent(): string;
  setContent(value: string): void;

  getSenderid(): string;
  setSenderid(value: string): void;

  getStreampartid(): string;
  setStreampartid(value: string): void;

  hasMessageref(): boolean;
  clearMessageref(): void;
  getMessageref(): MessageRef | undefined;
  setMessageref(value?: MessageRef): void;

  hasPreviousmessageref(): boolean;
  clearPreviousmessageref(): void;
  getPreviousmessageref(): MessageRef | undefined;
  setPreviousmessageref(value?: MessageRef): void;

  hasPreviouspeer(): boolean;
  clearPreviouspeer(): void;
  getPreviouspeer(): string;
  setPreviouspeer(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): DataMessage.AsObject;
  static toObject(includeInstance: boolean, msg: DataMessage): DataMessage.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: DataMessage, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): DataMessage;
  static deserializeBinaryFromReader(message: DataMessage, reader: jspb.BinaryReader): DataMessage;
}

export namespace DataMessage {
  export type AsObject = {
    content: string,
    senderid: string,
    streampartid: string,
    messageref?: MessageRef.AsObject,
    previousmessageref?: MessageRef.AsObject,
    previouspeer: string,
  }
}

export class Layer2Message extends jspb.Message {
  getType(): Layer2TypeMap[keyof Layer2TypeMap];
  setType(value: Layer2TypeMap[keyof Layer2TypeMap]): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Layer2Message.AsObject;
  static toObject(includeInstance: boolean, msg: Layer2Message): Layer2Message.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: Layer2Message, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Layer2Message;
  static deserializeBinaryFromReader(message: Layer2Message, reader: jspb.BinaryReader): Layer2Message;
}

export namespace Layer2Message {
  export type AsObject = {
    type: Layer2TypeMap[keyof Layer2TypeMap],
  }
}

export class HandshakeRequest extends jspb.Message {
  getRandomgraphid(): string;
  setRandomgraphid(value: string): void;

  getSenderid(): string;
  setSenderid(value: string): void;

  getRequestid(): string;
  setRequestid(value: string): void;

  hasConcurrenthandshaketargetid(): boolean;
  clearConcurrenthandshaketargetid(): void;
  getConcurrenthandshaketargetid(): string;
  setConcurrenthandshaketargetid(value: string): void;

  clearNeighborsList(): void;
  getNeighborsList(): Array<string>;
  setNeighborsList(value: Array<string>): void;
  addNeighbors(value: string, index?: number): string;

  clearPeerviewList(): void;
  getPeerviewList(): Array<string>;
  setPeerviewList(value: Array<string>): void;
  addPeerview(value: string, index?: number): string;

  hasSenderdescriptor(): boolean;
  clearSenderdescriptor(): void;
  getSenderdescriptor(): packages_dht_protos_DhtRpc_pb.PeerDescriptor | undefined;
  setSenderdescriptor(value?: packages_dht_protos_DhtRpc_pb.PeerDescriptor): void;

  getInterleaving(): boolean;
  setInterleaving(value: boolean): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): HandshakeRequest.AsObject;
  static toObject(includeInstance: boolean, msg: HandshakeRequest): HandshakeRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: HandshakeRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): HandshakeRequest;
  static deserializeBinaryFromReader(message: HandshakeRequest, reader: jspb.BinaryReader): HandshakeRequest;
}

export namespace HandshakeRequest {
  export type AsObject = {
    randomgraphid: string,
    senderid: string,
    requestid: string,
    concurrenthandshaketargetid: string,
    neighborsList: Array<string>,
    peerviewList: Array<string>,
    senderdescriptor?: packages_dht_protos_DhtRpc_pb.PeerDescriptor.AsObject,
    interleaving: boolean,
  }
}

export class HandshakeResponse extends jspb.Message {
  getAccepted(): boolean;
  setAccepted(value: boolean): void;

  getRequestid(): string;
  setRequestid(value: string): void;

  hasInterleavetarget(): boolean;
  clearInterleavetarget(): void;
  getInterleavetarget(): packages_dht_protos_DhtRpc_pb.PeerDescriptor | undefined;
  setInterleavetarget(value?: packages_dht_protos_DhtRpc_pb.PeerDescriptor): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): HandshakeResponse.AsObject;
  static toObject(includeInstance: boolean, msg: HandshakeResponse): HandshakeResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: HandshakeResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): HandshakeResponse;
  static deserializeBinaryFromReader(message: HandshakeResponse, reader: jspb.BinaryReader): HandshakeResponse;
}

export namespace HandshakeResponse {
  export type AsObject = {
    accepted: boolean,
    requestid: string,
    interleavetarget?: packages_dht_protos_DhtRpc_pb.PeerDescriptor.AsObject,
  }
}

export class InterleaveNotice extends jspb.Message {
  getSenderid(): string;
  setSenderid(value: string): void;

  getRandomgraphid(): string;
  setRandomgraphid(value: string): void;

  hasInterleavetarget(): boolean;
  clearInterleavetarget(): void;
  getInterleavetarget(): packages_dht_protos_DhtRpc_pb.PeerDescriptor | undefined;
  setInterleavetarget(value?: packages_dht_protos_DhtRpc_pb.PeerDescriptor): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): InterleaveNotice.AsObject;
  static toObject(includeInstance: boolean, msg: InterleaveNotice): InterleaveNotice.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: InterleaveNotice, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): InterleaveNotice;
  static deserializeBinaryFromReader(message: InterleaveNotice, reader: jspb.BinaryReader): InterleaveNotice;
}

export namespace InterleaveNotice {
  export type AsObject = {
    senderid: string,
    randomgraphid: string,
    interleavetarget?: packages_dht_protos_DhtRpc_pb.PeerDescriptor.AsObject,
  }
}

export class LeaveNotice extends jspb.Message {
  getRandomgraphid(): string;
  setRandomgraphid(value: string): void;

  getSenderid(): string;
  setSenderid(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): LeaveNotice.AsObject;
  static toObject(includeInstance: boolean, msg: LeaveNotice): LeaveNotice.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: LeaveNotice, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): LeaveNotice;
  static deserializeBinaryFromReader(message: LeaveNotice, reader: jspb.BinaryReader): LeaveNotice;
}

export namespace LeaveNotice {
  export type AsObject = {
    randomgraphid: string,
    senderid: string,
  }
}

export class NeighborUpdate extends jspb.Message {
  getSenderid(): string;
  setSenderid(value: string): void;

  getRandomgraphid(): string;
  setRandomgraphid(value: string): void;

  clearNeighbordescriptorsList(): void;
  getNeighbordescriptorsList(): Array<packages_dht_protos_DhtRpc_pb.PeerDescriptor>;
  setNeighbordescriptorsList(value: Array<packages_dht_protos_DhtRpc_pb.PeerDescriptor>): void;
  addNeighbordescriptors(value?: packages_dht_protos_DhtRpc_pb.PeerDescriptor, index?: number): packages_dht_protos_DhtRpc_pb.PeerDescriptor;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): NeighborUpdate.AsObject;
  static toObject(includeInstance: boolean, msg: NeighborUpdate): NeighborUpdate.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: NeighborUpdate, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): NeighborUpdate;
  static deserializeBinaryFromReader(message: NeighborUpdate, reader: jspb.BinaryReader): NeighborUpdate;
}

export namespace NeighborUpdate {
  export type AsObject = {
    senderid: string,
    randomgraphid: string,
    neighbordescriptorsList: Array<packages_dht_protos_DhtRpc_pb.PeerDescriptor.AsObject>,
  }
}

export interface Layer2TypeMap {
  DATA: 0;
}

export const Layer2Type: Layer2TypeMap;

