'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { WebSocket } = require('ws')
const { launch } = require('./helpers')
const Rooms = require('../lib/rooms')
const Store = require('../lib/store')
const { Board, Game } = require('../lib/boggle')

const settings = { dimensions: '4x4', duration: 60, orientation: 'natural' }

test('server owns boards/deadlines; late joins, reloads, multiple tabs, and malformed messages stay in sync', async t => {
    let now = Date.now()
    const app = await launch(t, { roomOptions: { now: () => now } })
    const host = await app.register('host@example.com', 'Host')
    const guest = await app.register('guest@example.com', 'Guest')
    const roomId = (await app.request('/api/rooms', {}, host.cookie)).data.roomId
    const a = await app.connect(roomId, host.cookie, '&uid=forged&name=Forged')
    let state = await a.state()
    assert.equal(state.members[0].name, 'Host')
    a.send('startRound', { ...settings, version: state.version, dice: [{ selected: 'FORGED' }], endsAt: 1 })
    const started = await a.state(s => s.round?.status === 'playing')
    assert.equal(started.round.dice.length, 16)
    assert.ok(started.round.dice.every(die => die.selected !== 'FORGED' && die.orientation === 0))
    assert.equal(started.round.endsAt, now + 60000)
    now += 20000
    const b = await app.connect(roomId, guest.cookie)
    const joined = await b.state()
    assert.deepEqual(joined.round.dice, started.round.dice)
    assert.equal(joined.round.id, started.round.id)
    assert.equal(joined.round.endsAt, started.round.endsAt)
    assert.equal(joined.serverNow, now)
    b.send('startRound', { ...settings, version: joined.version })
    assert.match((await b.waitFor(m => m.action === 'error')).payload.message, /host/)
    a.send('submitWord', { roundId: started.round.id, path: [0, 1, 2] })
    const saved = await a.state(s => s.round?.myWords.length === 1)
    assert.equal(saved.round.myWords[0].word, started.round.dice.slice(0, 3).map(d => d.selected).join('').toUpperCase())
    b.send('sync')
    const privateView = await b.state(s => s.version >= saved.version)
    assert.equal(privateView.round.myWords.length, 0)
    assert.equal(privateView.round.words, undefined)
    assert.equal(privateView.round.results, undefined)
    // Closing one of several tabs must not remove the player or another player's socket.
    const tab = await app.connect(roomId, host.cookie)
    const tabState = await tab.state()
    assert.equal(tabState.members.filter(m => m.id === host.data.user.id).length, 1)
    assert.equal(tabState.round.myWords.length, 1)
    await a.close()
    tab.send('sync')
    assert.ok((await tab.state(s => s.members.some(m => m.id === host.data.user.id && m.online))).round)
    await tab.close()
    const reload = await app.connect(roomId, host.cookie)
    const restored = await reload.state()
    assert.deepEqual(restored.round.myWords, saved.round.myWords)
    assert.equal(restored.round.endsAt, started.round.endsAt)
    reload.ws.send('not json')
    assert.equal((await reload.waitFor(m => m.action === 'error')).action, 'error')
    reload.send('sync')
    assert.ok((await reload.state()).round)
    now = started.round.endsAt
    app.rooms.tick()
    const endedA = await reload.state(s => s.round?.status === 'finished')
    const endedB = await b.state(s => s.round?.status === 'finished')
    assert.deepEqual(endedA.round.results, endedB.round.results)
    reload.send('submitWord', { roundId: started.round.id, path: [0, 1, 2] })
    assert.match((await reload.waitFor(m => m.action === 'error')).payload.message, /ended/)
})

test('room validation rejects stale/duplicate starts, illegal paths, old rounds, and accepts Qu correctly', () => {
    const store = new Store(':memory:')
    try {
        let now = 1000
        const rooms = new Rooms(store, { now: () => now, makeBoard: () => ({ dice: ['Qu', 'I', 'T', ...Array(13).fill('A')].map(selected => ({ selected, orientation: 90 })) }) })
        const user = { id: 'host', name: 'Host' }
        const room = rooms.create(user)
        assert.throws(() => rooms.start(room, user.id, { ...settings, version: -1 }), /changed/)
        assert.throws(() => rooms.start(room, user.id, { ...settings, dimensions: '1000000x1000000', version: room.version }), /supported/)
        rooms.start(room, user.id, { ...settings, version: room.version })
        assert.throws(() => rooms.start(room, user.id, { ...settings, version: room.version }), /progress/)
        const roundId = room.round.id
        const submit = positions => rooms.submit(room, user.id, { roundId, path: positions })
        for (const invalid of [[0, 0, 1], [0, 3, 2], [0, 1, 99], [0, 1, 1.5], [3, 4, 5], ['0', 1, 2]]) {
            assert.throws(() => submit(invalid))
        }
        submit([0, 1])
        submit([0, 1])
        assert.equal(room.round.words.host.length, 1)
        assert.equal(room.round.words.host[0].word, 'QUI')
        assert.equal(room.round.words.host[0].points, 1)
        now = room.round.endsAt
        assert.throws(() => submit([0, 1, 2]), /ended/)
        rooms.start(room, user.id, { ...settings, version: room.version })
        assert.throws(() => rooms.submit(room, user.id, { roundId, path: [0, 1, 2] }), /changed/)
    } finally { store.close() }
})

test('accounts, sessions, current rounds and words survive database reopen; offline expired rooms are cleaned', async t => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'boggle-test-'))
    t.after(() => rmSync(directory, { recursive: true, force: true }))
    const filename = path.join(directory, 'test.sqlite')
    let now = Date.now()
    let store = new Store(filename)
    store.createUser({ id: 'persist', email: 'persist@example.com', name: 'Persist', password_hash: 'test' })
    store.addSession('hash', 'persist', Date.now() + 60000)
    let rooms = new Rooms(store, { now: () => now })
    const room = rooms.create({ id: 'persist', name: 'Persist' })
    rooms.start(room, 'persist', { ...settings, version: room.version })
    rooms.submit(room, 'persist', { roundId: room.round.id, path: [0, 1, 2] })
    const original = JSON.parse(JSON.stringify(room))
    store.close()
    store = new Store(filename)
    try {
        rooms = new Rooms(store, { now: () => now })
        assert.deepEqual(rooms.get(room.id), original)
        assert.equal(store.userByEmail('persist@example.com').id, 'persist')
        assert.equal(store.session('hash').id, 'persist')
        now = room.round.endsAt + 1
        rooms.tick()
        assert.equal(rooms.get(room.id).round.status, 'finished')
        now += 24 * 60 * 60 * 1000 + 1
        rooms.tick()
        assert.throws(() => rooms.get(room.id), /expired/)
    } finally { store.close() }
})

test('leaving transfers host; closing a non-member socket never removes another member', async t => {
    const app = await launch(t)
    const host = await app.register('leave-host@example.com', 'Host')
    const guest = await app.register('leave-guest@example.com', 'Guest')
    const id = (await app.request('/api/rooms', {}, host.cookie)).data.roomId
    const a = await app.connect(id, host.cookie)
    await a.state()
    const b = await app.connect(id, guest.cookie)
    await b.state()
    b.send('claimHost')
    assert.match((await b.waitFor(m => m.action === 'error')).payload.message, /still connected/)
    a.send('leaveRoom')
    const next = await b.state(s => s.hostId === guest.data.user.id)
    assert.equal(next.members.length, 1)
    app.rooms.disconnect(id, {})
    assert.equal(app.rooms.get(id).members.length, 1)
})

test('an online member can take over for an offline host without losing the round', async t => {
    const app = await launch(t)
    const host = await app.register('offline-host@example.com', 'Host')
    const guest = await app.register('offline-guest@example.com', 'Guest')
    const id = (await app.request('/api/rooms', {}, host.cookie)).data.roomId
    const a = await app.connect(id, host.cookie)
    const first = await a.state()
    a.send('startRound', { ...settings, version: first.version })
    const started = await a.state(s => s.round?.status === 'playing')
    const b = await app.connect(id, guest.cookie)
    await b.state()
    await a.close()
    await b.state(s => !s.members.find(m => m.id === host.data.user.id).online)
    b.send('claimHost')
    const claimed = await b.state(s => s.hostId === guest.data.user.id)
    assert.equal(claimed.round.id, started.round.id)
    assert.equal(claimed.round.endsAt, started.round.endsAt)
})

test('word review belongs to each player and scores remain server-owned and synchronized', async t => {
    let now = Date.now()
    const app = await launch(t, { roomOptions: { now: () => now } })
    const host = await app.register('review-host@example.com', 'Host')
    const guest = await app.register('review-guest@example.com', 'Guest')
    const id = (await app.request('/api/rooms', {}, host.cookie)).data.roomId
    const a = await app.connect(id, host.cookie)
    const first = await a.state()
    a.send('startRound', { ...settings, version: first.version })
    const started = await a.state(s => s.round?.status === 'playing')
    const b = await app.connect(id, guest.cookie)
    await b.state()
    a.send('submitWord', { roundId: started.round.id, path: [0, 1, 2] })
    const saved = await a.state(s => s.round?.myWords.length === 1)
    const word = saved.round.myWords[0].word
    const points = saved.round.myWords[0].points
    a.send('reviewWord', { roundId: started.round.id, word, excluded: true })
    assert.match((await a.waitFor(m => m.action === 'error')).payload.message, /after/)
    now = started.round.endsAt
    app.rooms.tick()
    await a.state(s => s.round?.status === 'finished')
    await b.state(s => s.round?.status === 'finished')
    b.send('reviewWord', { roundId: started.round.id, word, excluded: true })
    assert.match((await b.waitFor(m => m.action === 'error')).payload.message, /your saved list/)
    a.send('reviewWord', { roundId: started.round.id, word, excluded: true, points: 999 })
    const reviewed = await a.state(s => s.round?.myWords[0]?.excluded)
    const other = await b.state(s => s.version === reviewed.version)
    assert.deepEqual(reviewed.round.results, other.round.results)
    assert.equal(reviewed.round.results.find(r => r.id === host.data.user.id).score, 0)
    a.send('reviewWord', { roundId: started.round.id, word, excluded: false })
    assert.equal((await a.state(s => s.version > reviewed.version)).round.results.find(r => r.id === host.data.user.id).score, points)
})

test('WebSocket upgrades require a server session and the correct origin', async t => {
    const app = await launch(t)
    const account = await app.register('upgrade@example.com')
    const id = (await app.request('/api/rooms', {}, account.cookie)).data.roomId
    async function rejected(headers) {
        return new Promise(resolve => {
            const socket = new WebSocket(app.config.publicUrl.replace('http', 'ws') + `/api/rooms/socket?room=${id}`, { headers })
            socket.on('error', error => resolve(error.message))
        })
    }
    assert.match(await rejected({ Origin: app.config.publicUrl }), /401/)
    assert.match(await rejected({ Origin: 'https://evil.example', Cookie: account.cookie }), /403/)
})

test('standard and deluxe boards use the right dice pool and validate dimensions', () => {
    assert.equal(new Board(4, 4).dice.length, 16)
    assert.equal(new Board(5, 5).dice.length, 25)
    assert.equal(Game.dice(4).length, 16)
    assert.equal(Game.dice(5).length, 25)
    assert.throws(() => new Board(99999, 99999), /4x4/)
})

test('voice audio is relayed only to opted-in members of the same room', async t => {
    const app = await launch(t)
    const a = await app.register('voice-a@example.com', 'A')
    const b = await app.register('voice-b@example.com', 'B')
    const c = await app.register('voice-c@example.com', 'C')
    const room = (await app.request('/api/rooms', {}, a.cookie)).data.roomId
    const otherRoom = (await app.request('/api/rooms', {}, c.cookie)).data.roomId
    const speaker = await app.connect(room, a.cookie)
    const listener = await app.connect(room, b.cookie)
    const outsider = await app.connect(otherRoom, c.cookie)
    await Promise.all([speaker.state(), listener.state(), outsider.state()])
    speaker.send('voiceJoin')
    outsider.send('voiceJoin')
    await Promise.all([speaker.waitFor(m => m.action === 'voicePresence'), outsider.waitFor(m => m.action === 'voicePresence')])
    speaker.ws.send(Buffer.alloc(3200, 3))
    listener.send('voiceJoin')
    await listener.waitFor(m => m.action === 'voicePresence')
    speaker.ws.send(Buffer.alloc(3200, 7))
    const audio = await listener.waitFor(m => m.action === 'audio')
    assert.equal(audio.payload.length, 3236)
    assert.equal(audio.payload[36], 7)
    assert.equal(outsider.messages.some(m => m.action === 'audio'), false)
    listener.send('voiceLeave')
    await speaker.waitFor(m => m.action === 'voicePresence' && m.payload.users.length === 1)
    speaker.ws.send(Buffer.alloc(3200, 9))
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(listener.messages.some(m => m.action === 'audio'), false)
})
