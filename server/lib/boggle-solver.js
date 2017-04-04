class BoggleSolver {
    constructor(board) {
        /** create array of "face up" letter from each die on the board */
        let letters = board.dice.map(function(die){
            return die.selected;
        });
        
        /** load array from file */
        this.dictionary = [];

        /** populate a hashmap from array for faster lookups. Assume that dictionary key lookups are 
         * implimented as a binary tree in JS engines. Performance should already be ~optimal.
         */
        this.dictmap = {};

        /** solve for words */
        this.words = this.solve(letters, board.width);
    }

    isWord(lettersArray) {
        this.dictmap.hasOwnProperty(lettersArray.join(''));
    }

    solve(letters, width, pos, used) {
        /** get adjacent letters that havn't been used */
        let adjacent = {

        }
    }
}
