declare module 'speedometer' {
    export default function speedometer(seconds?: number): (delta?: number) => number
}
