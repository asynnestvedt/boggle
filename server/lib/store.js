'use strict'

const { DatabaseSync } = require('node:sqlite')
const { mkdirSync } = require('node:fs')
const path = require('node:path')
const { randomBytes } = require('node:crypto')

class Store {
    constructor(filename) {
        if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true })
        this.db = new DatabaseSync(filename)
        this.db.exec(`
            PRAGMA foreign_keys = ON;
            PRAGMA journal_mode = WAL;
            PRAGMA busy_timeout = 5000;
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
            ) STRICT;
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL
            ) STRICT;
            CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
            CREATE TABLE IF NOT EXISTS password_resets (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL
            ) STRICT;
            CREATE TABLE IF NOT EXISTS rooms (
                id TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL
            ) STRICT;
            CREATE TABLE IF NOT EXISTS recent_groups (
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                group_key TEXT NOT NULL, members TEXT NOT NULL, played_at INTEGER NOT NULL,
                PRIMARY KEY (user_id, group_key)
            ) STRICT;
            CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
            CREATE TABLE IF NOT EXISTS daily_words (
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                day TEXT NOT NULL, guesses TEXT NOT NULL,
                PRIMARY KEY (user_id, day)
            ) STRICT;
        `)
        this.db.prepare('INSERT OR IGNORE INTO app_settings VALUES (?, ?)').run('letterlight_secret', randomBytes(32).toString('hex'))
    }
    transaction(callback) {
        this.db.exec('BEGIN IMMEDIATE')
        try {
            const result = callback()
            this.db.exec('COMMIT')
            return result
        } catch (error) {
            this.db.exec('ROLLBACK')
            throw error
        }
    }
    userByEmail(email) { return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) }
    userById(id) { return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) }
    createUser(user) {
        this.db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)')
            .run(user.id, user.email, user.name, user.password_hash, Date.now())
    }
    addSession(hash, userId, expiresAt) {
        this.db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(hash, userId, expiresAt)
    }
    session(hash, now = Date.now()) {
        return this.db.prepare(`SELECT users.*, sessions.expires_at FROM sessions
            JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?`).get(hash, now)
    }
    deleteSession(hash) { this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash) }
    revokeUserSessions(id) { this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id) }
    addReset(hash, userId, expiresAt) {
        this.db.prepare('INSERT OR REPLACE INTO password_resets VALUES (?, ?, ?)').run(hash, userId, expiresAt)
    }
    reset(hash, now = Date.now()) {
        return this.db.prepare('SELECT * FROM password_resets WHERE token_hash = ? AND expires_at > ?').get(hash, now)
    }
    deleteReset(hash) { this.db.prepare('DELETE FROM password_resets WHERE token_hash = ?').run(hash) }
    setPassword(id, hash) {
        this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id)
        this.revokeUserSessions(id)
        this.db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(id)
    }
    saveRoom(room) {
        this.db.prepare('INSERT OR REPLACE INTO rooms VALUES (?, ?, ?)').run(room.id, JSON.stringify(room), room.updatedAt)
    }
    loadRooms() { return this.db.prepare('SELECT state FROM rooms').all().map(row => JSON.parse(row.state)) }
    deleteRoom(id) { this.db.prepare('DELETE FROM rooms WHERE id = ?').run(id) }
    recordGroup(members, now) {
        if (members.length < 2) return
        const key = members.map(member => member.id).sort().join(',')
        const statement = this.db.prepare('INSERT OR REPLACE INTO recent_groups VALUES (?, ?, ?, ?)')
        for (const member of members) {
            statement.run(member.id, key, JSON.stringify(members), now)
            this.db.prepare(`DELETE FROM recent_groups WHERE user_id = ? AND group_key NOT IN
                (SELECT group_key FROM recent_groups WHERE user_id = ? ORDER BY played_at DESC LIMIT 10)`).run(member.id, member.id)
        }
    }
    recentGroups(userId) {
        return this.db.prepare('SELECT members, played_at FROM recent_groups WHERE user_id = ? ORDER BY played_at DESC LIMIT 10')
            .all(userId).map(row => ({ members: JSON.parse(row.members), playedAt: row.played_at }))
    }
    dailySecret() { return this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get('letterlight_secret').value }
    dailyGuesses(userId, day) {
        const row = this.db.prepare('SELECT guesses FROM daily_words WHERE user_id = ? AND day = ?').get(userId, day)
        return row ? JSON.parse(row.guesses) : []
    }
    saveDailyGuesses(userId, day, guesses) {
        this.db.prepare('INSERT OR REPLACE INTO daily_words VALUES (?, ?, ?)').run(userId, day, JSON.stringify(guesses))
    }
    clean(now) {
        this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now)
        this.db.prepare('DELETE FROM password_resets WHERE expires_at <= ?').run(now)
    }
    close() { this.db.close() }
}

module.exports = Store
