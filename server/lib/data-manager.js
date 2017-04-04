/**
 * a simple in memory data store
 */
class DataManager {
    constructor() {
        /** use json as database - yuck */
        this.db = {};

        /** clean old entries every 10 min */
        setTimeout(1000*600, function(){ this.clean() }.bind(this));
    }

    write(key,value) {
        this.db[key] = {
            value: value,
            timestamp: new Date().getTime()
        }
    }

    read(key) {
        if (this.db.hasOwnProperty(key)) {
            return this.db[key].value;
        } else {
            return undefined;
        }
    }

    clean() {
        var d = new Date();

        let expTime = new Date();
        expTime.setHours(expTime.getHours() - 2);
        let expTimestamp = expTime.getTime();

        for (let key in this.db) {
            if (db.key.timestamp < expTimestamp) {
                delete db[key];
            }
        }
    }

}

module.exports = DataManager;