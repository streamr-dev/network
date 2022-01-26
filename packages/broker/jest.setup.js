import { KeyServer } from 'streamr-test-utils'

export default async () => {
    global.__StreamrKeyserver = new KeyServer()
}
