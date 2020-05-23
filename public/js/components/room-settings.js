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
        this.els.usersList.innerHTML = RoomSettings.template_users(this.users, this.userid)
        if (this.ws && this.name != 'Player') {
            this.els.joinRoom.classList.add('hidden')
        } else {
            if (this.els.joinRoom.classList.contains('hidden')) {
                this.els.joinRoom.classList.remove('hidden')
            }
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
            if (this.name != '') {
                this.joinRoom()
            }
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
    }

    defaultHandler(settings) {
        console.log(settings)
    }

    hide() { 
        if( ! this.els.overlay.classList.contains('hidden') ) {
            this.els.overlay.classList.add('hidden')
        }
    }

    show(callback) {
        if( this.els.overlay.classList.contains('hidden') ) {
            this.els.overlay.classList.remove('hidden')
        }
        this.callback = callback || this.defaultHandler
    }


    joinRoom() {
        if (this.ws == null) {
            const protocol = window.location.protocol === 'http:' ? 'ws' : 'wss'
            this.ws = new WebSocket(`${protocol}://${window.location.host}/api/chat?roomid=${this.roomid}&uid=${this.userid}&name=${this.name}`)
            this.ws.onopen = this.wsKeepalive.bind(this)
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

    wsKeepalive() {
        this.ws.pingTimer = setInterval(()=>{
            this.sendMessage('ping',{})
        },20000)
    }

    wsClose() {
        clearInterval(this.ws.pingTimer)
        delete (this.ws.pingTimer)
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

    static template_users(usersArray, uid) {
        if (! usersArray || usersArray.length === 0) {
            return /*html*/ '<p>Nobody here</p>'
        }

        return /*html*/ `
        <ul>
            ${usersArray.map(e=> `<li>${e.name} ${e.uid === uid ? '<button class="bggl-room-done">Leave Room</button>' : ''}</li>` ).join('')}
        </ul>
        `
    }

    static template() {
        return /*html*/`
        <style>
            .overlay {
                display: inline-block;
                border-radius: 14px;
                border: 1px solid white;
                margin: 0 auto;
            }

            .overlay-content {
                max-width: 600px;
                text-align: left;
                display: inline-block;
                margin: 20px;
            }

            .overlay-content input[type="text"] {
                padding: 0.6rem;
                background-color: #e4e4e4;
                color: rgba(0, 0, 0, 0.6);
                font-weight: bold;
                border-style: solid;
                border-radius: 12px;
                max-width: 45%;
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
                    <h4 style="text-align: center">Multiplayer Settings</h4>
                    <div id="bggl-join-room">
                        <label for="bggl-username">What's your name?</label><br/>
                        <input id="bggl-username" type="text">
                        <button class="bggl-room-done">Join Room</button>
                        <br /><br/>
                    </div>
                    <label for="roomid">Share link to room</label><br>
                    <input type="text" value="" id="roomid" disabled="">
                    <button id="bggl-copy-room"><i class="material-icons">filter_none</i> Copy</button>
                    <h4 style="text-align: center">Guest List</h4>
                    <div class="userslist"><p>Nobody here</p></div>
                </form>
            </div>
        </div>`
    }
}

customElements.define('x-roomsettings', RoomSettings)