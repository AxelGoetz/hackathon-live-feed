const express = require('express');
const router = express.Router();
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const pg = require('pg');
const cs = process.env.DATABASE_URL || "postgres://atos:atos@localhost/livefeed";

const app = require('../app.js');

/* GET home page. */

function displayAdminPage(req, res) {
  var lock = 0;
  var users = [], messages = [], events = [];
  var sentiment = 0;

  var finishRequest = function(done) {
    lock++;
    if(lock == 4) {
      done();
      res.render('admin', { title: 'Admin', users: users, messages: messages, events: events, sentiment: sentiment} );
    }
  };

  pg.connect(cs, function(err, client, done) {
    if(err) {
      done();
      return res.status(500).json({ success: false, data: err });
    }
    var queries = {};

    queries.users = client.query('SELECT * FROM users');
    queries.messages = client.query('SELECT * FROM messages');
    queries.events = client.query('SELECT * FROM events');
    queries.tweets = client.query('SELECT * FROM tweets ORDER BY datetime DESC LIMIT 10');

    queries.users.on('row', function(row) { users.push(row); });
    queries.messages.on('row', function(row) { messages.push(row); });
    queries.events.on('row', function(row) { events.push(row); });
    queries.tweets.on('row', function(row) { sentiment += row.sentiment; });

    queries.users.on('end', function() { finishRequest(done); });
    queries.messages.on('end', function() { finishRequest(done); });
    queries.events.on('end', function() { finishRequest(done); });
    queries.tweets.on('end', function() { finishRequest(done); });
  });
}

router.all('/', function(req, res, next) {
  if(req.user) {
    displayAdminPage(req, res);
  }
  else {
    res.render('admin-login', { title: 'Log In' });
  }
});

router.post('/login',
  passport.authenticate('local', { failureRedirect: '/'}),
  function(req, res) {
    res.redirect('/admin');
  }
);

module.exports = router;
