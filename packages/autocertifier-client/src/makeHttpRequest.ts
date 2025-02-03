import https from 'https'
import { Err, ErrorCode } from './errors'

export async function makeHttpRequest<T>(method: string, url: string, body: object, timeout?: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const req = https.request(url, {
            method,
            rejectUnauthorized: false, // crucial for allowing self-signed certificates before subdomain is assigned
            headers: {
                'Content-Type': 'application/json'
            }
        }, (res) => {
            let data = ''
            res.on('data', (chunk) => data += chunk)
            res.on('end', () => {
                let responseBody
                try {
                    responseBody = JSON.parse(data)
                } catch (e) {
                    reject(new Err(ErrorCode.SERVER_ERROR, res.statusCode ?? 500, `Invalid JSON response: ${data}`))
                    return
                }

                if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(responseBody)
                } else {
                    reject(new Err(responseBody.code ?? ErrorCode.SERVER_ERROR, res.statusCode ?? 500, data))
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
