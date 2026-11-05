import { Account } from './components/account.js'
import { RoomConnection } from './lib/room-connection.js'
import { api } from './lib/http.js'
import { VoiceChat } from './components/voice.js'

const $ = selector => document.querySelector(selector)

class App {
    constructor() {
        this.state = null
        this.connected = false
        this.path = []
        this.pendingWord = null
        this.connection = new RoomConnection({
            onState: state => this.receive(state),
            onStatus: (text, connected) => {
                if (connected && !this.connected) this.message('')
                this.connected = connected
                if (!connected && (this.voice?.active || this.voice?.joining)) this.voice.stop()
                $('#connection-status').textContent = text
                $('#connection-dot').classList.toggle('online', connected)
                $('#bggl-people').setAttribute('aria-label', `Room and players, ${text.toLowerCase()}`)
                if (!connected) this.pendingWord = null
                this.renderControls()
            },
            onError: message => { if (message.startsWith('Voice chat is full')) this.voice.stop(message); this.pendingWord = null; this.message(message); this.renderControls() },
            onExpired: () => this.account.signedOut('Your session ended. Please sign in again.'),
            onLeft: () => this.leftRoom()
        })
        this.voice = new VoiceChat(this.connection)
        this.account = new Account($('#account'), user => this.setUser(user))
        $('#settings form').onsubmit = event => {
            event.preventDefault()
            if (!this.state || !this.connected) return
            const fields = Object.fromEntries(new FormData(event.target))
            if (!this.connection.send('startRound', { ...fields, duration: Number(fields.duration), version: this.state.version })) {
                this.message('Wait for the room to reconnect.')
            }
        }
        $('#bggl-save-word').onclick = () => this.saveWord()
        $('#claim-host').onclick = () => this.connection.send('claimHost', {})
        $('#new-room').onclick = () => this.newRoom()
        $('#leave-room').onclick = () => {
            if (!this.connection.send('leaveRoom', {})) this.message('Reconnect before leaving the room, or create a new room.')
        }
        const toggleRoom = () => this.showRoom($('#room-panel').hidden)
        $('#bggl-people').onclick = toggleRoom
        $('#close-room').onclick = () => this.showRoom(false)
        $('#bggl-copy-room').onclick = async () => {
            try { await navigator.clipboard.writeText($('#roomid').value); this.message('Room link copied.') }
            catch { $('#roomid').select(); this.message('Select and copy the room link.') }
        }
        $('#bggl-fullscr').onclick = () => {
            const result = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()
            result?.catch(() => this.message('Fullscreen is unavailable in this browser.'))
        }
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.connection.send('sync', {})
        })
        setInterval(() => this.renderClock(), 100)
        this.account.init()
    }
    message(text) { $('#game-message').textContent = text }
    showRoom(show) {
        $('#room-panel').hidden = !show
        $('#bggl-people').setAttribute('aria-expanded', String(show))
        if (show && this.user) this.loadRecentGroups()
    }
    async loadRecentGroups() {
        const list = $('#recent-groups-list')
        try {
            const { groups } = await api('/api/recent-groups')
            if (!groups.length) { list.textContent = 'No recent groups yet.'; return }
            list.replaceChildren(...groups.map(group => {
                const row = document.createElement('div')
                row.className = 'recent-group'
                const names = document.createElement('span')
                names.textContent = group.members.filter(member => member.id !== this.user.id).map(member => member.name).join(', ')
                const copy = document.createElement('button')
                copy.type = 'button'
                copy.textContent = 'Copy invite'
                copy.setAttribute('aria-label', `Copy invite for ${names.textContent}`)
                copy.disabled = !this.connected
                copy.onclick = async () => {
                    try { await navigator.clipboard.writeText($('#roomid').value); this.message(`Invite link copied for ${names.textContent}. Share it with them.`) }
                    catch { $('#roomid').select(); this.message('Select and copy the room link to share.') }
                }
                row.append(names, copy)
                return row
            }))
        } catch { list.textContent = 'Recent groups are unavailable right now.' }
    }
    setUser(user) {
        this.voice.stop('Voice chat is off.')
        this.connection.stop()
        this.user = user
        this.state = null
        this.clearClock()
        this.connected = false
        this.path = []
        this.pendingWord = null
        $('#my-words').textContent = ''
        $('#game').hidden = !user
        $('#board').style.display = 'none'
        $('#results').hidden = true
        this.message('')
        if (user) {
            const roomId = new URL(location.href).searchParams.get('room')
            this.connection.join(roomId)
        }
    }
    async newRoom() {
        this.voice.stop('Voice chat is off.')
        const button = $('#new-room')
        button.disabled = true
        // Explicitly leave so another member can become host of the previous room.
        if (this.connected) this.connection.send('leaveRoom', {})
        this.connected = false
        this.state = null
        this.clearClock()
        this.path = []
        this.pendingWord = null
        $('#my-words').textContent = ''
        $('#board').style.display = 'none'
        $('#results').hidden = true
        this.message('')
        await this.connection.join(null)
        button.disabled = false
    }
    leftRoom() {
        this.voice.stop('Voice chat is off.')
        this.connection.stop()
        this.state = null
        this.clearClock()
        this.connected = false
        this.path = []
        this.pendingWord = null
        $('#my-words').textContent = ''
        $('#board').style.display = 'none'
        $('#results').hidden = true
        $('#connection-status').textContent = 'You left the room.'
        $('#bggl-people-count').textContent = ''
        $('#roster').replaceChildren()
        $('#roomid').value = ''
        const url = new URL(location.href)
        url.searchParams.delete('room')
        history.replaceState(null, '', url)
        this.renderControls()
    }
    receive(state) {
        if (this.state?.id === state.id && this.state.version > state.version) return
        const hadState = Boolean(this.state)
        const isNewRound = this.state?.round?.id !== state.round?.id || this.state?.id !== state.id
        this.state = state
        this.receivedAt = performance.now()
        $('#roomid').value = location.href
        $('#bggl-people-count').textContent = state.members.filter(member => member.online).length
        $('#roster').replaceChildren(...state.members.map(member => {
            const item = document.createElement('li')
            item.textContent = `${member.name}${member.id === state.hostId ? ' (host)' : ''}${member.online ? '' : ' · offline'}`
            return item
        }))
        if (!$('#room-panel').hidden) this.loadRecentGroups()
        if (state.round) {
            if (isNewRound) {
                this.path = []
                this.pendingWord = null
                this.message('')
                this.renderBoard()
                if (state.round.status === 'playing') {
                    this.showRoom(false)
                    if (hadState) new Audio('/assets/dice-shake.mp3').play().catch(() => {})
                }
            }
            if (this.pendingWord && state.round.myWords.some(entry => entry.word === this.pendingWord)) {
                this.message(`Saved ${this.pendingWord}.`)
                this.pendingWord = null
                this.path = []
            }
            $('#my-words').textContent = `Your saved words (${state.round.myWords.length}): ${state.round.myWords.map(entry => entry.word).sort().join(', ')}`
            this.renderResults()
        }
        this.renderControls()
        this.renderClock()
    }
    remaining() {
        if (!this.state?.round) return 0
        return Math.max(0, this.state.round.endsAt - this.state.serverNow - (performance.now() - this.receivedAt))
    }
    canPlay() { return this.connected && this.state?.round?.status === 'playing' && this.remaining() > 0 }
    renderControls() {
        const round = this.state?.round
        const host = this.state && this.user?.id === this.state.hostId
        $('#settings').hidden = !host || round?.status === 'playing'
        $('#settings button').disabled = !this.connected
        $('#host-message').hidden = !this.state || host || round?.status === 'playing'
        $('#claim-host').hidden = !this.state || host || !this.connected || round?.status === 'playing' ||
            this.state.members.some(member => member.id === this.state.hostId && member.online)
        $('#leave-room').disabled = !this.connected
        $('#score-list').querySelectorAll('button').forEach(button => { button.disabled = !this.connected })
        const canPlay = this.canPlay()
        $('#board').classList.toggle('disabled', !canPlay)
        $('#board').querySelectorAll('.die').forEach((die, position) => {
            die.classList.toggle('selected', this.path.includes(position))
            die.disabled = !canPlay || Boolean(this.pendingWord)
        })
        const word = this.path.map(position => round.dice[position].selected).join('').toUpperCase()
        const save = $('#bggl-save-word')
        save.hidden = !canPlay || word.length < 3
        save.disabled = Boolean(this.pendingWord)
        save.textContent = this.pendingWord ? 'Saving…' : `Save ${word}`
    }
    renderClock() {
        const round = this.state?.round
        if (!round) return
        const remaining = round.status === 'finished' ? 0 : this.remaining()
        const seconds = Math.ceil(remaining / 1000)
        $('#round-clock').textContent = round.status === 'finished' ? 'Round finished' :
            `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}${remaining === 0 ? ' · waiting for server' : ''}`
        $('#pbarxinv').style.display = round.status === 'playing' ? 'block' : 'none'
        $('#pbarxinv .progress-inner').style.width = `${remaining / (round.duration * 1000) * 100}%`
        if (!remaining && round.status === 'playing' && this.deadlineSync !== round.id) {
            this.deadlineSync = round.id
            this.connection.send('sync', {})
        }
        if (!remaining) this.renderControls()
    }
    clearClock() {
        $('#round-clock').textContent = ''
        $('#pbarxinv').style.display = 'none'
    }
    renderBoard() {
        const round = this.state.round
        const board = $('#board')
        board.className = `board soft-corners ${round.width === 4 ? 'four-by-four' : 'five-by-five'}`
        board.style.display = 'grid'
        board.replaceChildren(...round.dice.map((die, position) => {
            const tile = document.createElement('button')
            tile.type = 'button'
            tile.className = 'die'
            tile.setAttribute('aria-label', `${die.selected}, row ${Math.floor(position / round.width) + 1}, column ${position % round.width + 1}`)
            const letters = document.createElement('span')
            letters.className = `letters r${die.orientation}${['M', 'W'].includes(die.selected) ? ' underline' : ''}`
            letters.textContent = die.selected
            tile.append(letters)
            tile.onclick = () => this.select(position)
            return tile
        }))
    }
    select(position) {
        if (!this.canPlay() || this.pendingWord) return
        const previous = this.path.at(-1)
        const width = this.state.round.width
        if (this.path.includes(position)) this.path = []
        else if (previous === undefined || (Math.abs(previous % width - position % width) <= 1 &&
            Math.abs(Math.floor(previous / width) - Math.floor(position / width)) <= 1)) this.path.push(position)
        else this.path = [position]
        this.renderControls()
    }
    saveWord() {
        if (!this.canPlay() || this.pendingWord) return
        const word = this.path.map(position => this.state.round.dice[position].selected).join('').toUpperCase()
        if (word.length < 3) return
        this.pendingWord = word
        if (!this.connection.send('submitWord', { roundId: this.state.round.id, path: this.path.slice() })) {
            this.pendingWord = null
            this.message('Wait for the room to reconnect, then submit again.')
        }
        this.renderControls()
    }
    renderResults() {
        const round = this.state.round
        $('#results').hidden = round.status !== 'finished'
        if (round.status !== 'finished') return
        const opened = new Set([...$('#score-list').querySelectorAll('details[open]')].map(element => element.dataset.player))
        $('#score-list').replaceChildren(...round.results.slice().sort((a, b) => b.score - a.score).map(player => {
            const item = document.createElement('details')
            item.dataset.player = player.id
            item.open = player.id === this.user.id || opened.has(player.id)
            const summary = document.createElement('summary')
            summary.textContent = `${player.name}: ${player.score} points · ${player.words.length} words`
            const words = document.createElement('div')
            words.className = 'review-words'
            if (!player.words.length) words.textContent = 'No saved words.'
            for (const entry of player.words.slice().sort((a, b) => a.word.localeCompare(b.word))) {
                const word = document.createElement(player.id === this.user.id ? 'button' : 'span')
                word.textContent = `${entry.word} (${entry.points})`
                word.classList.toggle('excluded', Boolean(entry.excluded))
                if (player.id === this.user.id) {
                    word.type = 'button'
                    word.setAttribute('aria-pressed', String(Boolean(entry.excluded)))
                    word.setAttribute('aria-label', `${entry.excluded ? 'Restore' : 'Exclude'} ${entry.word} (${entry.points} points)`)
                    word.disabled = !this.connected
                    word.onclick = () => this.connection.send('reviewWord', { roundId: round.id, word: entry.word, excluded: !entry.excluded })
                }
                words.append(word)
            }
            item.append(summary, words)
            return item
        }))
    }
}

window.app = new App()
