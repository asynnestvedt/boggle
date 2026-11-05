class VoiceCapture extends AudioWorkletProcessor {
    constructor() {
        super()
        this.samples = new Int16Array(1600)
        this.index = 0
        this.phase = 0
    }
    process(inputs) {
        const input = inputs[0]?.[0]
        if (!input) return true
        for (const sample of input) {
            this.phase += 16000
            if (this.phase >= sampleRate) {
                this.phase -= sampleRate
                this.samples[this.index++] = Math.max(-1, Math.min(1, sample)) * 32767
                if (this.index === this.samples.length) {
                    this.port.postMessage(this.samples.buffer, [this.samples.buffer])
                    this.samples = new Int16Array(1600)
                    this.index = 0
                }
            }
        }
        return true
    }
}
registerProcessor('voice-capture', VoiceCapture)
