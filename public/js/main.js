'use strict'

class App {
    constructor() {
        this.data = {
            board: new BoggleBoard('board'),
            settings: new Settings(function() {
                this.startgame();
            }.bind(this)),
            sounds: {
                shake: new Audio('assets/dice-shake.mp3')
            },
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
    
        this.uiPause = false;
        this.data.screenMgr = new ScreenManager(document.getElementById('bggl-fullscr'));
    }

    startgame() {
        this.data.board.show();
        let dimen = this.data.settings.dimensions;
        if (dimen === '4x4') {
            this.data.board.el.classList.remove('five-by-five');
            this.data.board.el.classList.add('four-by-four');
        } else {
            this.data.board.el.classList.remove('four-by-four');
            this.data.board.el.classList.add('five-by-five');
        }
        new ApiGet('/api/board/'+this.data.settings.dimensions,function(response) {
            if (response) {
                this.data.board.render(response.data);
                this.data.sounds.shake.play();
                this.reqSolution();
                this.data.timer.start(this.data.settings.duration,0.1, function(){
                    console.log('game over');
                });
            }
        }.bind(this));
    }

    reqSolution() {
        let diceStr = this.data.board.dice.map(function(die){
            return die.selected;
        }).join('');
        new ApiPost('/api/solve',{letters: diceStr},function(response) {
            if (response) {
                console.log(response);
                this.data.solution = response.data;
            }
        }.bind(this));
    }

    gameover() {
        /** display EOGame word list */
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
        this.callback = callback || this.defaultHandler;
        
        /** bind events */ 
        this.init();
    }

    defaultHandler(evt) {
        let action='',value='';
        try {
            action = evt.srcElement.getAttribute('data-action');
            value = evt.srcElement.value;
        } catch (e) {
            console.log(e);
        }

        switch(action) {
            case 'players':
                this.players = parseInt(value);
                break;
            case 'boardsize':
                this.dimensions = value;
                break;
            case 'duration':
                this.duration = parseInt(value);
                break;
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
        for(let key in this.els.inputs) {
            if (this.els.inputs.hasOwnProperty(key)) {
                this.els.inputs[key].addEventListener("change", this.defaultHandler.bind(this));
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
    constructor(el, width, height) {
        this.el = document.getElementById(el);
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
            if (dice[i].selected === 'M' || dice[i].selected === 'W') {
                span.setAttribute('class','underline letters r'+dice[i].orientation);
            } else {
                span.setAttribute('class','letters r'+dice[i].orientation);
            }

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

class ScreenManager {
    constructor(el, doToggle) {
        if (!el) return false;

        this.el = el;
        this.init();
        if (doToggle) {
            this.toggleFullScreen();
        }
    }

    init() {
        this.bindEsc();
        this.bindClick()
        this.render();
    }

    bindClick() {
        this.el.onclick = function() {
            this.toggleFullScreen();
        }.bind(this);
    }

    bindEsc() {
        document.addEventListener("keydown", function(e) {
            if (e.keyCode == 27) {
                if (document.cancelFullScreen) {
                    document.cancelFullScreen();
                } else if (document.mozCancelFullScreen) {
                    document.mozCancelFullScreen();
                } else if (document.webkitCancelFullScreen) {
                    document.webkitCancelFullScreen();
                }
            }
        }, false);
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
        } else {
            if (document.cancelFullScreen) {
                document.cancelFullScreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.webkitCancelFullScreen) {
                document.webkitCancelFullScreen();
            }
            this.render();
        }
    }

    render(fullBool){
        if (! fullBool) {
            this.el.innerHTML = '<i class="material-icons">fullscreen</i>';
        } else {
            this.el.innerHTML = '<i class="material-icons">fullscreen_exit</i>';
        }
    }
} 

let app = new App();

