'use strict'

const { createHmac } = require('node:crypto')
const { AppError } = require('./auth')
const words = new Set(require('an-array-of-english-words').filter(word => /^[a-z]{5}$/.test(word)).map(word => word.toUpperCase()))
// Hand-selected familiar answers; guesses use the larger MIT-licensed dictionary.
const answers = `APPLE BEACH BERRY BLADE BLOOM BRAIN BREAD BRICK BRIDE BRING BROAD BRUSH CANDY CHAIR CHARM CHASE CHEST CHIME CLOUD COAST COMET CORAL CRANE CREAM CRISP CROWN DANCE DREAM DRIFT EARTH EIGHT EMBER FAITH FIELD FLAME FLOAT FLOOD FLOUR FLUTE FOCUS FRAME FRESH FRONT FRUIT GHOST GIANT GLASS GLOBE GRACE GRAIN GRAPE GRASS GREEN GROVE GUARD HAPPY HEART HONEY HORSE HOUSE IMAGE IVORY JUICE KNIFE LEMON LIGHT LILAC LUNCH MAGIC MAPLE MARCH MATCH MELON MERCY METAL MIGHT MINOR MODEL MONEY MONTH MOUSE MOVIE MUSIC NIGHT NORTH OCEAN OLIVE OPERA ORBIT PAINT PANEL PARTY PEACH PEARL PIANO PILOT PITCH PLANT PLATE POINT POUND POWER PRESS PRICE PRIDE PRIME PRINT PRIZE PROUD QUEEN QUICK QUIET RADIO RAINY RAISE RAVEN REACH RIVER ROBOT ROUND ROUTE ROYAL SCALE SCENE SCOUT SENSE SHADE SHAKE SHAPE SHARE SHARP SHEEP SHELF SHINE SHIRT SHORE SHORT SKATE SLEEP SLICE SMALL SMART SMILE SMOKE SNAKE SOLAR SOLID SOUND SOUTH SPACE SPARE SPEAK SPICE SPIRE SPOON SPORT SPRAY STAGE STAIR STAMP STAND STARE STEAM STEEL STONE STORM STORY STRAW SUGAR SUNNY SWEET TABLE TASTE TEACH THANK THEME THICK THING THINK TIGER TIMER TODAY TOOTH TOUCH TOWER TRACE TRAIL TRAIN TREAT TREND TRIAL TRIBE TRUCK TRULY TRUST TULIP TWICE UNDER UNION UNITY UNTIL UPPER URBAN VALUE VIDEO VISIT VOICE WATER WHEEL WHITE WHOLE WOMAN WORLD WRITE YOUNG ZEBRA`.split(' ')
for (const word of answers) words.add(word)

function evaluate(answer, guess) {
    const result = Array(5).fill('absent')
    const counts = new Map()
    for (let i = 0; i < 5; i++) {
        if (guess[i] === answer[i]) result[i] = 'correct'
        else counts.set(answer[i], (counts.get(answer[i]) || 0) + 1)
    }
    for (let i = 0; i < 5; i++) {
        if (result[i] === 'correct') continue
        const remaining = counts.get(guess[i]) || 0
        if (remaining) { result[i] = 'present'; counts.set(guess[i], remaining - 1) }
    }
    return result
}

class Letterlight {
    constructor(store, { now = Date.now } = {}) { this.store = store; this.now = now; this.secret = store.dailySecret() }
    day() { return new Date(this.now()).toISOString().slice(0, 10) }
    answer(day) {
        const digest = createHmac('sha256', this.secret).update(day).digest()
        return answers[digest.readUInt32BE(0) % answers.length]
    }
    state(userId, day = this.day()) {
        const answer = this.answer(day)
        const guesses = this.store.dailyGuesses(userId, day)
        const won = guesses.includes(answer)
        const status = won ? 'won' : guesses.length >= 6 ? 'lost' : 'playing'
        return { day, status, guesses: guesses.map(word => ({ word, result: evaluate(answer, word) })),
            ...(status !== 'playing' ? { answer } : {}) }
    }
    guess(userId, input) {
        const day = this.day()
        if (input.day !== day) throw new AppError('A new puzzle is ready. Reload to play it.', 409)
        if (typeof input.word !== 'string' || !/^[a-zA-Z]{5}$/.test(input.word)) throw new AppError('Enter five letters.')
        const word = input.word.toUpperCase()
        if (!words.has(word)) throw new AppError('That word is not in the word list.')
        return this.store.transaction(() => {
            const state = this.state(userId, day)
            if (state.status !== 'playing') throw new AppError('You have finished today’s puzzle.', 409)
            if (input.guessCount !== state.guesses.length) throw new AppError('Your puzzle changed on another device. Please try again.', 409)
            const guesses = state.guesses.map(entry => entry.word)
            guesses.push(word)
            this.store.saveDailyGuesses(userId, day, guesses)
            return this.state(userId, day)
        })
    }
}
module.exports = { Letterlight, evaluate }
