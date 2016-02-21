var express = require('express');
var router = express.Router();
var crypto = require('crypto');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var sqlite3 = require('sqlite3').verbose()
var db = new sqlite3.Database('main.db');

function hashPassword(password, salt) {
  var hash = crypto.createHash('sha256');
  hash.update(password);
  hash.update(salt);
  return hash.digest('hex');
}

/* GET home page. */

router.all('/', function(req, res, next) {
  var lock = 0;
  var messages = [], events = [];

  var finishRequest = function() {
    lock++;
    if(lock == 2) {
      console.log(messages);
      res.render('index', { title: 'DSSC', messages: messages, events: events });
    }
  }

  db.all('SELECT * FROM messages', function(err, rows) {
    messages = rows;
    finishRequest();
  });

  db.all('SELECT * FROM events', function(err, rows) {
    events = rows;
    events.sort(function(a, b) {
      if(a.day != b.day) {
        return a.day - b.day;
      }
      for(var i = 0; i < 5; i += 3) {
        var compa = parseInt(a.time.substr(i, 2));
        var compb = parseInt(b.time.substr(i, 2));
        if(compa != compb) {
          return compa - compb;
        }
      }
      for(var i = 8; i < 10; i += 3) {            //We want to list longest events first
        var compa = parseInt(a.time.substr(i, 2));
        var compb = parseInt(b.time.substr(i, 2));
        if(compa != compb) {
          return compb - compa;
        }
      }
    });
    finishRequest();
  });
});



router.post('/users', function(req, res) {
  if(!req.user) {
    return;
  }
  var salt = new Date().toString();
  db.run('INSERT INTO users(username, password, salt) VALUES(?, ?, ?)', req.body.username, hashPassword(req.body.password, salt), salt);
  res.redirect('/admin');
});

router.post('/messages', function(req, res, next) {
  if(!req.user) {
    return;
  }
  db.run('INSERT INTO messages(message) VALUES(?)', req.body.message);
  io.emit('message', req.body.message);
  res.redirect('/admin');
});

router.post('/events', function(req, res, next) {
  if(!req.user) {
    return;
  }
  if(req.body.firsthour.length < 2) {
    req.body.firsthour = '0' + req.body.firsthour;
  }
  if(req.body.firstmin.length < 2) {
    req.body.firstmin = '0' + req.body.firstmin;
  }
  if(req.body.secondhour.length < 2) {
    req.body.secondhour = '0' + req.body.secondhour;
  }
  if(req.body.secondmin.length < 2) {
    req.body.secondmin = '0' + req.body.secondmin;
  }

  var time = req.body.firsthour + ':' + req.body.firstmin
  + ' - ' + req.body.secondhour + ':' + req.body.secondmin;
  db.run('INSERT INTO events(title, time, location, day) VALUES(?, ?, ?, ?)', req.body.title, time , req.body.location, req.body.day);
  io.emit('event', {title: req.body.title, time: time, location: req.body.location});
  res.redirect('/admin');
});


router.delete('/users/:id', function(req, res, next) {
  if(!req.user) {
    return;
  }
  req.params.id = parseInt(req.params.id);
  db.run('DELETE FROM users WHERE id=?', req.params.id);
})

router.delete('/messages/:id', function(req, res, next) {
  if(!req.user) {
    return;
  }
  req.params.id = parseInt(req.params.id);

  var message = "";
  db.all('SELECT * FROM messages where id=' + req.params.id , function(err, rows) {
    message = rows[0].message;
  });

  db.run('DELETE FROM messages WHERE id=?', req.params.id);

  io.emit('delete message', message);
})

router.delete('/events/:id', function(req, res, next) {
  if(!req.user) {
    return;
  }
  req.params.id = parseInt(req.params.id);

  var event;
  db.all('SELECT * FROM events where id=' + req.params.id , function(err, rows) {
    event = rows[0];
  });

  db.run('DELETE FROM events WHERE id=?', req.params.id);

  io.emit('delete event', event);
})

module.exports = router;
