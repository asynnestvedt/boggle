import { default as Util } from '../lib/util.js'
import { Component } from '../main.js'

export default class RoomSettings extends Component {
    constructor() {
        super()
        this.onRoomChangeCallback = this.defaultHandler
        this.roomid
        this.userid
        this.name
        this.users
        this.els = {
            overlay: this.querySelector('.overlay'),
            roomIdText: this.querySelector('#roomid'),
            username: this.querySelector('#bggl-username'),
            doneButton: this.querySelector('#bggl-room-done'),
            closeButton: this.querySelector('div.overlay span.close'),
            roomCounter: document.getElementById('bggl-people-count'),
            usersList: this.querySelector('div.userslist')
        }
        this.ws = null
        this.init()
    }

    renderUsers() {
        this.els.usersList.innerHTML = RoomSettings.template_users(this.users)
    }

    connectedCallback() {
        this.setRoomID()
        this.renderUsers()
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
            this.els.roomIdText.select()
            this.els.roomIdText.setSelectionRange(0, 99999)
            document.execCommand('copy')
        }

        /** get preexisting user name */
        this.name = Util.getCookie('bggl-username')
        this.els.username.value = this.name
        
        
        this.els.doneButton.onclick = this.doneButtonHandler.bind(this)
        this.els.closeButton.onclick = this.hide.bind(this)
    }

    setRoomID() {
        if (window.location.search.indexOf('room=') === -1) {
            this.roomid = Util.makeID()
            // window.location.href = window.location.href + `?room=${this.roomid}`
        } else {
            this.roomid = Util.getParameterByName('room')
        }

        const url = new URL(window.location.href)
        url.searchParams.set('room', this.roomid)
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
        const name = this.els.username.value.trim();
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
            this.ws = new WebSocket(`ws://localhost:3010/api/chat?roomid=${this.roomid}&uid=${this.userid}&name=${this.name}`)
            this.ws.onopen = () => { this.announceName() }
            this.ws.onmessage = this.wsMessage.bind(this)
            this.ws.onclose = this.wsClose.bind(this)
        } else {
            this.announceName()
        }
    }

    announceName() {
        this.ws.send(
            JSON.stringify({
                action: 'join',
                roomid: this.roomid,
                userid: this.userid,
                name: this.els.username.value.trim()
            })
        )
    }


    leaveRoom() {
        console.log('leaving room')
        this.ws.close()
        this.ws = null
    }

    wsClose() {
        console.log('socket closed')
    }

    wsMessage(msg) {
        const payload = JSON.parse(msg.data)
        console.log(payload)

        if (payload.type === 'rosterUpdate') {
            this.updateRoster(payload)
        }
    }

    updateRoster(payload) {
        this.users = payload.users
        this.els.roomCounter.innerText = payload.users.length
        this.renderUsers()
    }

    setOnRoomChange(f) {
        this.onRoomChangeCallback = f
    }

    onRoomChange() {
        this.onRoomChangeCallback(roomdata)
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
                    <label for="bggl-username">What's your name?</label>
                    <input id="bggl-username" type="text" />
                    <button id="bggl-room-done">Done</button>
                </form>
            </div>
        </div>`
    }
}

customElements.define('x-roomsettings', RoomSettings)