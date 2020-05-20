'use strict'
/**
 * App class organizes and controls components and data and high level UI state.
 */
class App {
    constructor() {
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
                this.requestgame();
            }.bind(this)),
            roomSettings: new RoomSettings("#bggl-room-settings", (settings) => {
                console.log(`should dump settings here`);
            }),
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
            }),
            room: getParameterByName("room") || "none",
            ws: null
        }

        /**
         * Set bindings
         */
        this.data.screenMgr = new ScreenManager(document.getElementById('bggl-fullscr'), {
            onfull: function () {
                this.data.els.footer.style.display = 'none';
            }.bind(this),
            onnormal: function () {
                this.data.els.footer.style.display = 'block';
            }
        });

        /**
         * Set bindings
         */
        this.init();
    }

    init() {
        this.data.els.replayBtn.addEventListener("click", function (evt) {
            evt.preventDefault();
            if (this.data.board) {
                this.data.board.hide();
            }
            this.data.els.solution.style.display = 'none';
            this.data.settings.show();
            this.data.timer.stop();
        }.bind(this));

        this.data.els.users.onclick = () => {
            this.data.roomSettings.show()
        }

        if (this.data.room !== 'none') {
            this.getUserName();
            this.ws = new WebSocket(`ws://localhost:3010/api/chat?room=${this.data.room}`);
            this.ws.onopen = () => {
                // this.wsJoin();
            }
            this.ws.onmessage = this.wsMessage;
            this.ws.onclose = this.wsClose;
        }
    }


    wsJoin() {
        this.ws.send(`ROOM|${this.data.room}|JOIN|${this.data.user}`);
    }

    wsMessage(evt) {
        let received_msg = evt.data.split('|');
        switch (received_msg[0]) {
            case "COUNT":
                document.getElementById("bggl-people").querySelector('span').innerHTML = received_msg[1];
                break;
            case "START":
                this.startgame(JSON.parse(received_msg[1]));
                break;
        }
    }

    wsClose() {
        alert("Connection is closed...");
    }


    /**
     * requests solution from server
     */
    requestgame() {
        /** create new board - assume square */
        let dimen = parseInt(this.data.settings.dimensions.split('x')[0]);
        this.data.board = new BoggleBoard('board', dimen, dimen);
        this.data.board.show();

        /**  */
        this.data.els.solution.innerHTML = '';

        const room = getParameterByName("room") || "none";

        /** ask server for dice */
        new ApiGet(`/api/board/${this.data.settings.dimensions}?orientation=${this.data.settings.orientation}&room=${room}`, function (response) {
            if (response) {
                this.startgame(response.data)
            }
        }.bind(this));
    }


    startgame(data) {
        /** render board with dice */
        this.data.board.render(data);
        /** play dice shake sound */
        this.data.sounds.shake.play();
        /** fire request for solution to server */
        this.reqSolution();
        /** start the timer */
        this.data.timer.start({
            duration: this.data.settings.duration,
            interval: 0.1,
            done: function () {
                this.gameover();
            }.bind(this)
        });
        /** add midway timer for countdown music */
        this.data.timer.at(this.data.settings.duration - 31, function () {
            this.data.sounds.countdown.play();
        }.bind(this));
    }

    /**
     * requests solution from server
     */
    reqSolution() {
        let diceStr = this.data.board.dice.map(function (die) {
            return die.selected;
        }).join('');
        new ApiPost('/api/solve', { letters: diceStr }, function (response) {
            if (response) {
                this.data.solution = JSON.parse(response.data);
                console.log(this.data.solution);
            }
        }.bind(this));
    }

    /**
     * called after timer runs down
     */
    gameover() {
        /** sort solution words */
        let sortedWords = this.data.solution.Words.sort(function (a, b) { return (a.Word < b.Word) ? -1 : (a.Word > b.Word) ? 1 : 0; });

        /** display EOGame word list. yuck!... change to templating or element.create  */
        let htmlStr = '';
        for (let i = 0; i < this.data.solution.Words.length; ++i) {
            let word = this.data.solution.Words[i];
            htmlStr += '<div><b>' + word.Word + '</b> &nbsp;' + word.Definition + '</div>';
        }
        this.data.els.solution.innerHTML = htmlStr;
        this.data.board.hide();
        this.data.els.solution.style.display = 'block';
    }

}



const Util = {
    makeRoomID: () => {
        return Math.random().toString(36).substring(6) + Math.random().toString(36)
            .substring(6)
    },

    setCookie: (cname, cvalue, exdays) => {
        let d = new Date();
        d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
        let expires = "expires=" + d.toUTCString();
        document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
    },

    getCookie: (cname) => {
        let name = cname + "=";
        let decodedCookie = decodeURIComponent(document.cookie);
        let ca = decodedCookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) == ' ') {
                c = c.substring(1);
            }
            if (c.indexOf(name) == 0) {
                return c.substring(name.length, c.length);
            }
        }
        return "";
    }
}

class RoomSettings {
    constructor(selector, callback) {
        const root = document.querySelector(selector)
        root.innerHTML = RoomSettings.template();
        this.els = {
            root: root,
            roomIdText: root.querySelector("#roomid"),
            username: root.querySelector("#bggl-username"),
            doneButton: root.querySelector("#bggl-room-done"),
            closeButton: root.querySelector("div.overlay span.close")
        }
        this.callback = callback || this.defaultHandler

        this.init();
    }

    init() {
        if (window.location.search.indexOf("room=") === -1) {
            window.location.href = window.location.href + '?room=' + Util.makeRoomID()
        }

        this.els.roomIdText.value = window.location.href

        document.getElementById("bggl-copy-room").onclick = (ev) => {
            ev.preventDefault()
            this.els.roomIdText.select()
            this.els.roomIdText.setSelectionRange(0, 99999)
            document.execCommand("copy")
        }

        let curruser = Util.getCookie("bggl-username")
        this.els.username.value = curruser

        this.els.doneButton.onclick = (ev) => {
            ev.preventDefault()
            if (this.els.username.value.trim() != curruser.trim()) {
                Util.setCookie("bggl-username", this.els.username.value)
            }
        }

        this.els.closeButton.onclick = this.hide.bind(this)
    }

    defaultHandler(settings) {
        console.log(settings)
    }

    hide() { this.els.root.style.display = 'none' }

    show() { this.els.root.style.display = 'block' }


    static template() {
        return /**html*/ `
        <style>
            .overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
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
                background-color: #444;
                color: #A5DC86;
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

class Settings {
    constructor(callback) {
        this.els = {
            root: document.getElementById('settings'),
            inputs: document.querySelectorAll('#settings input'),
            button: document.querySelector('#settings button')
        }

        /** defaults */
        this.players = 2;
        this.dimensions = '5x5';
        this.duration = 180;
        this.orientation = "random"
        this.callback = callback || this.defaultHandler;

        /** bind events */
        this.init();
    }

    defaultHandler(evt) {
        let action = '', value = '';
        try {
            action = evt.srcElement.getAttribute('data-action');
            value = evt.srcElement.value;
        } catch (e) {
            console.log(e);
        }

        switch (action) {
            case 'players':
                this.players = parseInt(value);
                break;
            case 'boardsize':
                this.dimensions = value;
                break;
            case 'duration':
                this.duration = parseInt(value);
                break;
            case 'orientation':
                this.orientation = value;
        }

        console.log(evt);
        return false;
    }

    hide() {
        this.els.root.style.display = 'none';
    }

    show() {
        this.els.root.style.display = 'block';
    }

    init() {
        for (let key in this.els.inputs) {
            if (this.els.inputs.hasOwnProperty(key)) {
                this.els.inputs[key].addEventListener("change", this.defaultHandler.bind(this));
            }
        }

        this.els.button.addEventListener("click", function (evt) {
            evt.preventDefault();
            this.hide();
            this.callback();
        }.bind(this));
    }
}

class BoggleBoard {
    constructor(el, width, height) {
        this.el = document.getElementById(el);
        this.width = width || 4;
        this.height = height || 4;
        this.dice = [];
    }

    hide() {
        this.el.style.display = 'none';
    }

    show() {
        this.el.style.display = 'block';
    }

    render(dice) {
        this.dice = dice;
        this.el.textContent = '';

        if (this.width === 4 && this.height === 4) {
            this.el.classList.remove('five-by-five');
            this.el.classList.add('four-by-four');
        } else {
            this.el.classList.remove('four-by-four');
            this.el.classList.add('five-by-five');
        }

        for (let i = 0; i < dice.length; ++i) {
            let div = document.createElement('div');
            let span = document.createElement('span');

            span.innerText = dice[i].selected;
            if (dice[i].selected === 'M' || dice[i].selected === 'W') {
                span.setAttribute('class', 'underline letters r' + dice[i].orientation);
            } else {
                span.setAttribute('class', 'letters r' + dice[i].orientation);
            }

            div.setAttribute('class', 'die');
            div.appendChild(span);

            this.el.appendChild(div);
        }
    }
}

/**
 * API normalization classes 
 */
class ApiRequest {
    constructor() {
        this.xhr = new XMLHttpRequest();
    }

    handleResponse(response, callback) {
        let json = null;
        try {
            json = JSON.parse(response);
            if (callback) { callback((json || response)); }
        } catch (e) {
            this.doFailed(e, callback);
        }

    }

    doFailed(response, callback) {
        console.log(response);
        callback(undefined);
    }
}

class ApiGet extends ApiRequest {
    constructor(endpoint, callback) {
        super();
        let _this = this;
        this.xhr.onreadystatechange = function () {
            if (this.readyState == 4) {
                if (this.status >= 200 && this.status < 300) {
                    _this.handleResponse(this.responseText, callback);
                } else {
                    _this.doFailed('Error w/ status ' + this.status, callback);
                }
            }
        };

        this.xhr.open("GET", endpoint, true);
        this.xhr.send();
    }
}

class ApiPost extends ApiRequest {
    constructor(endpoint, data, callback) {
        super();
        let _this = this;

        this.xhr.open("POST", endpoint, true);
        this.xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        this.xhr.onreadystatechange = function () {
            if (this.readyState == 4) {
                if (this.status >= 200 && this.status < 300) {
                    _this.handleResponse(this.responseText, callback);
                } else {
                    _this.doFailed('Error w/ status ' + this.status, callback);
                }
            }
        };
        this.xhr.send(JSON.stringify(data));
    }
}

class ScreenManager {
    constructor(el, options) {
        if (!el) return false;

        options = options || {};

        this.el = el;
        this.cbs = {
            onfull: options.onfull || function () { },
            onnormal: options.onnormal || function () { }
        }
        this.init();
        if (options.doToggle) {
            this.toggleFullScreen();
        }
    }

    init() {
        this.bindEsc();
        this.bindClick()
        this.render();
    }

    bindClick() {
        this.el.onclick = function () {
            this.toggleFullScreen();
        }.bind(this);
    }

    bindEsc() {
        document.addEventListener("keydown", function (e) {
            if (e.keyCode == 27) {
                this.exitFS();
            }
        }.bind(this), false);
    }

    toggleFullScreen() {
        if ((document.fullScreenElement && document.fullScreenElement !== null) ||    // alternative standard method
            (!document.mozFullScreen && !document.webkitIsFullScreen)) {               // current working methods
            if (document.documentElement.requestFullScreen) {
                document.documentElement.requestFullScreen();
            } else if (document.documentElement.mozRequestFullScreen) {
                document.documentElement.mozRequestFullScreen();
            } else if (document.documentElement.webkitRequestFullScreen) {
                document.documentElement.webkitRequestFullScreen(Element.ALLOW_KEYBOARD_INPUT);
            }
            this.render(true);
            this.cbs.onfull();
        } else {
            this.exitFS();
            this.render();
            this.cbs.onnormal();
        }
    }

    exitFS() {
        if (document.cancelFullScreen) {
            document.cancelFullScreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.webkitCancelFullScreen) {
            document.webkitCancelFullScreen();
        }
    }

    render(fullBool) {
        if (!fullBool) {
            this.el.innerHTML = '<i class="material-icons">fullscreen</i>';
        } else {
            this.el.innerHTML = '<i class="material-icons">fullscreen_exit</i>';
        }
    }
}

/** UTIL */
function getParameterByName(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, '\\$&');
    var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}
/** END UTIL */

let app = new App();

