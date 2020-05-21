import { default as Util } from '../lib/util.js'
import { Component } from '../main.js'

export default class RoomSettings extends Component {
    constructor() {
        super()
        this._startGameCallback = window.app.startgame.bind(window.app)
        this.roomid
        this.userid
        this.name = 'Player'
        this.users
        this.els = {
            overlay: this.querySelector('.overlay'),
            roomIdText: this.querySelector('#roomid'),
            username: this.querySelector('#bggl-username'),
            doneButtons: this.querySelectorAll('button.bggl-room-done'),
            closeButton: this.querySelector('div.overlay span.close'),
            roomCounter: document.getElementById('bggl-people-count'),
            usersList: this.querySelector('div.userslist'),
            leaveRoom: this.querySelector('#bggl-leave-room'),
            joinRoom: this.querySelector('#bggl-join-room')
        }
        this.ws = null
        this.init()
    }

    renderUpdate() {
        this.els.usersList.innerHTML = RoomSettings.template_users(this.users)
        if (this.ws) {
            this.els.joinRoom.style.display = 'none'
            this.els.leaveRoom.style.display = 'block'
        } else {
            this.els.joinRoom.style.display = 'block'
            this.els.leaveRoom.style.display = 'none'
        }
    }

    connectedCallback() {
        this.setRoomID()
        this.renderUpdate()
    }

    disconnectedCallback() {
    }

    attributeChangedCallback(attrName, oldVal, newVal) {
    }

    init() {
        this.setUserID()

        /** copy link on click */
        document.getElementById('bggl-copy-room').onclick = (ev) => {
            ev.preventDefault()
            this.els.roomIdText.disabled = false
            this.els.roomIdText.select()
            this.els.roomIdText.setSelectionRange(0, 99999)
            document.execCommand('copy')
            this.els.roomIdText.disabled = true
        }

        /** get preexisting user name */
        this.name = Util.getCookie('bggl-username')
        this.els.username.value = this.name
        
        
        this.els.doneButtons.forEach(b => b.onclick = this.doneButtonHandler.bind(this))
        this.els.closeButton.onclick = this.hide.bind(this)
    }

    setRoomID() {
        const url = new URL(window.location.href)
        const existingRoom = url.searchParams.get('room')
        if (!existingRoom) {
            this.roomid = Util.makeID()
            url.searchParams.set('room', this.roomid)
        } else {
            this.roomid = existingRoom
        }
        
        if (existingRoom) {
            this.show()
            this.joinRoom()
        }
        this.els.roomIdText.value = url.toString()
    }

    setUserID() {
        this.userid = Util.getCookie('bggl-userid')
        if (! this.userid) {
            this.userid = Util.makeID()
            Util.setCookie('bggl-userid', this.userid)
        }
    }

    doneButtonHandler(ev) {
        ev.preventDefault()
        
        if (this.ws) {
            return this.leaveRoom()
        }

        const name = this.els.username.value.trim()
        if (name != this.name) {
            if (name === '') {
                this.leaveRoom()
                return
            } else {
                this.name = name
                Util.setCookie('bggl-username', this.els.username.value)
            }
        }

        if (name != '') {
            this.joinRoom()
        }

        this.hide()
    }

    defaultHandler(settings) {
        console.log(settings)
    }

    hide() { this.els.overlay.style.display = 'none' }

    show(callback) {
        this.els.overlay.style.display = 'block'
        this.callback = callback || this.defaultHandler
    }


    joinRoom() {
        if (this.ws == null) {
            const protocol = window.location.protocol === 'http:' ? 'ws' : 'wss'
            this.ws = new WebSocket(`${protocol}://${window.location.host}/api/chat?roomid=${this.roomid}&uid=${this.userid}&name=${this.name}`)
            this.ws.onopen = this.defaultHandler.bind(this)
            this.ws.onmessage = this.wsMessage.bind(this)
            this.ws.onclose = this.wsClose.bind(this)
        } else {
            this.sendMessage('join', { name: this.els.username.value.trim() } )
        }
    }


    sendMessage(action, payload) {
        if (this.ws) {
            this.ws.send( JSON.stringify( Object.assign ({action: action}, { payload: payload }) ) )
            return true
        }

        return false
    }


    leaveRoom() {
        console.log('leaving room')
        this.els.roomCounter.innerText = ''
        this.users = null
        this.ws.close()
        this.ws = null
        this.renderUpdate()
    }

    wsClose() {
        console.log('socket closed')
        if (this.users != null) {
            this.leaveRoom()
        }
    }

    wsMessage(msg) {
        const { payload, action } = JSON.parse(msg.data)
        console.log(payload)

        if (action === 'rosterUpdate') {
            this.updateRoster(payload)
        }

        if (action === 'startgame') {
            this._startGameCallback(payload)
        }
    }

    updateRoster(payload) {
        this.users = payload.users
        this.els.roomCounter.innerText = payload.users.length
        this.renderUpdate()
    }

    static template_users(usersArray) {
        if (! usersArray || usersArray.length === 0) {
            return /*html*/ `<h4>Looks like its just you in this room. invite some friends!</h4>`
        }
        
        return /*html*/ `
        <ul>
            ${usersArray.map(e=> `<li>${e.name}</li>` ).join('')}
        </ul>
        `
    }

    static template_attend(bool) {
        if (bool) {
            return /*html*/ `
            `
        }
    }

    static template() {
        return /*html*/`
        <style>
            .overlay {
                display: none; /** default view state */
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
                    <div class="userslist"></div>
                    <div id="bggl-join-room">
                        <label for="bggl-username">What's your name?</label>
                        <input id="bggl-username" type="text" />
                        <button class="bggl-room-done">Join</button>
                    </div>
                    <div id="bggl-leave-room">
                        <button class="bggl-room-done">Leave Room</button>
                    </div>
                </form>
            </div>
        </div>`
    }
}

customElements.define('x-roomsettings', RoomSettings)