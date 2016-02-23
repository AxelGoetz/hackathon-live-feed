const socket = io();

// SOCKET Interaction
// ------------------------------------------
socket.on('tweet', function(tweet) {
  console.log(tweet);
  var link = 'http://twitter.com/' + tweet.user.screen_name + '/status/' + tweet.id_str;
  // if(!linkNotBroken(link)) {
  //   link = '#';
  // }
  tweet.user.profile_image_url = tweet.user.profile_image_url.replace('_normal', "");
  var tweetString = '<a class="tweet" href="' + link + '">' ;
  tweetString += '<img class="twitter_profile_img" src="' + tweet.user.profile_image_url + '">';
  tweetString += '<div class="tweet-text">';
  tweetString += '<div class="tweet-username">';
  tweetString += '<div>' + tweet.user.screen_name;
  tweetString += '<span class="symbol" style="padding-left: 0.5em;"> &#xe086 </span>';
  tweetString += '</div>';
  tweetString += '</div>';
  tweetString += '<div class="tweet-container">';
  tweetString += '<p>' + tweet.text + '</p>';
  tweetString += '</div>';
  if(tweet.entities.media.length > 0) {
      var index = 0;
      while(tweet.entities.media[index].type != "photo" && index < tweet.entities.media.length - 1) ++index;
      if(index < tweet.entities.media.length) {
          link = tweet.entities.media[index].media_url;
          // if(!linkNotBroken(link)) {
          //   link = '#';
          // }
          tweetString += '<img class="tweet-media" src="' + link + '">';
      }
  }
  tweetString += '</div>';
  tweetString += '</a>';
  $('#tweets').prepend(tweetString);
  checkLength();
});

socket.on('message', function(message) {
  var marqueetag = $('#marqueetext');
  marqueetag.text(marqueetag.text() + message + ' --- ');
});

socket.on('event', function(event) {
  console.log(event);
  var eventStr = '<div class="cd-timeline-block">';
  eventStr += '<div class="cd-timeline-img cd-location">';
  eventStr += '<img src="/images/cd-icon-location.svg">';
  eventStr += '</div>';
  eventStr += '<div class="cd-timeline-content">';
  eventStr += '<h2>' + event.title + '</h2>';
  eventStr += '<p>' + event.location + '</p>';
  eventStr += '<span class="cd-date">' + event.time + '</span>';
  eventStr += '<div class="cd-day">' + event.day + '</div>';
  eventStr += '</div>';
  eventStr += '</div>';

  eventStr = $(eventStr);
  lastDOMElement = null;
  $('.cd-timeline-block').each(function(index) {
    return findLastEvent(index, event, this);
  });
  if(lastDOMElement === null) {
    $('#cd-timeline').append(eventStr);
  } else {
    eventStr.insertBefore(lastDOMElement);
  }
});

socket.on('delete message', function(message) {
 var strings = $('#marqueetext').text().split(' --- ');
 console.log(strings);

 for(var i = 0; i < strings.length; i++) {
   if(strings[i] === message) {
     strings.splice(i, i+1);
     break;
   }
 }
 if(strings.length > 1) $('#marqueetext').text(strings.join(' --- ') + ' --- ');
 else $('#marqueetext').text('');
});

socket.on('delete event', function(event) {
  $('.cd-timeline-content').each(function(index) {
    var day = parseInt($(this).find(".cd-day:first").text());
    var time = $(this).find(".cd-date:first").text();
    var title = $(this).find("h2:first").text();
    var location = $(this).find("p:first").text();

    if(day == event.day && time == event.time && title == event.title && location == event.location) {
      $(this).parent().remove();
    }
  });
});

// Support functions
// ------------------------------------------

// Finds the DOM of the event that happens before
// the event that is being inserted
var lastDOMElement;

function findLastEvent(index, event, thisEvent) {
  var this1 = $(thisEvent).children(".cd-timeline-content:first");
  var aday = parseInt($(this1).children(".cd-day:first").text());
  if(event.day < aday) {
    lastDOMElement = thisEvent;
    return false;
  }
  else if(event.day > aday) {
    return true;
  }

  var atime = $(this1).children(".cd-date:first").text();
  for(var i = 0; i < 5; i += 3) {
    var compa = parseInt(atime.substr(i, 2));
    var compb = parseInt(event.time.substr(i, 2));
    if(compb < compa) {
      lastDOMElement = thisEvent;
      return false;
    }
    else if(compb > compa) {
      return true;
    }
  }

  for(i = 8; i < 10; i += 3) {            //We want to list longest events first
    var compa1 = parseInt(atime.substr(i, 2));
    var compb1 = parseInt(event.time.substr(i, 2));
    if(compb1 > compa1) {
      lastDOMElement = thisEvent;
      return false;
    }
    else if(compb1 < compa1) {
      return true;
    }
  }
}

var scrollToPosition = function() {
  var closestTime = 100000;
  var closest = null;
  $('.cd-date').each(function(index) {
    var finishTime = $(this).text().substr(8, 5);

    var currentDate = new Date();
    var date = new Date();
    date.setHours(parseInt(finishTime.substr(0, 2)));
    date.setMinutes(parseInt(finishTime.substr(3, 2)));

    var diffms = Math.abs(currentDate - date);
    var diffmin = Math.floor(diffms / 1000 / 60);

    var isDay1 = $(this).parent().find('.cd-day').text() == '1';
    // Scrolls to the correct event for the date
    if(diffmin < closestTime) {
      if(isDay1 && (currentDate.getDate() == 27)) {
        closestTime = diffmin;
        closest = this;
      }
      else if(!isDay1 && (currentDate.getDate() == 28)) {
        closestTime = diffmin;
        closest = this;
      }
    }
  });

  if (closest !== null) {
    var topPosition = $(closest).parent().parent().position().top + 80;
    $("#timeline-absolute-container").animate({scrollTop: topPosition}, 800);
  }
};

function checkLength() {
  if($('.tweet').length > 100) {
    $('.tweet:last').remove();
  }
}

function linkNotBroken(url){
    jQuery.ajax({
        url:      url,
        dataType: 'text',
        type:     'GET',
        complete:  function(xhr){
            return xhr.status !== 404;
        }
    });
}


$(document).ready(function() {
  setInterval(scrollToPosition, 10 * 60 * 1000);
  scrollToPosition();

  // $('.tweet').each(function(index) {
  //     if(!linkNotBroken($(this).attr('href'))) {
  //       $(this).attr('href', '#');
  //     }
  //     var tweet_media = $(this).find('.tweet-media');
  //     if(tweet_media !== null) {
  //       if(!linkNotBroken(tweet_media.attr('src'))) {
  //         tweet_media.attr('href', '#');
  //       }
  //     }
  // });
});
