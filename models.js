const pg = require('pg');
const cs = process.env.DATABASE_URL || "postgres://atos:atos@localhost/livefeed";

const client = new pg.Client(cs);
client.connect();

var queries = 4;
function checkCloseConnection() {
    if(queries == 1) {
        client.end();
    }
    queries--;
}

var actqueries = [];

actqueries.push(client.query('CREATE TABLE IF NOT EXISTS users ("id" SERIAL PRIMARY KEY, "username" TEXT, "password" TEXT, "salt" TEXT)'));
actqueries.push(client.query('CREATE TABLE IF NOT EXISTS messages ("id" SERIAL PRIMARY KEY, "message" TEXT)'));
actqueries.push(client.query('CREATE TABLE IF NOT EXISTS events ("id" SERIAL PRIMARY KEY, "title" TEXT, "time" TEXT, "location" TEXT, "day" INTEGER)'));
actqueries.push(client.query('CREATE TABLE IF NOT EXISTS tweets ("id" SERIAL PRIMARY KEY, "screen_name" TEXT, "profile_image_url" TEXT, "text" TEXT, "media_url" TEXT, "datetime" TIMESTAMP)'));

actqueries.forEach(function(e, i, a) {
    e.on('end', checkCloseConnection);
});
