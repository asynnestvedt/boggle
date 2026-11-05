// Run outside Playwright's module loader so node:sqlite works on Node 22 as well.
const { createApplication } = require('../../server')
const configuration = require('../../server/config/config')
const Store = require('../../server/lib/store')
const config = configuration({ PORT: '3000' })
let now = Date.now()
const instance = createApplication({
    config, store: new Store(':memory:'),
    sendResetEmail: async (email, token) => process.send({ mail: { email, token } }),
    roomOptions: {
        now: () => now,
        makeBoard: size => ({ dice: ['C', 'A', 'T', ...Array(size * size - 3).fill('E')].map(selected => ({ selected, orientation: 0 })) })
    }
})
instance.server.listen(0, '127.0.0.1', () => {
    config.publicUrl = `http://127.0.0.1:${instance.server.address().port}`
    process.send({ url: config.publicUrl })
})
process.on('message', async message => {
    if (message.action === 'advance') { now += message.milliseconds; instance.rooms.tick() }
    if (message.action === 'dropConnections') for (const sockets of instance.rooms.connections.values()) for (const socket of sockets) socket.terminate()
    if (message.action === 'close') { await instance.close(); process.disconnect(); return }
    process.send({ id: message.id })
})
process.on('disconnect', () => process.exit(0))
