'use strict'

class App {
    constructor() {
        this.data = {
            board: new BoggleBoard(),
            settings: new Settings(function() {
                this.data.board.show(); 
                this.shake();
            }.bind(this)),
            sounds: {
                shake: new Audio('assets/dice-shake.mp3')
            },
        };
        this.uiPause = false;
        // this.shake();
    }

    shake() {
        let test = new ApiGet('/api/board/4x4',function(response) {
            if (response) {
                this.data.board.render(response.data);
                this.data.sounds.shake.play();
            }
        }.bind(this));
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
        this.dimensions = '4x4';
        this.callback = callback || this.defaultHandler;
        
        /** bind events */ 
        this.init();
    }

    defaultHandler(evt) {
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
        for(let key in this.els.inputs) {
            if (this.els.inputs.hasOwnProperty(key)) {
                this.els.inputs[key].addEventListener("change", this.defaultHandler);
            }
        }

        this.els.button.addEventListener("click", function(evt) {
            evt.preventDefault();
            this.hide(); 
            this.callback();
        }.bind(this));
    }
}

class BoggleBoard {
    constructor(width, height) {
        this.el = document.getElementById('board');
        this.width = width || 4;
        this.height = height || 4;
    }

    hide() {
        this.el.style.display = 'none';
    }

    show() {
        this.el.style.display = 'block';
    }

    render(dice) {
        this.el.textContent = '';
        for(let i=0; i < dice.length; ++i) {
            let div = document.createElement('div');
            let span = document.createElement('span');

            span.innerText = dice[i].selected;
            span.setAttribute('class','letters r'+dice[i].orientation);

            div.setAttribute('class','die');
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
        } catch (e){
            this.doFailed(e,callback);
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
        this.xhr.onreadystatechange = function() {
            if (this.readyState == 4) {
                if (this.status >= 200 && this.status < 300) {
                    _this.handleResponse(this.responseText, callback);
                } else {
                    _this.doFailed('Error w/ status '+this.status, callback);
                }
            }
        };

        this.xhr.open("GET", endpoint, true);
        this.xhr.send();
    }
}

class ApiPost extends ApiRequest{
    constructor(endpoint, data, callback) {
        super();
        let _this = this;
        
        this.xhr.open("POST", endpoint, true);
        this.xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        this.xhr.onreadystatechange = function() {
            if (this.readyState == 4) {
                if (this.status >= 200 && this.status < 300) {
                    _this.handleResponse(this.responseText, callback);
                } else {
                    _this.doFailed('Error w/ status '+this.status, callback);
                }
            }
        };
        this.xhr.send(JSON.stringify(data));
    }
}

let app = new App();