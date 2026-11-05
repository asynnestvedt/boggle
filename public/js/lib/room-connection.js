import { api } from './http.js'

export class RoomConnection {
    constructor({ onState, onStatus, onError, onExpired, onLeft }) {
        Object.assign(this, { onState, onStatus, onError, onExpired, onLeft })
        this.socket = null
        this.generation = 0
        this.retry = 0
        this.syncTimer = null
    }
    async join(roomId) {
        this.stop()
        const generation = this.generation
        this.onStatus('Connecting…', false)
        try {
            if (!roomId) roomId = (await api('/api/rooms', {})).roomId
            else await api(`/api/rooms/${encodeURIComponent(roomId)}`)
            if (generation !== this.generation) return
            this.roomId = roomId
            const url = new URL(location.href)
            url.searchParams.set('room', roomId)
            history.replaceState(null, '', url)
            this.connect(generation)
        } catch (error) {
            if (generation !== this.generation) return
            this.onStatus('Room unavailable', false)
            if (error.status === 401) this.onExpired()
            else this.onError(error.message)
        }
    }
    connect(generation) {
        if (generation !== this.generation) return
        const roomId = this.roomId
        this.onStatus('Connecting…', false)
        const url = new URL('/api/rooms/socket', location.origin)
        url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
        url.searchParams.set('room', roomId)
        const socket = new WebSocket(url)
        socket.binaryType = 'arraybuffer'
        this.socket = socket
        socket.onmessage = event => {
            if (generation !== this.generation || socket !== this.socket) return
            if (event.data instanceof ArrayBuffer) { this.onAudio?.(event.data); return }
            const message = JSON.parse(event.data)
            if (message.action === 'state') {
                this.retry = 0
                this.onStatus('Connected', true)
                this.onState(message.payload)
            } else if (message.action === 'voicePresence') this.onVoicePresence?.(message.payload.users)
            else if (message.action === 'error') this.onError(message.payload.message)
        }
        socket.onopen = () => {
            if (generation !== this.generation) { socket.close(); return }
            clearInterval(this.syncTimer)
            this.syncTimer = setInterval(() => this.send('sync', {}), 10000)
        }
        socket.onclose = async event => {
            if (generation !== this.generation || socket !== this.socket) return
            clearInterval(this.syncTimer)
            this.socket = null
            this.onStatus('Disconnected. Reconnecting…', false)
            if (event.code === 4001) return this.onExpired()
            if (event.code === 4002) return this.onLeft()
            // Browsers hide the HTTP status of a rejected upgrade. Check the session separately.
            try {
                const { user } = await api('/api/session')
                if (generation !== this.generation) return
                if (!user) return this.onExpired()
                await api(`/api/rooms/${encodeURIComponent(roomId)}`)
            } catch (error) {
                if (generation !== this.generation) return
                if (error.status === 404) {
                    this.onStatus('Room unavailable', false)
                    return this.onError(error.message)
                }
            }
            if (generation !== this.generation) return
            if (++this.retry === 8) this.onError('Connection is still unavailable. Reconnecting automatically…')
            const delay = Math.min(500 * 2 ** Math.min(this.retry, 6), 10000) * (.8 + Math.random() * .4)
            this.reconnectTimer = setTimeout(() => this.connect(generation), delay)
        }
    }
    send(action, payload) {
        if (this.socket?.readyState !== WebSocket.OPEN) return false
        this.socket.send(JSON.stringify({ action, payload }))
        return true
    }
    sendAudio(frame) {
        if (this.socket?.readyState !== WebSocket.OPEN || this.socket.bufferedAmount > 128 * 1024) return false
        this.socket.send(frame)
        return true
    }
    stop() {
        this.generation++
        clearTimeout(this.reconnectTimer)
        clearInterval(this.syncTimer)
        const socket = this.socket
        this.socket = null
        socket?.close()
        this.retry = 0
    }
}
