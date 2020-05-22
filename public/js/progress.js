/**
 * timer class acts as a timer and can update progress bars.
 */
export class Timer {
    /**
     * Accepts optional object with elements and orientations having format e.g.{bars:[], orientations: []}
     * @param {object} data - (optional) includes elements and orientations with format e.g.{bars:[], orientations: []}
     */
    constructor(data) {
        this.bars = []
        for (let i = 0; i < data.bars.length; ++i) {
            this.bars.push(new ProgressBar(data.bars[i], data.orientations[i]))
        }

        this.renderTimer = null
        this.endTimer = null
        this.progress = 0
        this.doat = [] /** callbacks to be executed at a specific time */
    }

    /**
     * start the timer
     * @param {object} e.g. 
     *      {number} duration - duration in seconds
     *      {number} interval - how frequently to update progress in seconds
     *      {callback} done - called when complete}
     */
    start(options) {
        options = options || {}
        let interval = options.interval || 0.5

        this.renderTimer = null

        /** show progress bars if any */
        for (let i = 0; i < this.bars.length; ++i) {
            this.bars[i].show()
        }

        this.renderTimer = setInterval(function () {
            this.progress += interval
            if (this.doat.length > 0) {
                this.at()
            }
            /** update progress bars if any */
            for (let i = 0; i < this.bars.length; ++i) {
                this.bars[i].render(100 - this.progress / options.duration * 100)
            }
        }.bind(this), interval * 1000)

        this.endTimer = setTimeout(function () {
            this.stop()
            if (options.done) {
                options.done()
            }
        }.bind(this), options.duration * 1000)
    }

    /**
     * execute a callback at/near a specified time in countdown
     * @param {number} (optional) seconds
     * @param {callback} (optional) callback 
     */
    at(seconds, callback) {
        if (seconds && callback)
            this.doat.push({ at: seconds, do: callback })
        else {
            for (let i = this.doat.length; i > 0; --i) {
                let doAt = this.doat[i - 1]
                if (this.progress >= doAt.at) {
                    doAt.do()
                    this.doat.pop() /** discard after executing */
                }
            }
        }
    }

    stop() {
        /** stop updating progress bars */
        if (this.renderTimer) {
            clearInterval(this.renderTimer)
        }
        if (this.endTimer) {
            clearTimeout(this.endTimer)
        }
        this.doat = []
        /** hide progress bars */
        for (let i = 0; i < this.bars.length; ++i) {
            this.bars[i].hide()
        }
        /** reset progress */
        this.progress = 0
    }
}

/**
 * Create vertical or horizontal progress bars
 * to style the bar use selector .progress-inner
 */
export class ProgressBar {
    /**
     * 
     * @param {object} el - block element to hold progress bar
     * @param {string} orient - see ProgressBar.orient for "enum" values
     * @param {number} min
     * @param {number} max 
     * @param {number} progress - a number in between min and max
     */
    constructor(el, orient, min, max, progress) {
        this.el = el
        this.orientation = orient || ProgressBar.orient.X
        this.min = min || 0
        this.max = max || 100

        let div = document.createElement('div')
        div.setAttribute('class', 'progress-inner')
        this.el.appendChild(div)
        this.bar = div

        this.init()

        if (progress) {
            this.render(progress)
        }
    }

    static get orient() {
        return {
            X: 'x', /** left to right */
            XINV: 'xinv', /** right to left */
            Y: 'y', /** bottom to top */
            YINV: 'yinv' /** top to bottom */
        }
    }

    init() {
        this.bar.style.position = 'absolute'

        switch (this.orientation) {
            case ProgressBar.orient.X:
                this.bar.style.width = '0.1%'
                this.bar.style.height = '100%'
                this.bar.style.top = '0px'
                this.bar.style.left = '0px'
                break
            case ProgressBar.orient.XINV:
                this.bar.style.width = '0.1%'
                this.bar.style.height = '100%'
                this.bar.style.top = '0px'
                this.bar.style.right = '0px'
                break
            case ProgressBar.orient.Y:
                this.bar.style.width = '100%'
                this.bar.style.height = '0.1%'
                this.bar.style.bottom = '0px'
                this.bar.style.left = '0px'
                break
            case ProgressBar.orient.YINV:
                this.bar.style.width = '100%'
                this.bar.style.height = '0.1%'
                this.bar.style.top = '0px'
                this.bar.style.left = '0px'
                break
        }
    }

    hide() {
        this.el.style.display = 'none'
    }

    show() {
        this.el.style.display = 'block'
    }

    render(progress) {
        progress = progress || 0
        if (progress > this.max) {
            progress = this.max
        } else if (progress < this.min) {
            progress = this.min
        }

        let pct = (progress / (this.max - this.min)) * 100

        switch (this.orientation) {
            case ProgressBar.orient.X:
            case ProgressBar.orient.XINV:
                this.bar.style.width = pct.toString() + '%'
                break
            case ProgressBar.orient.Y:
                this.bar.style.height = pct.toString() + '%'
                break
            case ProgressBar.orient.YINV:
                this.bar.style.height = pct.toString() + '%'
                this.bar.style.top = '0px'
                break
        }
    }
}