'use strict'

import { default as Util } from './lib/util.js'
import { ApiGet, ApiPost } from './lib/api.js'

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
                users: document.getElementById('bggl-people')
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
                this.data.board.hide()
            }
            this.data.els.solution.style.display = 'none'
            this.data.settings.show()
            this.data.timer.stop()
        }.bind(this))

        this.data.els.users.onclick = () => {
            this.data.roomSettings.show()
        }
    }


    wsJoin() {
        this.ws.send(`ROOM|${this.data.room}|JOIN|${this.data.user}`)
    }

    wsMessage(evt) {
        let received_msg = evt.data.split('|')
        switch (received_msg[0]) {
            case 'COUNT':
                document.getElementById('bggl-people').querySelector('span').innerHTML = received_msg[1]
                break
            case 'START':
                this.startgame(JSON.parse(received_msg[1]))
                break
        }
    }

    wsClose() {
        alert('Connection is closed...')
    }


    /**
     * requests solution from server
     */
    requestgame() {
        /** create new board - assume square */
        let dimen = parseInt(this.data.settings.dimensions.split('x')[0])
        this.data.board = new BoggleBoard('board', dimen, dimen)
        this.data.board.show()

        /**  */
        this.data.els.solution.innerHTML = ''

        const room = Util.getParameterByName('room') || 'none'

        /** ask server for dice */
        new ApiGet(`/api/board/${this.data.settings.dimensions}?orientation=${this.data.settings.orientation}&room=${room}`, function (response) {
            if (response) {
                this.startgame(response.data)
            }
        }.bind(this))
    }


    startgame(data) {
        /** render board with dice */
        this.data.board.render(data)
        /** play dice shake sound */
        this.data.sounds.shake.play()
        /** fire request for solution to server */
        this.reqSolution()
        /** start the timer */
        this.data.timer.start({
            duration: this.data.settings.duration,
            interval: 0.1,
            done: function () {
                this.gameover()
            }.bind(this)
        })
        /** add midway timer for countdown music */
        this.data.timer.at(this.data.settings.duration - 31, function () {
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
        /** sort solution words */
        let sortedWords = this.data.solution.Words.sort(function (a, b) { return (a.Word < b.Word) ? -1 : (a.Word > b.Word) ? 1 : 0 })

        /** display EOGame word list. yuck!... change to templating or element.create  */
        let htmlStr = ''
        for (let i = 0; i < this.data.solution.Words.length; ++i) {
            let word = this.data.solution.Words[i]
            htmlStr += '<div><b>' + word.Word + '</b> &nbsp;' + word.Definition + '</div>'
        }
        this.data.els.solution.innerHTML = htmlStr
        this.data.board.hide()
        this.data.els.solution.style.display = 'block'
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
        this.width = width || 4
        this.height = height || 4
        this.dice = []
    }

    hide() {
        this.el.style.display = 'none'
    }

    show() {
        this.el.style.display = 'block'
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
            div.appendChild(span)

            this.el.appendChild(div)
        }
    }
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


let app = new App()

