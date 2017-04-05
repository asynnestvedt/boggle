let conf = require('../config/config.js');
let boggle = require('../lib/boggle.js');

let game = new boggle.Game(5,5);
console.log(game.board.dice);
console.log(new boggle.Die('ABCDEF'));