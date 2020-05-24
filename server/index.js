'use strict'
let conf = require('./config/config')
let WebSocketServer = require('ws').Server
let express = require('express')
let http = require('http')
let app = express()
let bodyParser = require('body-parser')
let boggle = require(conf.paths.lib + 'boggle')
let server = http.createServer(app)
let url = require('url')

let data = {
    // conns: new Set(),
    rooms: {},
    roomByUser: {},
}

const ROOM_IDLE_CLEANUP = 60 * 119 //seconds
const CLEANUP_INTERVAL = 60 * 20 //seconds

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// parse application/json
app.use(bodyParser.json())

app.use('/', express.static(conf.paths.public))

app.get('/api/board/:dimen?', function (req, res, next) {
    let dimensions = [4, 4]
    try {
        dimensions = req.params.dimen.split('x')
    } catch (e) { /** no dimensions requested */ }
    const board = new boggle.Board(dimensions[0], dimensions[1])

    if (req.query.orientation && req.query.orientation === 'natural') {
        board.dice.forEach(element => {
            element.orientation = 0
        })
    }

    res.status(200).send(JSON.stringify({ data: board.dice }))
})

/**
 * returns the words that can be found in a boggle game
 * accepts json body via POST with format sample:
 * {
 *     letters:'ACDHDO...'
 * }
 */
app.post('/api/solve', function (req, res, next) {
    let data = req.body
    let qs = require('querystring')
    let http = require('http')

    let options = {
        'method': 'POST',
        'hostname': 'boggle.wordsmuggler.com',
        'port': null,
        'path': '/Boggle/Solve',
        'headers': {
            'content-type': 'application/x-www-form-urlencoded',
            'cache-control': 'no-cache'
        }
    }

    let xhrreq = http.request(options, function (xhrres) {
        let chunks = []

        xhrres.on('data', function (chunk) {
            chunks.push(chunk)
        })

        xhrres.on('end', function () {
            let xhrbody = Buffer.concat(chunks)
            res.status(200).send(JSON.stringify({ data: xhrbody.toString() }))
        })
    })

    xhrreq.write(qs.stringify({ letters: data.letters }))
    xhrreq.end()
})

app.get('/', function (req, res) {
    res.sendFile(conf.paths.public + '/index.html')
})

app.get('*', function (req, res) {
    res.send('looking for something?', 404)
})

let port = process.env.PORT || conf.http.defaultPort

if (server.listen(port)) {
    console.log('Express on port ' + port)
}

var wss = new WebSocketServer({ server: server, path: '/api/chat' })


function createOrJoinRoom(ws, room) {
    data.rooms[room] = data.rooms[room] || {
        users: []
    }
    
    if (! data.rooms[room].users.some(e => e.uid === ws.uid)) {
        data.rooms[room].users.push(ws)
        data.roomByUser[ws.uid] = data.rooms[room] /* User can only have one room! */
    }

    notifyRoom(data.rooms[room],{
        action: 'rosterUpdate',
        payload: {
            text: `${ws.displayname} has joined the room.`,
            users: (data.rooms[room].users || []).map(e => { return { uid: e.uid, name: e.displayname } })
        }
    })
    return data.rooms[room]
}

function leaveRoom(ws) {
    delete data.roomByUser[ws.uid]

    /** empty room already gone */
    if (!data.rooms[ws.roomid]) { return }

    data.rooms[ws.roomid].users.splice(data.rooms[ws.roomid].users.findIndex(v => v.uid === ws.uid), 1)
    notifyRoom(data.rooms[ws.roomid],{
        action: 'rosterUpdate',
        payload: {
            text: `${ws.displayname} has left the room.`,
            users: data.rooms[ws.roomid].users.map(e => { return { uid: e.uid, name: e.displayname } })
        }
    })
}

function notifyRoom(room, payload) {
    const ts = Math.floor((new Date()).getTime()/1000)
    room.lastaccessed = ts
    room.users.forEach(ws => {
        try {
            ws.send(JSON.stringify(payload))
        } catch (e) {
            console.log(e)
        }
    })
}

wss.on('connection', function (ws, req) {
    const { query: { roomid, uid, name } } = url.parse(req.url, true)

    // 1. attach identities
    ws.uid = uid
    ws.roomid = roomid
    ws.displayname = name

    // 2. create or join room
    ws.room = createOrJoinRoom(ws, roomid)

    ws.on('close', (exitcode) => {
        leaveRoom(ws)
    })
    
    ws.on('message', function (msgStr) {
        const msg = JSON.parse(msgStr)
        if (msg.action === 'startgame') {
            notifyRoom(data.rooms[ws.roomid], msg)
        }
    })
}.bind(this))


setInterval( ()=> {
    const starting = roomCount()
    cleanRooms()
    const ending = roomCount()
    console.log(`${ending} active rooms, ${starting - ending} cleaned up`)
}, CLEANUP_INTERVAL * 1000)


function roomCount() {
    let count = 0
    for (var k in data.rooms) {
        if (data.rooms.hasOwnProperty(k)) {
            ++count
        }
    }
    return count
}

function cleanRooms() {
    const today = new Date()
    const ts = Math.floor(today.getTime()/1000)
    for (let k in data.rooms) {
        if (ts - data.rooms[k].lastaccessed >= ROOM_IDLE_CLEANUP) {
            data.rooms[k].users.forEach((ws) => {
                ws.close()
                if (data.roomByUser[ws.uid]) {
                    delete data.roomByUser[ws.uid]
                }
            })
            delete data.rooms[k]
        }
    }
}