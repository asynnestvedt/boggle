'use strict'

const path = require('node:path')

module.exports = function configuration(env = process.env) {
    const production = env.NODE_ENV === 'production'
    const port = Number(env.PORT || 3000)
    const publicUrl = new URL(env.APP_URL || `http://localhost:${port}`)
    if (!['http:', 'https:'].includes(publicUrl.protocol) || publicUrl.username || publicUrl.password) throw new Error('APP_URL must be an HTTP(S) URL.')
    if (production && (!env.APP_URL || publicUrl.protocol !== 'https:')) throw new Error('Production requires an HTTPS APP_URL.')
    const resetEmailDisabled = env.RESET_EMAIL_DISABLED === 'true'
    if (production && !resetEmailDisabled && (!env.SMTP_HOST || !env.MAIL_FROM)) throw new Error('Production requires SMTP_HOST and MAIL_FROM for password resets.')
    const smtpPort = Number(env.SMTP_PORT || 587)
    const trustProxy = Number(env.TRUST_PROXY_HOPS || 0)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.')
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) throw new Error('SMTP_PORT must be between 1 and 65535.')
    if (!Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 10) throw new Error('TRUST_PROXY_HOPS must be between 0 and 10.')
    return {
        port, production, resetEmailDisabled, publicUrl: publicUrl.origin,
        dataDir: path.resolve(env.DATA_DIR || path.join(__dirname, '../../.data')),
        publicDir: path.resolve(__dirname, '../../public'),
        trustProxy,
        mailFrom: env.MAIL_FROM || 'Woggle <woggle@localhost>',
        smtp: {
            host: env.SMTP_HOST, port: smtpPort, secure: smtpPort === 465,
            requireTLS: true,
            ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {})
        }
    }
}
