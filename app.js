const express = require('express');
const path = require('path');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const session = require('express-session');
const Twit = require('twit');
// const Instagram = require('instagram-node-lib');
const crypto = require('crypto');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const keys = require('./keys.js');
const pg = require('pg');
const cs = process.env.DATABASE_URL || "postgres://atos:atos@localhost/livefeed";

const admin = require('./routes/admin');

const app = express();

const http = require('http').Server(app);
const io = require('socket.io')(http);
const Filter = require('bad-words');
const filter = new Filter();
const sentiment = require('sentiment');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

// Functions for password hashing and logging in
// -----------------------------------------------------------------

function initializeDB() {
  pg.connect(cs, function(err, client, done) {
    if(err) {
      return done();
    }
    var queries = 4;
    function checkCloseConnection() {
        if(queries == 1) {
            done();
        }
        queries--;
    }

    var actqueries = [];

    actqueries.push(client.query('CREATE TABLE IF NOT EXISTS users ("id" SERIAL PRIMARY KEY, "username" TEXT, "password" TEXT, "salt" TEXT)'));
    actqueries.push(client.query('CREATE TABLE IF NOT EXISTS messages ("id" SERIAL PRIMARY KEY, "message" TEXT)'));
    actqueries.push(client.query('CREATE TABLE IF NOT EXISTS events ("id" SERIAL PRIMARY KEY, "title" TEXT, "time" TEXT, "location" TEXT, "day" INTEGER)'));
    actqueries.push(client.query('CREATE TABLE IF NOT EXISTS tweets ("id" SERIAL PRIMARY KEY, "id_str" TEXT, "screen_name" TEXT, "profile_image_url" TEXT, "text" TEXT, "media_url" TEXT, "type" TEXT, "datetime" TIMESTAMP, "sentiment" INTEGER)'));

    actqueries.forEach(function(e, i, a) {
        e.on('end', checkCloseConnection);
    });
  });
}

initializeDB();

function hashPassword(password, salt) {
  var hash = crypto.createHash('sha256');
  hash.update(password);
  hash.update(salt);
  return hash.digest('hex');
}

passport.use(new LocalStrategy(function(username, password, done) {
  pg.connect(cs, function(err, client, connect_done) {
    if(err) {
      connect_done();
      return done(null, false);
    }
    var results = [];
    var query = client.query("SELECT salt FROM users WHERE username=$1", [username]);
    query.on('row', function(row) { results.push(row); });
    query.on('end', function() {
      if(results.length === 0) {
        connect_done();
        return done(null, false);
      }
      var otherResults = [];
      var hash = hashPassword(password, results[0].salt);
      var otherQuery = client.query("SELECT username, id FROM USERS WHERE username=$1 AND password=$2", [username, hash]);
      otherQuery.on('row', function(row) { otherResults.push(row); });
      otherQuery.on('end', function() {
        if(otherResults.length === 0) {
          connect_done();
          return done(null, false);
        }
        connect_done();
        return done(null, otherResults[0]);
      });
    });
  });
})
);

passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  if(id === parseInt(id, 10)) {
    pg.connect(cs, function(err, client, connect_done) {
      if(err) {
        connect_done();
        done(new Error('User ' + id + ' does not exist'));
        console.log(err);
      }
      var results = [];
      var query = client.query('SELECT * FROM users WHERE id=$1', [id]);
      query.on('row', function(row) { results.push(row); });
      query.on('end', function() {
        if(results.length === 0) {
          connect_done();
          return done(new Error('User ' + id + ' does not exist'));
        }
        connect_done();
        done(null, results[0]);
      });
    });
  }
});


// pg.connect(cs, function(err, client, done) {
//   if(err) {
//     done();
//     console.log(err);
//   }
//   var salt = new Date().toString();
//   var query = client.query('INSERT INTO users(username, password, salt) VALUES($1, $2, $3)', ['test', hashPassword('test', salt), salt]);
//   query.on('end', done);
// });



// ROUTING
// -----------------------------------------------------------------

app.all('/', function(req, res, next) {
  var lock = 0;
  var messages = [], events = [];

  var finishRequest = function(done) {
    lock++;
    if(lock == 2) {
      done();
      res.render('index', { title: 'HackLondon', messages: messages, events: events, tweets: tweets });
    }
  };

  pg.connect(cs, function(err, client, done) {
    if(err) {
      done(null, false);
      console.log(err);
      return res.status(500).json({success: false, data: err});
    }
    var queries = {};

    queries.messages = client.query('SELECT * FROM messages');
    queries.events = client.query('SELECT * FROM events');

    queries.messages.on('row', function(row) { messages.push(row); });
    queries.events.on('row', function(row) { events.push(row); });

    queries.messages.on('end', function() { finishRequest(done); });
    queries.events.on('end', function() {
      events.sort(function(a, b) {
        if(a.day != b.day) return a.day - b.day;
        for(var i = 0; i < 5; i+= 3) {
          var compa = parseInt(a.time.substr(i, 2));
          var compb = parseInt(b.time.substr(i, 2));
          if(compa != compb) return compa - compb;
        }
        for(i = 8; i < 10; i++) {
          var compa1 = parseInt(a.time.substr(i, 2));
          var compb1 = parseInt(b.time.substr(i, 2));
          if(compb1 != compa1) return compb1 - compa1;
        }
        return 0;
      });
      finishRequest(done);
    });
  });
});

// POST Requests for admin
// -----------------------------------------------------------------

app.post('/users', function(req, res) {
  if(!req.user) {
    res.redirect('/');
    return;
  }
  var salt = new Date().toString();
  pg.connect(cs, function(err, client, done) {
    if(err) {
      done();
      return res.status(500).json({ success: false, data: err });
    }
    var query = client.query('INSERT INTO users(username, password, salt) VALUES($1, $2, $3)', [req.body.username, hashPassword(req.body.password, salt), salt]);
    query.on('end', function() { done(); res.redirect('/admin'); });
  });
});

app.post('/messages', function(req, res, next) {
  if(!req.user) {
    res.redirect('/');
    return;
  }
  pg.connect(cs, function(err, client, done) {
    if(err) {
      done();
      return res.status(500).json({ success: false, data: err });
    }
    var query = client.query('INSERT INTO messages(message) VALUES($1)', [req.body.message]);
    query.on('end', function() { done(); io.emit('message', req.body.message); res.redirect('/admin'); });
  });
});

app.post('/events', function(req, res, next) {
  if(!req.user) {
    res.redirect('/');
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

  var time = req.body.firsthour + ':' + req.body.firstmin +
   ' - ' + req.body.secondhour + ':' + req.body.secondmin;

  pg.connect(cs, function(err, client, done) {
    if(err) {
      done();
      console.log(err);
      return res.status(500).json({ success: false, data: err });
    }
    var query = client.query('INSERT INTO events(title, time, location, day) VALUES($1, $2, $3, $4)', [req.body.title, time, req.body.location, req.body.day]);
    query.on('end', function() {
      done();
      io.emit('event', {title: req.body.title, time: time, location: req.body.location, day: req.body.day });
      res.redirect('/admin');
    });
  });

});

// app.post('/hashtag', function(req, res, next) {
//   if(!req.user) {
//     return;
//   }
//   hashtag = req.params.hashtag;
//   stream = T.stream('statuses/filter', { track: '#' + hashtag, language: 'en' });

//   io.emit('new hashtag', hashtag);
// });

app.delete('/users/:id', function(req, res, next) {
  var id = req.params.id;
  if(!req.user) {
    res.redirect('/');
    return;
  }
  if(req.user.id == id) {
    req.logout();
    res.redirect('/admin'); // Cannot delete own user
    return;
  }
  try {
    id = parseInt(id);
    pg.connect(cs, function(err, client, done) {
      if(err) {
        done();
        return res.status(500).json({ success: false, data: err });
      }
      var result = 0;
      var checkQuery = client.query('SELECT COUNT(*) FROM users');
      checkQuery.on('row', function(row) { result = row; });
      checkQuery.on('end', function() {
        if(result.count === 0) {
          res.redirect('/admin');
          return;
        }
        var query = client.query('DELETE FROM users WHERE id=$1', [id]);
        query.on('end', done);
      });
    });
  }
  catch(e) {
    console.log("Could not delete user");
  }

  res.redirect('/admin');
});

app.delete('/messages/:id', function(req, res, next) {
  if(!req.user) {
    res.redirect('/');
    return;
  }
  try {
    var id = parseInt(req.params.id);
    pg.connect(cs, function(err, client, done) {
        if(err) {
          done();
          return res.status(500).json({ success: false, data: err });
        }
        var results = [];
        var query = client.query('SELECT * FROM messages WHERE id=$1', [id]);
        query.on('row', function(row) { results.push(row); });
        query.on('end', function() {
          if(results.length !== 0) {
            var message = results[0].message;

            var otherQuery = client.query('DELETE FROM messages WHERE id=$1', [id]);
            otherQuery.on('end', function() {
              done();
              io.emit('delete message', message);
              res.redirect('/admin');
            });
          }
          else done();
        });
    });
  }
  catch(e) {
    console.log("Could not delete message");
  }
});

app.delete('/events/:id', function(req, res, next) {
  if(!req.user) {
    res.redirect('/');
    return;
  }
  try {
    var id = parseInt(req.params.id);
    pg.connect(cs, function(err, client, done) {
      if(err) {
        done();
        return res.status(500).json({ success: false, data: err });
      }
      var results = [];
      var query = client.query('SELECT * FROM events WHERE id=$1', [id]);
      query.on('row', function(row) { results.push(row); });
      query.on('end', function() {
        if(results.length > 0) {
          var otherQuery = client.query('DELETE FROM events WHERE id=$1', [id]);
          otherQuery.on('end', function() {
            done();
            io.emit('delete event', results[0]);
            res.redirect('/admin');
         });
        }
        else done();
      });
    });
  }
  catch(e) {
    console.log("Could not delete event");
  }
});

app.use('/admin', admin);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});

console.log("Listening on 80");
http.listen(process.env.PORT || 80);
// http.listen(2000);
getTweetsFromDB();


// Instagram.set('client_id', keys.instagram.client_id);
// Instagram.set('client_secret', keys.instagram.client_secret);
// We are currently not using instagram because in sandbox mode we cannot access public content
// So if we want to use instagram, we will have to get a valid callback url
// and we will have to submit our app through them

// If the application gets reset, all of the tweets are gone
// So we also store them in the database and fetch them
// if we notice that we have no tweets in memory
function getTweetsFromDB() {
  pg.connect(cs, function(err, client, done) {
    if(err) {
      done();
      console.log(err);
      return;
    }
    var results = [];
    var query = client.query('SELECT * FROM tweets ORDER BY datetime DESC LIMIT 100');
    query.on('row', function(row) { results.push(row); });
    query.on('end', function() {
      tweets = [];
      results.forEach(function(e, i, a) {
        var tweet = {user: {}, entities: {media: []}};
        tweet.sentiment = e.sentiment;
        tweet.user.screen_name = e.screen_name;
        tweet.user.profile_image_url = e.profile_image_url;
        tweet.text = e.text;
        tweet.id_str = e.id_str;
        if(e.media_url === null) e.media_url = '';
        if(e.type === null) e.type = '';
        tweet.entities.media.push({media_url: e.media_url, type: e.type});

        tweets.push(tweet);
      });
      done();
    });
  });
}

function getFirstMediaURL(tweet) {
  var result = [null, null];
  if(tweet !== null && tweet.entities !== undefined && tweet.entities.media !== undefined &&
     tweet.entities.media.length > 0) {
      var index = 0;
      while(tweet.entities.media[index].type != "photo" && index < tweet.entities.media.length - 1) ++index;
      if(index < tweet.entities.media.length) {
        result = [tweet.entities.media[index].media_url, tweet.entities.media[index].type];
      }
  }
  return result;
}

function addTweetToDB(tweet) {
  var media_url = getFirstMediaURL(tweet);
  pg.connect(cs, function(err, client, done) {
    if(err) {
      done();
      console.log(err);
    }
    var query = client.query('INSERT INTO tweets(id_str, screen_name, profile_image_url, text, type, media_url, datetime, sentiment)' +
    'VALUES($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)',
    [tweet.id_str, tweet.user.screen_name, tweet.user.profile_image_url, tweet.text, media_url[1], media_url[0], tweet.sentiment]);

     query.on('end', function() {
       done();
     });
  });
  return media_url;
}

var T = [];
var tweets = [];
var hashtags = ['hacklondon', 'hl2016'];
var streams = [];
function emitTweet(tweet) {
  tweet.user.profile_image_url = tweet.user.profile_image_url.replace('_normal', "");
  if(tweets.length === 0) {
    getTweetsFromDB();
  }
  tweet.sentiment = sentiment(tweet.text).score;
  tweet.text = filter.clean(tweet.text);
  var media_url = addTweetToDB(tweet);
  if(media_url[0] === null && media_url[1] === null) {
    tweet.entities.media = [{type: '', media_url: ''}];
  }
  tweets.unshift(tweet);
  if(tweets.length > 100) {
    tweets.splice(99, 1);
  }
  io.emit('tweet', tweet);
}

for(var i = 0; i < 2; i++) {
  T.push(new Twit(keys.twitter[i]));
  streams.push(T[i].stream('statuses/filter', { track: '#' + hashtags[i] }));
  streams[i].on('tweet', emitTweet);
}


// var T = new Twit(keys.twitter[0]);
// var hashtag = 'DSSC';
// var tweets = [];
// var stream = T.stream('statuses/filter', { track: '#' + hashtag, language: 'en' });
//
// stream.on('tweet', function (tweet) {
//   tweets.unshift(tweet);
//   if(tweets.length > 100) {
//     tweets.splice(99, 1);
//   }
//   io.emit('tweet', tweet);
// });



module.exports = app;
