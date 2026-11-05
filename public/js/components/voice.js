const $ = selector => document.querySelector(selector)

export class VoiceChat {
    constructor(connection) {
        this.connection = connection
        this.active = false
        this.generation = 0
        this.queues = new Map()
        this.audio = new Audio()
        this.audio.autoplay = true
        this.audio.playsInline = true
        connection.onAudio = data => this.receive(data)
        connection.onVoicePresence = users => this.presence(users)
        $('#voice-toggle').onclick = () => this.show($('#voice-panel').hidden)
        $('#voice-close').onclick = () => this.show(false)
        $('#voice-join').onclick = () => this.join()
        $('#voice-leave').onclick = () => this.stop('Voice chat is off.')
        $('#voice-mute').onchange = () => {
            if (this.stream) this.stream.getAudioTracks().forEach(track => { track.enabled = !$('#voice-mute').checked })
            this.render()
        }
        $('#voice-deafen').onchange = () => this.setVolume()
        $('#voice-volume').oninput = () => this.setVolume()
        $('#voice-input').onchange = () => this.replaceInput()
        $('#voice-echo').onchange = () => this.replaceInput()
        $('#voice-noise').onchange = () => this.replaceInput()
        $('#voice-output').onchange = async () => {
            try { await this.audio.setSinkId($('#voice-output').value) }
            catch { this.status('Could not select that speaker. Check browser permissions and try again.') }
        }
        navigator.mediaDevices?.addEventListener?.('devicechange', () => this.devices())
        $('#voice-output-note').hidden = typeof this.audio.setSinkId === 'function'
        $('#voice-output').disabled = typeof this.audio.setSinkId !== 'function'
    }
    status(message) { $('#voice-status').textContent = message }
    show(open) {
        $('#voice-panel').hidden = !open
        $('#voice-toggle').setAttribute('aria-expanded', String(open))
        if (open) this.devices()
    }
    async devices() {
        if (!navigator.mediaDevices?.enumerateDevices) return
        try {
            const devices = await navigator.mediaDevices.enumerateDevices()
            for (const [selector, kind] of [['#voice-input', 'audioinput'], ['#voice-output', 'audiooutput']]) {
                const select = $(selector)
                const value = select.value
                const options = [new Option('System default', '')]
                for (const device of devices.filter(item => item.kind === kind && item.deviceId && item.deviceId !== 'default')) {
                    options.push(new Option(device.label || `${kind === 'audioinput' ? 'Microphone' : 'Speaker'} ${options.length}`, device.deviceId))
                }
                select.replaceChildren(...options)
                if (options.some(option => option.value === value)) select.value = value
            }
        } catch { /* Device lists can be unavailable until permission is granted. */ }
    }
    constraints() {
        return { audio: {
            ...($('#voice-input').value ? { deviceId: { exact: $('#voice-input').value } } : {}),
            echoCancellation: $('#voice-echo').checked, noiseSuppression: $('#voice-noise').checked,
            autoGainControl: true, channelCount: 1
        } }
    }
    async join() {
        if (this.active || this.joining) return
        if (!this.connection.socket || this.connection.socket.readyState !== WebSocket.OPEN) return this.status('Join a room before joining voice.')
        if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext || !window.AudioWorkletNode) return this.status('Voice requires a supported browser on HTTPS or localhost.')
        const generation = ++this.generation
        this.joining = true
        $('#voice-join').disabled = true
        this.status('Requesting microphone access…')
        let stream
        try {
            stream = await navigator.mediaDevices.getUserMedia(this.constraints())
            if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return }
            this.stream = stream
            this.context = new AudioContext()
            await this.context.audioWorklet.addModule('/js/lib/voice-worklet.js')
            if (generation !== this.generation) return
            this.output = this.context.createMediaStreamDestination()
            this.audio.srcObject = this.output.stream
            this.capture = new AudioWorkletNode(this.context, 'voice-capture')
            this.silent = this.context.createGain()
            this.silent.gain.value = 0
            this.capture.connect(this.silent).connect(this.context.destination)
            this.capture.port.onmessage = event => {
                if (this.active && !$('#voice-mute').checked) this.connection.sendAudio(event.data)
            }
            this.connectInput(stream)
            this.setVolume()
            await this.context.resume()
            await this.audio.play()
            if (generation !== this.generation) return
            if (!this.connection.send('voiceJoin', {})) throw new Error('Room disconnected. Try joining again.')
            this.active = true
            this.joining = false
            this.status('Connected to room voice.')
            this.render()
            this.devices()
        } catch (error) {
            if (generation !== this.generation) { stream?.getTracks().forEach(track => track.stop()); return }
            this.stop(error.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow access in your browser and try again.' : `Could not join voice: ${error.message}`)
        } finally { $('#voice-join').disabled = false }
    }
    connectInput(stream) {
        this.source?.disconnect()
        this.source = this.context.createMediaStreamSource(stream)
        this.source.connect(this.capture)
        stream.getAudioTracks().forEach(track => {
            track.enabled = !$('#voice-mute').checked
            track.onended = () => { if (this.stream === stream) this.stop('Microphone disconnected. Join voice again.') }
        })
    }
    async replaceInput() {
        if (!this.active) return
        const generation = this.generation
        try {
            const stream = await navigator.mediaDevices.getUserMedia(this.constraints())
            if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return }
            const old = this.stream
            this.stream = stream
            this.connectInput(stream)
            old.getTracks().forEach(track => track.stop())
            this.devices()
        } catch { this.status('Could not use that microphone. The previous microphone remains active.') }
    }
    setVolume() { this.audio.volume = $('#voice-deafen').checked ? 0 : Number($('#voice-volume').value) / 100 }
    presence(users) {
        if (!this.active && !this.joining) return
        $('#voice-members').textContent = users.length ? `In voice: ${users.map(user => user.name).join(', ')}` : 'No one else is in voice.'
        const ids = new Set(users.map(user => user.id))
        for (const id of this.queues.keys()) if (!ids.has(id)) this.queues.delete(id)
    }
    receive(data) {
        if (!this.active || !this.context || data.byteLength !== 3236) return
        const id = new TextDecoder().decode(data.slice(0, 36))
        const samples = new Int16Array(data.slice(36))
        const buffer = this.context.createBuffer(1, samples.length, 16000)
        const output = buffer.getChannelData(0)
        for (let i = 0; i < samples.length; i++) output[i] = samples[i] / 32768
        const node = this.context.createBufferSource()
        node.buffer = buffer
        node.connect(this.output)
        const now = this.context.currentTime
        const queued = this.queues.get(id) || 0
        const start = queued > now + .5 ? now + .03 : Math.max(now + .03, queued)
        this.queues.set(id, start + buffer.duration)
        node.start(start)
    }
    render() {
        $('#voice-join').hidden = this.active
        $('#voice-leave').hidden = !this.active
        $('#voice-dot').hidden = !this.active
        $('#voice-dot').classList.toggle('online', this.active && !$('#voice-mute').checked)
        $('#voice-toggle .material-icons').textContent = this.active && !$('#voice-mute').checked ? 'mic' : 'mic_off'
    }
    stop(message = 'Voice chat disconnected. Join again when ready.') {
        ++this.generation
        if (this.active) this.connection.send('voiceLeave', {})
        this.active = false
        this.joining = false
        this.stream?.getTracks().forEach(track => track.stop())
        this.stream = null
        this.source?.disconnect()
        this.capture?.disconnect()
        this.silent?.disconnect()
        this.context?.close().catch(() => {})
        this.context = this.capture = this.source = this.silent = this.output = null
        this.audio.pause()
        this.audio.srcObject = null
        this.queues.clear()
        $('#voice-members').textContent = 'Only people who join voice can hear each other.'
        this.status(message)
        this.render()
    }
}
