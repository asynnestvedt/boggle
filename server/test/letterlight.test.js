'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const Store = require('../lib/store')
const { Letterlight, evaluate } = require('../lib/letterlight')
const { launch } = require('./helpers')

test('letter scoring allocates repeated letters after exact matches', () => {
    assert.deepEqual(evaluate('APPLE', 'ALLEY'), ['correct', 'present', 'absent', 'present', 'absent'])
    assert.deepEqual(evaluate('SHEEP', 'EERIE'), ['present', 'present', 'absent', 'absent', 'absent'])
    assert.deepEqual(evaluate('APPLE', 'APPLE'), Array(5).fill('correct'))
})

test('daily games reject invalid and stale guesses, preserve progress, and rotate at UTC midnight', () => {
    const store = new Store(':memory:')
    try {
        store.createUser({ id: 'player', email: 'a@example.com', name: 'A', password_hash: 'test' })
        let now = Date.parse('2026-11-05T23:59:59Z')
        const game = new Letterlight(store, { now: () => now })
        game.answer = () => 'APPLE'
        let state = game.state('player')
        assert.equal(state.answer, undefined)
        assert.throws(() => game.guess('player', { day: state.day, guessCount: 0, word: 'ZZZZZ' }), /word list/)
        state = game.guess('player', { day: state.day, guessCount: 0, word: 'ALLEY' })
        assert.equal(state.guesses.length, 1)
        assert.equal(new Letterlight(store, { now: () => now }).state('player').guesses[0].word, 'ALLEY')
        assert.throws(() => game.guess('player', { day: state.day, guessCount: 0, word: 'APPLE' }), /another device/)
        state = game.guess('player', { day: state.day, guessCount: 1, word: 'APPLE' })
        assert.equal(state.status, 'won')
        assert.equal(state.answer, 'APPLE')
        assert.throws(() => game.guess('player', { day: state.day, guessCount: 2, word: 'APPLE' }), /finished/)
        now += 1000
        assert.throws(() => game.guess('player', { day: state.day, guessCount: 2, word: 'APPLE' }), /new puzzle/i)
        assert.equal(game.state('player').guesses.length, 0)
    } finally { store.close() }
})

test('daily API requires login and stores guesses for the account', async t => {
    const app = await launch(t)
    assert.equal((await app.request('/api/letterlight')).status, 401)
    const user = await app.register('letterlight@example.com')
    const initial = await app.request('/api/letterlight', undefined, user.cookie)
    assert.equal(initial.status, 200)
    assert.equal(initial.data.answer, undefined)
    const guess = await app.request('/api/letterlight/guess', { day: initial.data.day, guessCount: 0, word: 'CRANE' }, user.cookie)
    assert.equal(guess.status, 200)
    assert.equal(guess.data.guesses[0].word, 'CRANE')
    assert.deepEqual((await app.request('/api/letterlight', undefined, user.cookie)).data, guess.data)
})
