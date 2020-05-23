'use strict'

import { ApiGet, ApiPost } from './lib/api.js'
import { Timer, ProgressBar } from './progress.js'

/**
 * App class organizes and controls components and data and high level UI state.
 */
export default class App {
    constructor() {

        // window.addEventListener('hashchange', this.handleRoute.bind(this))

        this.data = {
            /**
             * els contains refs to UI nodes not managed by other classes 
             */
            els: {
                controls: document.getElementById('bggl-ctr-tray'),
                replayBtn: document.getElementById('bggl-replay'),
                solution: document.getElementById('bggl-solution'),
                header: document.querySelector('.header-container'),
                footer: document.querySelector('.footer-container'),
                users: document.getElementById('bggl-people'),
                rightpullout: document.querySelector('x-rightpullout')
            },
            /**
             * boggle board initialized during game start
             */
            board: null,
            /**
             * SETTINGS
             */
            settings: new Settings(function () {
                this.requestgame()
            }.bind(this)),
            roomSettings: document.querySelector('X-RoomSettings'),
            /**
             * GAME SOUNDS
             */
            sounds: {
                shake: new Audio('assets/dice-shake.mp3'),
                countdown: new Audio('assets/jeopardy-countdown.mp3')
            },
            /**
             * SETTINGS
             */
            timer: new Timer({
                bars: [
                    document.getElementById('pbarx'),
                    document.getElementById('pbarxinv'),
                    document.getElementById('pbary'),
                    document.getElementById('pbaryinv'),
                ],
                orientations: [
                    ProgressBar.orient.X,
                    ProgressBar.orient.XINV,
                    ProgressBar.orient.Y,
                    ProgressBar.orient.YINV,
                ]
            })
        }

        /**
         * Set bindings
         */
        this.data.screenMgr = new ScreenManager(document.getElementById('bggl-fullscr'), {
            onfull: function () {
                this.data.els.footer.style.display = 'none'
            }.bind(this),
            onnormal: function () {
                this.data.els.footer.style.display = 'block'
            }
        })

        /**
         * Set bindings
         */
        this.init()
    }

    init() {
        this.data.els.replayBtn.addEventListener('click', function (evt) {
            evt.preventDefault()
            if (this.data.board) {
                this.data.board.clear()
                this.data.board.hide()
            }
            this.data.settings.show()
            this.data.timer.stop()
        }.bind(this))

        this.data.els.users.onclick = () => {
            this.data.roomSettings.show()
        }
    }



    /**
     * requests solution from server
     */
    requestgame() {
        /** ask server for dice */
        new ApiGet(`/api/board/${this.data.settings.dimensions}?orientation=${this.data.settings.orientation}`, function (response) {
            if (response) {
                if(! this.data.roomSettings.sendMessage('startgame', {                    
                    dice: response.data,
                    duration: this.data.settings.duration,
                    text: `${this.name} started a new multiplayer Woggle game`,

                }) ) {
                    /** single player game */
                    this.startgame({dice: response.data, duration: this.data.settings.duration})
                }
                
            }
        }.bind(this))
    }


    startgame(data) {
        document.querySelector('x-rightpullout').hide()
        this.data.settings.hide()
        /** create new board - assume square */
        const dimen = Math.sqrt(data.dice.length)
        this.data.board = new BoggleBoard('board', dimen, dimen)
        this.data.board.show()
        /** clear and hide last games answers */
        this.data.els.rightpullout.clear()
        this.data.els.rightpullout.clear()
        /** render board with dice */
        this.data.board.render(data.dice)
        /** play dice shake sound */
        this.data.sounds.shake.play()
        /** start the timer */
        this.data.timer.stop()
        this.data.timer.start({
            duration: data.duration,
            interval: 0.1,
            done: function () {
                this.gameover()
            }.bind(this)
        })

        try {
            navigator.wakeLock.request('display')
        } catch(e) {
            console.log('could not disable display sleep')
        }
        

        /** add midway timer for countdown music */
        this.data.timer.at(data.duration - 31, function () {
            this.data.sounds.countdown.play()
        }.bind(this))
    }

    /**
     * requests solution from server
     */
    reqSolution() {
        let diceStr = this.data.board.dice.map(function (die) {
            return die.selected
        }).join('')
        new ApiPost('/api/solve', { letters: diceStr }, function (response) {
            if (response) {
                this.data.solution = JSON.parse(response.data)
                console.log(this.data.solution)
            }
        }.bind(this))
    }

    /**
     * called after timer runs down
     */
    gameover() {
        try {
            navigator.wakeLock.release('display')
        } catch(e) {
            console.log('could not re-enable display sleep')
        }

        const savedWords = this.data.board.wordlist
        console.log(savedWords)
        this.data.board.disable()

        if (savedWords) {
            document.querySelector('x-rightpullout').show(savedWords)
        }
        
    }

}


class Settings {
    constructor(callback) {
        this.els = {
            root: document.getElementById('settings'),
            inputs: document.querySelectorAll('#settings input'),
            button: document.querySelector('#settings button')
        }

        /** defaults */
        this.players = 2
        this.dimensions = '5x5'
        this.duration = 180
        this.orientation = 'random'
        this.callback = callback || this.defaultHandler

        /** bind events */
        this.init()
    }

    defaultHandler(evt) {
        let action = '', value = ''
        try {
            action = evt.srcElement.getAttribute('data-action')
            value = evt.srcElement.value
        } catch (e) {
            console.log(e)
        }

        switch (action) {
            case 'players':
                this.players = parseInt(value)
                break
            case 'boardsize':
                this.dimensions = value
                break
            case 'duration':
                this.duration = parseInt(value)
                break
            case 'orientation':
                this.orientation = value
        }

        console.log(evt)
        return false
    }

    hide() {
        this.els.root.style.display = 'none'
    }

    show() {
        this.els.root.style.display = 'block'
    }

    init() {
        for (let key in this.els.inputs) {
            if (this.els.inputs.hasOwnProperty(key)) {
                this.els.inputs[key].addEventListener('change', this.defaultHandler.bind(this))
            }
        }

        this.els.button.addEventListener('click', function (evt) {
            evt.preventDefault()
            this.hide()
            this.callback()
        }.bind(this))
    }
}

class BoggleBoard {
    constructor(el, width, height) {
        this.el = document.getElementById(el)
        this.saveWordButton = document.getElementById('bggl-save-word')
        this.width = width || 4
        this.height = height || 4
        this.dice = []
        this.lastSelectedDie = null
        this.selectedWord = []
        this.selectedPositions = []
        this._wordlist = new Set()
        this.disabled = false

        this.saveWordButton.onclick = this.saveWord.bind(this)
    }

    get wordlist() {
        return Array.from(this._wordlist).sort()
    }

    disable(d) {
        if (d === undefined) {
            d = true
        }
        this.disabled = d
        if (this.disabled) {
            this.clearSelection()
        }
    }

    hide() {
        this.el.style.display = 'none'
    }

    show() {
        this.el.style.display = 'block'
    }

    clear() {
        this.el.innerHTML = ''
    }

    render(dice) {
        this.dice = dice
        this.el.textContent = ''

        if (this.width === 4 && this.height === 4) {
            this.el.classList.remove('five-by-five')
            this.el.classList.add('four-by-four')
        } else {
            this.el.classList.remove('four-by-four')
            this.el.classList.add('five-by-five')
        }

        for (let i = 0; i < dice.length; ++i) {
            let div = document.createElement('div')
            let span = document.createElement('span')

            span.innerText = dice[i].selected
            if (dice[i].selected === 'M' || dice[i].selected === 'W') {
                span.setAttribute('class', 'underline letters r' + dice[i].orientation)
            } else {
                span.setAttribute('class', 'letters r' + dice[i].orientation)
            }

            div.setAttribute('class', 'die')
            div.setAttribute('data-letter', dice[i].selected)
            div.setAttribute('data-pos', i+1)
            div.appendChild(span)

            div.onclick = this.dieClick.bind(this)
            this.el.appendChild(div)
        }
    }

    dieClick(ev) {
        if (this.disabled) {
            return
        }

        const el = ev.target.tagName === 'SPAN' ? ev.target.parentNode : ev.target
        if (el.classList.contains('selected')) {
            el.classList.remove('selected')
        } else {
            el.classList.add('selected')
        }

        console.log(el.dataset.pos)

        if( this.selectedPositions.includes(parseInt(el.dataset.pos)) ) {
            this.clearSelection()
        } else if (this.lastSelectedDie === null || allowableMove(this.width, this.lastSelectedDie, el.dataset.pos)) {
            this.doMove(el)
        } else {
            this.clearSelection()
        }

        this.renderSaveWordButton()
    }

    renderSaveWordButton() {
        if  (this.selectedWord.length >= 3) {
            this.saveWordButton.classList.remove('hidden')
        } else if (! this.saveWordButton.classList.contains('hidden')) {
            this.saveWordButton.classList.add('hidden')
        }
    }

    doMove(el) {
        this.selectedWord.push(el.dataset.letter)
        this.selectedPositions.push(parseInt(el.dataset.pos))
        this.lastSelectedDie = el.dataset.pos
    }

    clearSelection() {
        this.el.querySelectorAll('div.die').forEach(e => e.classList.remove('selected'))
        this.selectedWord = []
        this.selectedPositions = []
        this.lastSelectedDie = null
        this.renderSaveWordButton()
    }

    saveWord(ev) {
        ev.preventDefault()
        this._wordlist.add(this.selectedWord.join(''))
        this.clearSelection()
    }

}


function allowableMove(width, currentPos, nextPos) {
    const validMap = {
        4: {
            1: [2,5,6],
            2: [1,3,5,6,7],
            3: [2,4,6,7,8],
            4: [3,7,8],
            5: [1,2,6,9,10],
            6: [1,2,3,5,7,9,10,11],
            7: [2,3,4,6,8,10,11,12],
            8: [3,4,7,11,12],
            9: [5,6,10,13,14],
            10: [5,6,7,9,11,13,14,15],
            11: [6,7,8,10,12,14,15,16],
            12: [7,8,11,15,16],
            13: [9,10,14],
            14: [9,10,11,13,15],
            15: [10,11,12,14,16],
            16: [11,12,15]
        },

        5: {
            1: [2,6,7],
            2: [1,3,6,7,8],
            3: [2,4,7,8,9],
            4: [3,5,8,9,10],
            5: [4,9,10],
            6: [1,2,7,11,12],
            7: [1,2,3,6,8,11,12,13],
            8: [2,3,4,7,9,12,13,14],
            9: [3,4,5,8,10,13,14,15],
            10: [4,5,9,14,15],
            11: [6,7,12,16,17],
            12: [6,7,8,11,13,16,17,18],
            13: [7,8,9,12,14,17,18,19],
            14: [8,9,10,13,15,18,19,20],
            15: [9,10,14,19,20],
            16: [11,12,17,21,22],
            17: [11,12,13,16,18,21,22,23],
            18: [12,13,14,17,19,22,23,24],
            19: [13,14,15,18,20,23,24,25],
            20: [14,15,19,24,25],
            21: [16,17,22],
            22: [16,17,18,21,23],
            23: [17,18,19,22,24],
            24: [18,19,20,23,25],
            25: [19,20,24],
        }
    }

    return validMap[parseInt(width)][parseInt(currentPos)].includes(parseInt(nextPos))
}

class ScreenManager {
    constructor(el, options) {
        if (!el) return false

        options = options || {}

        this.el = el
        this.cbs = {
            onfull: options.onfull || function () { },
            onnormal: options.onnormal || function () { }
        }
        this.init()
        if (options.doToggle) {
            this.toggleFullScreen()
        }
    }

    init() {
        this.bindEsc()
        this.bindClick()
        this.render()
    }

    bindClick() {
        this.el.onclick = function () {
            this.toggleFullScreen()
        }.bind(this)
    }

    bindEsc() {
        document.addEventListener('keydown', function (e) {
            if (e.keyCode == 27) {
                this.exitFS()
            }
        }.bind(this), false)
    }

    toggleFullScreen() {
        if ((document.fullScreenElement && document.fullScreenElement !== null) ||    // alternative standard method
            (!document.mozFullScreen && !document.webkitIsFullScreen)) {               // current working methods
            if (document.documentElement.requestFullScreen) {
                document.documentElement.requestFullScreen()
            } else if (document.documentElement.mozRequestFullScreen) {
                document.documentElement.mozRequestFullScreen()
            } else if (document.documentElement.webkitRequestFullScreen) {
                document.documentElement.webkitRequestFullScreen(Element.ALLOW_KEYBOARD_INPUT)
            }
            this.render(true)
            this.cbs.onfull()
        } else {
            this.exitFS()
            this.render()
            this.cbs.onnormal()
        }
    }

    exitFS() {
        if (document.cancelFullScreen) {
            document.cancelFullScreen()
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen()
        } else if (document.webkitCancelFullScreen) {
            document.webkitCancelFullScreen()
        }
    }

    render(fullBool) {
        if (!fullBool) {
            this.el.innerHTML = '<i class="material-icons">fullscreen</i>'
        } else {
            this.el.innerHTML = '<i class="material-icons">fullscreen_exit</i>'
        }
    }
}


/* id generation for templating */
window.idcount = 0
window.makeid = (prefix) => `${prefix || 'gen'}${window.idcount++}`


export class ShadowComponent extends HTMLElement {
    constructor(id) {
        super()
        const name = this.constructor.name.toLowerCase()
        this.id = id || window.makeid(name)
        this.attachShadow({ mode: 'open' })
        this.__template = document.createElement('template')
        this.__template.innerHTML = this.__proto__.constructor.template()
        this.shadowRoot.appendChild(this.__template.content.cloneNode(true))
        this.__cache = null
        this.__initialized = false
    }
}

export class Component extends HTMLElement {
    constructor(id) {
        super()
        const name = this.constructor.name.toLowerCase()
        this.id = id || window.makeid(name)
        this.__template = document.createElement('template')
        /** access static method template */
        this.__template.innerHTML = this.__proto__.constructor.template()
        this.appendChild(this.__template.content.cloneNode(true))
        this.__cache = null
        this.__initialized = false
    }
}


window.app = new App()
