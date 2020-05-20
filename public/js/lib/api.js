/**
 * API normalization classes 
 */
export class ApiRequest {
    constructor() {
        this.xhr = new XMLHttpRequest()
    }

    handleResponse(response, callback) {
        let json = null
        try {
            json = JSON.parse(response)
            if (callback) { callback((json || response)) }
        } catch (e) {
            this.doFailed(e, callback)
        }

    }

    doFailed(response, callback) {
        console.log(response)
        callback(undefined)
    }
}

export class ApiGet extends ApiRequest {
    constructor(endpoint, callback) {
        super()
        let _this = this
        this.xhr.onreadystatechange = function () {
            if (this.readyState == 4) {
                if (this.status >= 200 && this.status < 300) {
                    _this.handleResponse(this.responseText, callback)
                } else {
                    _this.doFailed('Error w/ status ' + this.status, callback)
                }
            }
        }

        this.xhr.open('GET', endpoint, true)
        this.xhr.send()
    }
}

export class ApiPost extends ApiRequest {
    constructor(endpoint, data, callback) {
        super()
        let _this = this

        this.xhr.open('POST', endpoint, true)
        this.xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8')
        this.xhr.onreadystatechange = function () {
            if (this.readyState == 4) {
                if (this.status >= 200 && this.status < 300) {
                    _this.handleResponse(this.responseText, callback)
                } else {
                    _this.doFailed('Error w/ status ' + this.status, callback)
                }
            }
        }
        this.xhr.send(JSON.stringify(data))
    }
}