'use strict'
let conf = require('./config/config');
let express = require('express');
let app = express();
let bodyParser = require('body-parser');
let boggle = require(conf.paths.lib + 'boggle');

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));

// parse application/json
app.use(bodyParser.json());

app.use("/", express.static(conf.paths.public));

app.get("/api/board/:dimen?", function(req, res, next){
    let dimensions = [4,4];
    try {
        dimensions = req.params.dimen.split("x");
    } catch(e) { /** no dimensions requested */ }
    let board = new boggle.Board(dimensions[0],dimensions[1]);
    res.status(200).send( JSON.stringify({data: board.dice}) );
});

/**
 * returns the words that can be found in a boggle game
 * accepts json body via POST with format sample:
 * {
 *     letters:'ACDHDO...'
 * }
 */
app.post("/api/solve", function(req, res, next){
    let data = req.body;
    var qs = require("querystring");
    var http = require("http");

    var options = {
        "method": "POST",
        "hostname": "boggle.wordsmuggler.com",
        "port": null,
        "path": "/Boggle/Solve",
        "headers": {
            "content-type": "application/x-www-form-urlencoded",
            "cache-control": "no-cache"
        }
    };

    var xhrreq = http.request(options, function (xhrres) {
        var chunks = [];

        xhrres.on("data", function (chunk) {
            chunks.push(chunk);
        });

        xhrres.on("end", function () {
            var xhrbody = Buffer.concat(chunks);
            res.status(200).send( JSON.stringify({data: xhrbody.toString()}) );
        });
    });

    xhrreq.write(qs.stringify({ letters: data.letters }));
    xhrreq.end();
});

app.get('/*', function(req, res){
    res.sendFile(conf.paths.public+'/index.html');
});

app.get('*', function(req, res){
    res.send('looking for something?', 404);
});

var port = process.env.PORT || conf.http.defaultPort;
if ( app.listen(port) ){
    console.log("Express on port " + port);
}