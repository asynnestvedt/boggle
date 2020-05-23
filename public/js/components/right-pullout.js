

import { ShadowComponent } from '../main.js'

export default class RightPullOut extends ShadowComponent {
    constructor() {
        super()
        this.contentElement = this.shadowRoot.querySelector('#content')
        this.tabElement = this.shadowRoot.querySelector('#slideout')
        this.tabLabelElement = this.shadowRoot.querySelector('#tab-label')
        this.totalEl
        this.total = 0
        this.hide()
    }


    connectedCallback() {
        this.init()
    }

    disconnectedCallback() {
    }

    attributeChangedCallback(attrName, oldVal, newVal) {
    }

    init() {
        this.tabLabelElement.addEventListener('click', this.toggle.bind(this))
    }

    toggle() {
        if( this.tabElement.classList.contains('out') ) {
            this.tabElement.classList.remove('out')
        } else {
            this.tabElement.classList.add('out')
        }
    }

    wordtoggle(ev) {
        const el = ev.target.tagName === 'DIV' ? ev.target : ev.target.closest('div')
        const points = parseInt(el.dataset.points)
        if( el.classList.contains('cross-out') ) {
            el.classList.remove('cross-out')
            this.shadowRoot.total += points
        } else {
            el.classList.add('cross-out')
            this.shadowRoot.total -= points
        }
        this.shadowRoot.totalEl.innerHTML = this.shadowRoot.total.toString()
    }

    hide() { 
        if( ! this.classList.contains('hidden') ) {
            this.classList.add('hidden')
        }
    }

    show(words) {
        if (words) {
            this.renderWords(words)
        }
        if( this.classList.contains('hidden') ) {
            this.classList.remove('hidden')
        }
        if( this.tabElement.classList.contains('out') ) {
            this.tabElement.classList.remove('out')
        }
    }

    clear() {

    }

    renderWords(words) {
        const wordtemplate = (word, padding, points)=> {
            return /*html*/`
            <div class="word" data-word="BELL" data-points="2">
                <span><b>${word}</b>${'&nbsp;'.repeat(padding)}${points}</span>
            </div>`
        }

        let htmlStr = ''

        
        this.shadowRoot.total = 0
        

        words.forEach(w=>{
            const points = w.length - 2
            const padding = 12 - w.length
            htmlStr += wordtemplate(w, padding, points)
            this.shadowRoot.total += points
        })

        htmlStr += `<hr /><div><b>Total</b>&nbsp;${'&nbsp;'.repeat(5)}<span id="total">${this.shadowRoot.total}<span></div>`

        this.contentElement.innerHTML = htmlStr


        const wordEls = this.contentElement.querySelectorAll('.word') || []
        wordEls.forEach(element => {
            element.addEventListener('click', this.wordtoggle.bind(this))
        })

        this.shadowRoot.totalEl = this.shadowRoot.getElementById('total')
    }

    static template() {
        return /*html*/`
   
        <style>
        .cross-out span {
            text-decoration: line-through;
            color: #BBB;
        }
        #slideout {
            z-index: 1000;
            position: fixed;
            top: 114px;
            right: 0;
            padding: 1rem;
            -webkit-transition-duration: 0.3s;
            -moz-transition-duration: 0.3s;
            -o-transition-duration: 0.3s;
            transition-duration: 0.3s;
            color: white;
            border-top: 2px solid white;
            border-left: 2px solid white;
            border-bottom: 2px solid white;
            background-color: #334;
            border-bottom-left-radius: 14px;
            height: 60px;
            width: 25px;
        }
        #tab-label {
            display: block;
            font-weight: bold;
            -webkit-transform: rotate(-90deg);
            transform: rotate(-90deg);
            margin-top:30px;
        }
        #slideout_inner {
            font-family: monospace, monospace;
            background-color: #334;
            position: fixed;
            top: 104px;
            right: -200px;
            -webkit-transition-duration: 0.3s;
            -moz-transition-duration: 0.3s;
            -o-transition-duration: 0.3s;
            transition-duration: 0.3s;
            border-top: 2px solid white;
            border-left: 2px solid white;
            border-bottom: 2px solid white;
            border-bottom-left-radius: 14px;
            font-size: 1.4rem;
            line-height: 2.3rem;
            overflow-y: scroll;
            max-height: 80vh;
            scrollbar-width: none;

        }
        #slideout_inner::-webkit-scrollbar {
            display: none;
        }
        #content {
            padding: 10px;
            width: 180px;
            min-height: 200px;
            text-align: left;
        }
        #slideout.out {
            right: 200px;
        }
        #slideout.out #slideout_inner {
            right: 0;
        }
    </style>
        <div id="slideout" class="out">
            <div id="tab-label">points</div>
            <div id="slideout_inner">
                <div id="content">
                    
                </div>
            </div>
        </div>`
    }
}

customElements.define('x-rightpullout', RightPullOut)


