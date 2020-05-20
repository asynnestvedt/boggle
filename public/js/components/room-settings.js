import { default as Util } from '../lib/util.js'
import { Component } from '../main.js'

export default class RoomSettings extends Component {
    constructor() {
        super()
        this.onRoomChangeCallback = this.defaultHandler
        this.els = {
            roomIdText: this.querySelector('#roomid'),
            username: this.querySelector('#bggl-username'),
            doneButton: this.querySelector('#bggl-room-done'),
            closeButton: this.querySelector('div.overlay span.close')
        }
        this.ws = null
        this.init()
    }

    connectedCallback() {
    }

    disconnectedCallback() {
    }

    attributeChangedCallback(attrName, oldVal, newVal) {
    }

    init() {
        if (window.location.search.indexOf('room=') === -1) {
            window.location.href = window.location.href + '?room=' + Util.makeRoomID()
        }

        this.els.roomIdText.value = window.location.href

        document.getElementById('bggl-copy-room').onclick = (ev) => {
            ev.preventDefault()
            this.els.roomIdText.select()
            this.els.roomIdText.setSelectionRange(0, 99999)
            document.execCommand('copy')
        }

        let userid = Util.getCookie('bggl-userid')
        if (! userid) {
            userid = [...Array(28)].map(() => (~~(Math.random() * 36)).toString(36)).join('')
            Util.setCookie('bggl-userid', userid)
        }
       
        const curruser = Util.getCookie('bggl-username')
        this.els.username.value = curruser
        

        this.els.doneButton.onclick = this.doneButtonHandler.bind(this)
        this.els.closeButton.onclick = this.hide.bind(this)
    }

    doneButtonHandler(ev) {
        ev.preventDefault()

        const curruser = Util.getCookie('bggl-username')

        if (this.els.username.value.trim() != curruser.trim()) {
            if (this.els.username.value.trim() === '') {
                this.leaveRoom()
                return
            } else {
                Util.setCookie('bggl-username', this.els.username.value)
            }
        }
        if (this.els.username.value.trim() != '') {
            this.joinRoom()
        }
        this.hide()
    }

    defaultHandler(settings) {
        console.log(settings)
    }

    hide() { this.style.display = 'none' }

    show(callback) {
        this.style.display = 'block'
        this.callback = callback || this.defaultHandler
    }


    joinRoom() {
        if (this.data.room !== 'none') {
            this.ws = new WebSocket(`ws://localhost:3010/api/chat?room=${this.data.room}`)
            this.ws.onopen = () => {
                console.log('web socket established')
            }
            this.ws.onmessage = this.wsMessage
            this.ws.onclose = this.wsClose
        }
    }

    leaveRoom() {

    }

    wsClose() {

    }

    wsMessage() {

    }

    setOnRoomChange(f) {
        this.onRoomChangeCallback = f
    }

    onRoomChange() {
        this.onRoomChangeCallback(roomdata)
    }

    static template() {
        return /*html*/`
        <style>
            .overlay {
                position: absolute;
                top: 104px;
                left: 0;
                width: 100%;
                height: calc(100% - 104px);
                text-align: center;
                padding: 20px;
                background-color: rgba(0, 0, 0, 0.9);
            }

            .overlay-content {
                text-align: left;
                display: inline-block;
            }

            .overlay-content input[type="text"] {
                padding: 0.6rem;
                background-color: #e4e4e4;
                color: rgba(0, 0, 0, 0.6);
                font-weight: bold;
                
            }

            .overlay-content button {
                width: auto;
                margin: 0 0.6rem;
            }

            span.close {
                float: right;
                font-family: monospace;
                font-weight: bold;
                font-size: 2rem;
                cursor: pointer;
            }
        </style>
        <div class="overlay">
            <div class="overlay-content">
                <span class="close">X</span>
                <form>
                    <h3 style="text-align: center">Multiplayer Settings</h3>
                    <h4>Share Room Link</h4>
                    <input type="text" value="" id="roomid" disabled>
                    <button id="bggl-copy-room"><i class="material-icons">filter_none</i> Copy</button>
                    <h4>Looks like its just you in this room. invite some friends!</h4>
                    <label for="bggl-username">What's your name?</label>
                    <input id="bggl-username" type="text" />
                    <button id="bggl-room-done">Done</button>
                </form>
            </div>
        </div>`
    }
}

customElements.define('x-roomsettings', RoomSettings)