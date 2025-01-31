import https from 'https'
import { Err, ErrorCode, ServerError } from './errors'

export async function request<T>(method: string, url: string, body: object, timeout?: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const req = https.request(url, {
            method,
            rejectUnauthorized: false,
            headers: {
                'Content-Type': 'application/json'
            }
        }, (res) => {
            let data = ''
            res.on('data', (chunk) => data += chunk)
            res.on('end', () => {
                const responseBody = JSON.parse(data) as T

                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(responseBody)
                } else {
                    reject(new ServerError(new Err(ErrorCode.SERVER_ERROR, res.statusCode ?? 500, data)))
                }
            })
        })

        if (timeout !== undefined) {
            req.setTimeout(timeout, () => {
                req.destroy()
                reject(new Error('Request timed out'))
            })
        }

        req.on('error', reject)
        req.write(JSON.stringify(body))
        req.end()
    })
}
