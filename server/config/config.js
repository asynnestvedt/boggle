let path = require('path');
module.exports = {
    paths: {
        root: path.resolve(__dirname + '/..')+'/',
        lib: path.resolve(__dirname + '/../lib')+'/',
        public: path.resolve(__dirname + '/../../public')+'/'
    },
    http:{
        defaultPort: 3000
    },
    secret: "u9mey4oh3BKdPvGZjqr6GGTrM5bViUxUfot354HJC5PHydTGbu0w2kKYkk3sK9DgroPSrB1RzqdFchh5A0l7eGnfi0wWLix1PdUwqyiJoV1848Sz4jUMupO1Rit5ahatHh2iBD2WcQI0zuEb"
}