/**
 * timer class acts as a timer and can update progress bars.
 */
class Timer {
    constructor(data) {
        this.bars=[];
        for (let i=0; i<data.bars.length; ++i) {
            this.bars.push(new ProgressBar(data.bars[i], data.orientations[i]));
        }

        this.renderTimer = null;
        this.progress = 0;
    }
    /**
     * 
     * @param {number} duration - duration in seconds
     * @param {number} interval - how frequently to update progress in seconds
     * @param {callback} callback - called when complete
     */
    start(duration, interval, callback) {
        interval = interval || 0.5;

        this.renderTimer = null;

        if (interval) {
            for(let i=0; i<this.bars.length; ++i) {
                this.bars[i].show();
            }
            this.renderTimer = setInterval(function() {
                this.progress += interval;
                for(let i=0; i<this.bars.length; ++i) {
                    this.bars[i].render(100 - this.progress / duration * 100);
                }
            }.bind(this), interval*1000);
        }

        setTimeout(function() {
            this.stop();
            if (callback) {
                callback();
            }
        }.bind(this), duration*1000);
    }

    stop() {
        /** stop updating progress bars */
        if(this.renderTimer) {
            clearInterval(this.renderTimer)
        }
        /** hide progress bars */
        for(let i=0; i<this.bars.length; ++i) {
            this.bars[i].hide();
        }
        /** reset progress */
        this.progress = 0;
    }
}

class ProgressBar {
    constructor(el, orient, min, max, progress) {
        this.el = el;
        this.orientation = orient || ProgressBar.orient.X;
        this.min = min || 0;
        this.max = max || 100;

        let div = document.createElement('div');
        div.setAttribute('class','progress-inner');
        this.el.appendChild(div);
        this.bar = div;

        this.init();

        if(progress) {
            render(progress);
        }
    }

    static get orient() {
        return {
            X:'x', /** left to right */
            XINV:'xinv', /** right to left */
            Y:'y', /** bottom to top */
            YINV:'yinv' /** top to bottom */
        }
    }

    init() {
        this.bar.style.position = 'absolute';

        switch(this.orientation) {
            case ProgressBar.orient.X:
                this.bar.style.width = '0.1%';
                this.bar.style.height = '100%';
                this.bar.style.top = '0px';
                this.bar.style.left = '0px';
                break;
            case ProgressBar.orient.XINV:
                this.bar.style.width = '0.1%';
                this.bar.style.height = '100%';
                this.bar.style.top = '0px';
                this.bar.style.right = '0px';
                break;
            case ProgressBar.orient.Y:
                this.bar.style.width = '100%';
                this.bar.style.height = '0.1%';
                this.bar.style.bottom = '0px';
                this.bar.style.left = '0px';
                break;
            case ProgressBar.orient.YINV:
                this.bar.style.width = '100%';
                this.bar.style.height = '0.1%';
                this.bar.style.top = '0px';
                this.bar.style.left = '0px';
                break;
        }
    }

    hide() {
        this.el.style.display = 'none';
    }

    show() {
        this.el.style.display = 'block';
    }

    render(progress) {
        progress = progress || 0;
        if (progress > this.max) {
            progress = this.max;
        } else if (progress < this.min) {
            progress = this.min;
        }

        let pct = (progress / (this.max - this.min)) * 100;

        switch(this.orientation) {
            case ProgressBar.orient.X:
            case ProgressBar.orient.XINV:
                this.bar.style.width = pct.toString() + '%';
                break;
            case ProgressBar.orient.Y:
                this.bar.style.height = pct.toString() + '%';
                break;
            case ProgressBar.orient.YINV:
                this.bar.style.height = pct.toString() + '%';
                this.bar.style.top = '0px';
                break;
        }
    }
}