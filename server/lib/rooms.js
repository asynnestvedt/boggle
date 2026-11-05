'use strict'

const { randomBytes, randomUUID } = require('node:crypto')
const { Board } = require('./boggle')
const { AppError } = require('./auth')
const RETENTION_MS = 24 * 60 * 60 * 1000
const DURATIONS = [60, 120, 180, 240, 300, 600]

class Rooms {
    constructor(store, { now = Date.now, makeBoard = size => new Board(size, size) } = {}) {
        this.store = store
        this.now = now
        this.makeBoard = makeBoard
        this.rooms = new Map(store.loadRooms().map(room => [room.id, room]))
        this.connections = new Map()
        this.onChange = () => {}
        this.nextCleanup = 0
        this.tick()
    }
    persist(room) {
        room.updatedAt = this.now()
        room.version++
        this.store.saveRoom(room)
    }
    create(user) {
        if (this.rooms.size >= 5000) throw new AppError('Room capacity reached. Try again later.', 503)
        const room = {
            id: randomBytes(12).toString('hex'), hostId: user.id, version: 0,
            updatedAt: this.now(), members: [{ id: user.id, name: user.name }], round: null
        }
        this.rooms.set(room.id, room)
        this.persist(room)
        return room
    }
    get(id) {
        const room = this.rooms.get(id)
        if (!room) throw new AppError('This room does not exist or has expired.', 404)
        return room
    }
    join(id, user, socket) {
        const room = this.get(id)
        if (!room.members.some(member => member.id === user.id)) {
            if (room.members.length >= 32) throw new AppError('This room is full.', 409)
            room.members.push({ id: user.id, name: user.name })
        }
        if (!room.hostId) room.hostId = user.id
        if (!this.connections.has(id)) this.connections.set(id, new Set())
        this.connections.get(id).add(socket)
        this.persist(room)
        this.finishIfDue(room)
        this.onChange(room)
        return room
    }
    disconnect(id, socket) {
        const connections = this.connections.get(id)
        connections?.delete(socket)
        if (connections?.size === 0) this.connections.delete(id)
        // Membership and host identity survive transient network loss and reloads.
        const room = this.rooms.get(id)
        if (room) this.onChange(room)
    }
    leave(room, userId) {
        room.members = room.members.filter(member => member.id !== userId)
        if (room.hostId === userId) room.hostId = room.members[0]?.id || null
        this.persist(room)
        this.onChange(room)
    }
    requireMember(room, userId) {
        if (!room.members.some(member => member.id === userId)) throw new AppError('Join this room first.', 403)
    }
    claimHost(room, userId) {
        this.requireMember(room, userId)
        const hostOnline = [...(this.connections.get(room.id) || [])].some(ws => ws.userId === room.hostId && ws.readyState === 1)
        if (hostOnline && room.hostId !== userId) throw new AppError('The current host is still connected.', 409)
        room.hostId = userId
        this.persist(room)
        this.onChange(room)
    }
    start(room, userId, payload) {
        this.requireMember(room, userId)
        if (room.hostId !== userId) throw new AppError('Only the room host can start a round.', 403)
        this.finishIfDue(room)
        if (room.round?.status === 'playing') throw new AppError('A round is already in progress.', 409)
        // Version guards prevent queued/double-clicked requests from replacing another round.
        if (payload.version !== room.version) throw new AppError('The room changed. Please try again.', 409)
        const size = payload.dimensions === '4x4' ? 4 : payload.dimensions === '5x5' ? 5 : null
        if (!size || !DURATIONS.includes(payload.duration) || !['natural', 'random'].includes(payload.orientation)) {
            throw new AppError('Choose a supported board size, duration, and orientation.')
        }
        const dice = this.makeBoard(size).dice.map(die => ({
            selected: die.selected, orientation: payload.orientation === 'natural' ? 0 : die.orientation
        }))
        const startedAt = this.now()
        const players = room.members.filter(member => [...(this.connections.get(room.id) || [])].some(ws => ws.userId === member.id && ws.readyState === 1))
        this.store.recordGroup(players, startedAt)
        room.round = {
            id: randomUUID(), status: 'playing', width: size, height: size, dice,
            duration: payload.duration, startedAt, endsAt: startedAt + payload.duration * 1000,
            words: {}
        }
        this.persist(room)
        this.onChange(room)
    }
    submit(room, userId, payload) {
        this.requireMember(room, userId)
        this.finishIfDue(room)
        const round = room.round
        if (!round || round.status !== 'playing' || round.id !== payload.roundId) {
            throw new AppError('This round has ended or changed.', 409)
        }
        const path = payload.path
        if (!Array.isArray(path) || path.length < 2 || path.length > round.dice.length || new Set(path).size !== path.length) {
            throw new AppError('Select adjacent dice without reusing a die.')
        }
        path.forEach((position, index) => {
            if (!Number.isInteger(position) || position < 0 || position >= round.dice.length) throw new AppError('Invalid die position.')
            if (index) {
                const previous = path[index - 1]
                if (Math.abs(position % round.width - previous % round.width) > 1 ||
                    Math.abs(Math.floor(position / round.width) - Math.floor(previous / round.width)) > 1) {
                    throw new AppError('Select adjacent dice.')
                }
            }
        })
        const word = path.map(position => round.dice[position].selected).join('').toUpperCase()
        if (word.length < 3) throw new AppError('Words must have at least three letters.')
        const words = round.words[userId] || []
        if (words.some(entry => entry.word === word)) return // Idempotent submission after a lost acknowledgement.
        if (words.length >= 500) throw new AppError('Word limit reached for this round.')
        words.push({ word, path, points: word.length - 2 })
        round.words[userId] = words
        this.persist(room)
        this.onChange(room)
    }
    finishIfDue(room) {
        if (room.round?.status === 'playing' && this.now() >= room.round.endsAt) {
            room.round.status = 'finished'
            this.persist(room)
            this.onChange(room)
        }
    }
    reviewWord(room, userId, payload) {
        this.requireMember(room, userId)
        this.finishIfDue(room)
        if (room.round?.status !== 'finished' || payload.roundId !== room.round.id) throw new AppError('Review words after this round ends.', 409)
        if (typeof payload.word !== 'string' || typeof payload.excluded !== 'boolean') throw new AppError('Invalid word review.')
        const entry = (room.round.words[userId] || []).find(word => word.word === payload.word)
        if (!entry) throw new AppError('That word is not in your saved list.')
        entry.excluded = payload.excluded
        this.persist(room)
        this.onChange(room)
    }
    snapshot(room, userId) {
        const online = new Set([...(this.connections.get(room.id) || [])].filter(ws => ws.readyState === 1).map(ws => ws.userId))
        const { words, ...round } = room.round || {}
        return {
            id: room.id, hostId: room.hostId, version: room.version, serverNow: this.now(),
            members: room.members.map(member => ({ ...member, online: online.has(member.id) })),
            round: room.round ? {
                ...round, myWords: words[userId] || [],
                ...(round.status === 'finished' ? { results: room.members.map(member => ({
                    ...member, words: words[member.id] || [],
                    score: (words[member.id] || []).reduce((sum, entry) => sum + (entry.excluded ? 0 : entry.points), 0)
                })) } : {})
            } : null
        }
    }
    tick() {
        const now = this.now()
        for (const room of this.rooms.values()) {
            this.finishIfDue(room)
            if (!this.connections.has(room.id) && now - room.updatedAt >= RETENTION_MS) {
                this.rooms.delete(room.id)
                this.store.deleteRoom(room.id)
            }
        }
        if (now >= this.nextCleanup) {
            this.store.clean(now)
            this.nextCleanup = now + 60000
        }
    }
}

module.exports = Rooms
