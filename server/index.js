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

    const room = req.query.room || null

    if (req.query.orientation && req.query.orientation === 'natural') {
        board.dice.forEach(element => {
            element.orientation = 0
        })
    }

    res.status(200).send(JSON.stringify({ data: board.dice }))

    if (data.rooms && data.rooms[room]) {
        data.rooms[room].forEach(ws => ws.send(`START|${JSON.stringify({ data: board.dice })}`))
    }
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
    data.rooms[room] = data.rooms[room] || []
    
    if (! data.rooms[room].some(e => e.uid === ws.uid)) {
        data.rooms[room].push(ws)
        data.roomByUser[ws.uid] = data.rooms[room] /* User can only have one room! */
        console.log(`connected user ${ws.uid} in room ${room}`)
    }

    notifyRoom(data.rooms[room],{
        type: 'rosterUpdate',
        text: `${ws.displayname} has joined the room.`,
        users: data.rooms[room].map(e => { return { uid: e.uid, name: e.displayname } })
    })
    return data.rooms[room]
}

function leaveRoom(ws) {
    
    data.roomByUser[ws.uid]

    notifyRoom(data.rooms[room],{
        type: 'rosterUpdate',
        text: `${ws.displayname} has joined the room.`,
        users: data.rooms[room].map(e => { return { uid: e.uid, name: e.displayname } })
    })
}

function notifyRoom(room, payload) {
    room.forEach(ws => {
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

    data.conns

    // 2. create or join room
    ws.room = createOrJoinRoom(ws, roomid)

    ws.on('close', (exitcode) => {
        console.log(ws)
        delete data.roomByUser[ws.uid]
        data.rooms[ws.roomid].splice(data.rooms[ws.roomid].findIndex(v => v.uid === ws.uid), 1)
        notifyRoom(data.rooms[ws.room],{
            type: 'rosterUpdate',
            text: `${ws.displayname} has left the room.`,
            users: data.rooms[ws.room].map(e => { return { uid: e.uid, name: e.displayname } })
        })
    })
    
    ws.on('message', function (msg) {
        console.log(msg)
    })
}.bind(this))




const Messages =  {
    roomUpdate: (room) => {
        data.rooms[room].forEach(ws => {
            try {
                ws.send({
                    
                })
            } catch (e) {
                console.log(e)
            }
        })
    }
}