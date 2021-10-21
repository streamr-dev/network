// Adapted from here https://github.com/mqttjs/mqtt-connection/issues/20. There doesn't seem to be any official typings
// available, unfortunately.
declare module 'mqtt-connection' {
    import { EventEmitter } from 'events'
    import { Duplexify } from 'duplexify'
    import * as mqtt from 'mqtt-packet'
    import { Duplex } from 'stream'

    export = Connection

    type ConnectionCallback = () => void

    interface ConnectionConstructor {
        (duplex?: Duplex, opts?: any | ConnectionCallback, cb?: ConnectionCallback): Connection.Connection

        new(duplex?: Duplex, opts?: any | ConnectionCallback, cb?: ConnectionCallback): Connection.Connection
    }

    declare const Connection: ConnectionConstructor
    declare namespace Connection {
        interface Connection extends Duplexify, EventEmitter {
            connect(opts: Partial<mqtt.IConnectPacket>, cb?: ConnectionCallback): void

            connack(opts: Partial<mqtt.IConnackPacket>, cb?: ConnectionCallback): void

            publish(opts: Partial<mqtt.IPubackPacket>, cb?: ConnectionCallback): void

            puback(opts: Partial<mqtt.IPubackPacket>, cb?: ConnectionCallback): void

            pubrec(opts: Partial<mqtt.IPubrecPacket>, cb?: ConnectionCallback): void

            pubrel(opts: Partial<mqtt.IPubrelPacket>, cb?: ConnectionCallback): void

            pubcomp(opts: Partial<mqtt.IPubcompPacket>, cb?: ConnectionCallback): void

            subscribe(opts: Partial<mqtt.ISubscribePacket>, cb?: ConnectionCallback): void

            suback(opts: Partial<mqtt.ISubackPacket>, cb?: ConnectionCallback): void

            unsubscribe(opts: Partial<mqtt.IUnsubscribePacket>, cb?: ConnectionCallback): void

            unsuback(opts: Partial<mqtt.IUnsubackPacket>, cb?: ConnectionCallback): void

            pingreq(opts: Partial<mqtt.IPingreqPacket>, cb?: ConnectionCallback): void

            pingresp(opts?: Partial<mqtt.IPingrespPacket>, cb?: ConnectionCallback): void

            disconnect(opts: Partial<mqtt.IDisconnectPacket>, cb?: ConnectionCallback): void

            auth(opts: any, cb?: ConnectionCallback): void

            on(event: "connack", cb: (packet: mqtt.IConnackPacket) => void)
            on(event: "connect", cb: (packet: mqtt.IConnectPacket) => void)
            on(event: "disconnect", cb: (packet: mqtt.IDisconnectPacket) => void)
            on(event: "pingreq", cb: (packet: mqtt.IPingreqPacket) => void)
            on(event: "pingresp", cb: (packet: mqtt.IPingrespPacket) => void)
            on(event: "puback", cb: (packet: mqtt.IPubackPacket) => void)
            on(event: "pubcomp", cb: (packet: mqtt.IPubcompPacket) => void)
            on(event: "publish", cb: (packet: mqtt.IPublishPacket) => void)
            on(event: "pubrel", cb: (packet: mqtt.IPubrelPacket) => void)
            on(event: "pubrec", cb: (packet: mqtt.IPubrecPacket) => void)
            on(event: "suback", cb: (packet: mqtt.ISubackPacket) => void)
            on(event: "subscribe", cb: (packet: mqtt.ISubscribePacket & mqtt.ISubscription) => void) // why is this packet wrong without the union?
            on(event: "unsuback", cb: (packet: mqtt.IUnsubackPacket) => void)
            on(event: "unsubscribe", cb: (packet: mqtt.IUnsubscribePacket) => void)
            on(event: 'close', cb: () => void)
            on(event: 'error', cb: (err?: any) => void)
            on(event: 'disconnect', cb: () => void)

            destroy(): void

            setOptions(opts: any): void

            // once listeners added by Streamr
            once(event: "connect", cb: (packet: mqtt.IConnectPacket) => void)
            once(event: "close", cb: () => void)
            once(event: "disconnect", cb: (packet: mqtt.IDisconnectPacket) => void)
        }
    }
}
