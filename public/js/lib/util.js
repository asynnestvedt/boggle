const Util = {
    makeID: () => {
        return [...Array(28)].map(() => (~~(Math.random() * 36)).toString(36)).join('')
    },

    setCookie: (cname, cvalue, exdays) => {
        let d = new Date()
        d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000))
        let expires = 'expires=' + d.toUTCString()
        document.cookie = cname + '=' + cvalue + ';' + expires + ';path=/'
    },

    getCookie: (cname) => {
        let name = cname + '='
        let decodedCookie = decodeURIComponent(document.cookie)
        let ca = decodedCookie.split(';')
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i]
            while (c.charAt(0) == ' ') {
                c = c.substring(1)
            }
            if (c.indexOf(name) == 0) {
                return c.substring(name.length, c.length)
            }
        }
        return ''
    },
    getParameterByName(name, url) {
        if (!url) url = window.location.href
        name = name.replace(/[\[\]]/g, '\\$&')
        var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
            results = regex.exec(url)
        if (!results) return null
        if (!results[2]) return ''
        return decodeURIComponent(results[2].replace(/\+/g, ' '))
    }
}

export default Util