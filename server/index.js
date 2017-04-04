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
    res.send( 200, JSON.stringify({data: board.dice}) );
});

/**
 * returns the words that can be found in a boggle game
 * accepts json body via POST with format sample:
 * {
 *     letters:['A','C'...],
 *     width: 4,
 *     height: 4
 * }
 */
app.post("/api/solve", function(req, res, next){
    let data = req.body;
    res.send( 200, JSON.stringify({data:{words:words}}) );
});

app.get('/*', function(req, res){
  res.sendFile(conf.paths.public+'/index.html');
});

var port = process.env.PORT || conf.http.defaultPort;
if ( app.listen(port) ){
    console.log("Express on port " + port);
}