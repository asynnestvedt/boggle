
/**
 * Boggle class containing game components and logic
 */
class BoggleGame {
    /**
     * 
     * @param {number} [width=4] width - width of board in units of dice
     * @param {number} [height=4] height - height of board in units of dice
     * @param {number} [duration=180] duration - duration of gameplay in seconds
     */
    constructor(width, height, duration) {
        this.board = new BoggleBoard(width, height);
        this.duration = duration || 180; /** in seconds */
    }


    /**
     * returns a new array of randomized dice
     */
    static get dice() {
        /** Boggle Deluxe Dice Set */
        return [
            ['A','A','A','F','R','S'],
            ['A','A','E','E','E','E'],
            ['A','A','F','I','R','S'],
            ['A','D','E','N','N','N'],
            ['A','E','E','E','E','M'],
            ['A','E','E','G','M','U'],
            ['A','E','G','M','N','N'],
            ['A','F','I','R','S','Y'],
            ['B','J','K','Q','X','Z'],
            ['C','C','N','S','T','W'],
            ['C','E','I','I','L','T'],
            ['C','E','I','L','P','T'],
            ['C','E','I','P','S','T'],
            ['D','H','H','N','O','T'],
            ['D','H','H','L','O','R'],
            ['D','H','L','N','O','R'],
            ['D','D','L','N','O','R'],
            ['E','I','I','I','T','T'],
            ['E','M','O','T','T','T'],
            ['E','N','S','S','S','U'],
            ['F','I','P','R','S','Y'],
            ['G','O','R','R','V','W'],
            ['H','I','P','R','R','Y'],
            ['N','O','O','T','U','W'],
            ['O','O','O','T','T','U']
        ].slice().sort(function(a, b){return 0.5 - Math.random()});
    }

    /**
     * Start the game timer and execute callback once timer expires
     * @param {callback} cb - fired when game timer expires
     */
    start(cb) {
        setTimeout(cb, this.duration);
    }
}

/**
 * A boggle board model populated with randomized Boggle dice. For custom
 * board sizes above 5x5 random dice will be repeated.
 */
class BoggleBoard {
    /**
     * @param {number} [width=4] width - width of board in units of dice
     * @param {number} [height=4] height - height of board in units of dice
     */
    constructor(width, height) {
        this.width = width || 4;
        this.height = height || width || 4;
        this.dice = [];
        
        let diceNeeded = this.width * this.height;
        let rndDice = BoggleGame.dice;

        /** dice are removed from the pool as they are rolled to prevent dupes */
        while (this.dice.length < diceNeeded) {
            if (rndDice.length < 1) { rndDice = BoggleGame.dice; } /** get a new pool of dice as needed */
            this.dice.push( new BoggleDie(rndDice.pop()) );
        }
    }
}

/**
 * A model of a 6-sided die at rest including physical orientation
 */
class BoggleDie {
    /**
     * 
     * @param {string} letters[]
     */
    constructor(letters) {
        this.letters = letters;
        this.selected = this.letters[Math.round(Math.random() * 5)];
        this.orientation = [0,90,180,270][Math.round(Math.random() * 3)];
    }
}

module.exports = {
    Game: BoggleGame,
    Board: BoggleBoard,
    Die: BoggleDie
};