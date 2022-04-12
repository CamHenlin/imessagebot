var sqlite3 = require("sqlite3").verbose();
var fs = require("fs");
var dir = process.env.HOME + "/Library/Messages/";
var file = process.env.HOME + "/Library/Messages/chat.db";
var exec = require("exec");
var weather = require("weather-js");
var glob = require("glob");
var Twitter = require("twitter");
var querystring = require("querystring");
var googleIt = require("google-it");
var ddg = require("ddg");
var urban = require("urban");
var eightball = require("8ball");
var Quote = require("inspirational-quotes");
var request = require("request");
var request = request.defaults({ jar: true });
var imessagemodule = require("iMessageModule");

require("dotenv").config();
var client = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

var saAccount = {
  username: "",
  password: "",
};

var giphyApiKey = ``;

var main_chat_title = process.env.GROUPCHAT_TITLE || "";

var exists = fs.existsSync(file);

// discover if we are running and old version of OS X or not
var OLD_OSX = false;
var os = require("os");
if (os.release().split(".")[0] === "12") {
  // 12 is 10.8 Mountain Lion, which does not have named group chats
  OLD_OSX = true;
}

// discover whether the keyboard setting "Full Keyboard Access" is set to
// "Text boxes and lists only" -- error or 1 or less
// "All controls" (takes 2 tabs instead of one switching between elements in Messages.app) -- 2 or more
var FULL_KEYBOARD_ACCESS = false; // false for text boxes and lists, true for all controls
exec(
  "defaults read NSGlobalDomain AppleKeyboardUIMode",
  function (err, out, code) {
    if (err instanceof Error) {
      // return because we already have false set and error means text boxes and lists only
      return;
    }

    if (parseInt(out) > 1) {
      FULL_KEYBOARD_ACCESS = true;
    }
  }
);

// read the Messages.app sqlite db
var db = new sqlite3.Database(file);

// sean fix for db read being slow with sqlite3 maybe it works?
db.run("PRAGMA journal_mode = WAL;");

// internally used variables
var LAST_SEEN_ID = 0;
var sending = false;

// stream status updates if they mention our user
// update with @username
client.stream(
  "statuses/filter",
  { track: "@typicalyospos" },
  function (stream) {
    stream.on("data", function (tweet) {
      // insert the chat that you want to send messages to here
      var chatter = main_chat_title;
      console.log(
        chatter,
        "@" + tweet.user.screen_name + " tweeted at us: " + tweet.text
      );
      sendMessage(
        chatter,
        "@" + tweet.user.screen_name + " tweeted at us: " + tweet.text,
        true
      );
    });

    stream.on("error", function (error) {
      console.log(error);
    });
  }
);

// login to SA
if (saAccount.username !== "" && saAccount.password !== "") {
  request.jar();

  var post_data = {
    action: "login",
    username: saAccount.username,
    password: saAccount.password,
    next: "%2F",
  };

  request.post(
    { url: "http://forums.somethingawful.com/account.php", form: post_data },
    function (error, response, body) {
      if (!error && response.statusCode === 200) {
        //console.log(body);
      } else {
        //console.log(response);
        //console.log(body);
        //console.log(error);
      }
    }
  );
}

function getPostKeys(threadId, callback) {
  var formKey = "";
  var formCookie = "";
  var formKeyRegex = /\"formkey\"\ value=\"[a-z0-9]+\"/;
  var formCookieRegex = /\"form_cookie\"\ value=\"[a-z0-9]+\"/;
  var valueRegex = /=\"[a-z0-9]+/;

  request(
    {
      url:
        "http://forums.somethingawful.com/newreply.php?action=newreply&threadid=" +
        threadId,
    },
    function (error, response, body) {
      formKey = formKeyRegex.exec(body);
      formCookie = formCookieRegex.exec(body);

      console.log(formKey);
      console.log(formCookie);

      if (!formKey) {
        console.log(`no form, sorry`);

        return callback();
      }

      formKey = formKey[0];
      formKey = valueRegex.exec(formKey)[0].split('"')[1];
      formCookie = formCookie[0];
      formCookie = valueRegex.exec(formCookie)[0].split('"')[1];

      callback({
        key: formKey,
        cookie: formCookie,
      });
    }
  );
}

function getThreadKeys(callback) {
  var formKey = "";
  var formCookie = "";
  var formKeyRegex = /\"formkey\"\ value=\"[a-z0-9]+\"/;
  var formCookieRegex = /\"form_cookie\"\ value=\"[a-z0-9]+\"/;
  var valueRegex = /=\"[a-z0-9]+/;

  request(
    {
      url: "http://forums.somethingawful.com/newthread.php?action=newthread&forumid=219",
    },
    function (error, response, body) {
      formKey = formKeyRegex.exec(body);
      formCookie = formCookieRegex.exec(body);

      formKey = formKey[0];
      formKey = valueRegex.exec(formKey)[0].split('"')[1];
      formCookie = formCookie[0];
      formCookie = valueRegex.exec(formCookie)[0].split('"')[1];

      callback({
        key: formKey,
        cookie: formCookie,
      });
    }
  );
}

function saNewThread(threadTitle, threadText, callback) {
  getThreadKeys(function (keyAndCookie) {
    var post_data = {
      forumid: "219",
      action: "postthread",
      formkey: keyAndCookie.key,
      form_cookie: keyAndCookie.cookie,
      subject: threadTitle,
      iconid: 0,
      message: threadText,
      parseurl: "yes",
      bookmark: "no",
      disablesmilies: "no",
      signature: "yes",
      MAX_FILE_SIZE: "2097152",
      attachment: "",
      submit: "Submit New Thread",
    };

    request.post(
      {
        url: "http://forums.somethingawful.com/newthread.php",
        form: post_data,
      },
      function (error, response, body) {
        if (!error && response.statusCode === 200) {
          //console.log(body);
        } else {
          //console.log(response);
          //console.log(body);
          //console.log(error);
        }

        callback();
      }
    );
  });
}

function saNewPostInThread(threadUrl, postText, callback) {
  threadUrl = threadUrl.split("threadid=")[1];
  if (threadUrl.indexOf("&") > -1) {
    threadUrl.split("&")[0];
  }

  var https = require("follow-redirects").https;

  getPostKeys(threadUrl, function (keyAndCookie) {
    var post_data = {
      action: "postreply",
      threadid: threadUrl,
      formkey: keyAndCookie.key,
      form_cookie: keyAndCookie.cookie,
      message: postText,
      parseurl: "yes",
      bookmark: "no",
      disablesmilies: "no",
      signature: "yes",
      MAX_FILE_SIZE: "2097152",
      attachment: "",
      submit: "Submit Reply",
    };

    request.post(
      { url: "http://forums.somethingawful.com/newreply.php", form: post_data },
      function (error, response, body) {
        if (!error && response.statusCode === 200) {
          //console.log(body);
        } else {
          //console.log(response);
          //console.log(body);
          //console.log(error);
        }

        callback();
      }
    );
  });
}

function googleSearch(rowText, chatter, isGroupChat) {
  var query = rowText.substring(3);
  googleIt({ query: query })
    .then((res) => {
      console.log(chatter, `${res[0].link}`, isGroupChat);
      sendMessage(chatter, `${res[0].link}`, isGroupChat);
    })
    .catch((e) => {
      console.error(e);
    });
}

function weatherSearch(rowText, chatter, isGroupChat) {
  console.log("weather for " + rowText.substring(3));
  weather.find(
    { search: rowText.substring(3), degreeType: "F" },
    function (err, result) {
      if (err || !result) {
        console.log("no weather for " + +rowText.substring(3));
        return;
      }

      var wea = {
        high: result[0].forecast[0].high,
        low: result[0].forecast[0].low,
        temp: result[0].current.temperature,
        skytext: result[0].current.skytext,
      };

      console.log(
        chatter,
        "w: " +
          rowText.substring(3) +
          ": current: " +
          wea.temp +
          " and " +
          wea.skytext +
          " high: " +
          wea.high +
          " low: " +
          wea.low
      );
      sendMessage(
        chatter,
        "w: " +
          rowText.substring(3) +
          ": current: " +
          wea.temp +
          " and " +
          wea.skytext +
          " high: " +
          wea.high +
          " low: " +
          wea.low,
        isGroupChat
      );
    }
  );
}

function tweetSearch(rowText, chatter, isGroupChat) {
  console.log("tweet for " + rowText.substring(3));
  client.get(
    "search/tweets",
    { q: rowText.substring(3) },
    function (error, tweets, response) {
      if (error) {
        return;
      }

      var tweet = tweets.statuses[0];
      console.log(tweets.statuses);
      console.log(tweet);
      if (!tweet) {
        console.log(
          chatter,
          "t: " + rowText.substring(3) + ": no tweets found."
        );
        sendMessage(
          chatter,
          "t: " + rowText.substring(3) + ": no tweets found.",
          isGroupChat
        );
      } else {
        console.log(tweet.text);
        console.log(
          chatter,
          "t: " +
            rowText.substring(3) +
            ": tweet: " +
            tweet.text +
            " user: " +
            tweet.user.screen_name
        );
        sendMessage(
          chatter,
          "t: " +
            rowText.substring(3) +
            ": tweet: " +
            tweet.text +
            " user: " +
            tweet.user.screen_name,
          isGroupChat
        );
      }
      return;
    }
  );
}

function latestTrump(rowText, chatter, isGroupChat) {
  client.get(
    "statuses/user_timeline",
    { screen_name: `realDonaldTrump`, count: 1 },
    (err, tweet, res) => {
      if (err) console.log(err);
      // console.log(`${Object.keys(tweet[0])}`)
      // console.log(`${JSON.stringify(tweet[0].entities.urls[0])}`)
      const trumpURL = tweet[0].entities.urls[0].expanded_url;
      console.log(chatter, `trump: ${trumpURL}`, isGroupChat);
      sendMessage(chatter, `trump: ${trumpURL}`, isGroupChat);
    }
  );
}

function tweetStatus(rowText, chatter, isGroupChat) {
  console.log("tweet " + rowText.split(".tweet ")[1]);
  client.post(
    "statuses/update",
    { status: rowText.split(".tweet ")[1].substring(0, 140) },
    function (error, tweet, response) {
      if (error) {
        console.log(error);
        console.log(response);
        sendMessage(chatter, "error tweeting: " + error, isGroupChat);
        return;
      }

      console.log(tweet);

      console.log(
        chatter,
        "tweeted: " +
          rowText.split(".tweet ")[1].substring(0, 140) +
          ", url: https://twitter.com/typicalyospos/status/" +
          tweet.id_str
      );
      sendMessage(
        chatter,
        "https://twitter.com/typicalyospos/status/" + tweet.id_str,
        isGroupChat
      );
      return;
    }
  );
}

function tweetReply(rowText, chatter, isGroupChat) {
  var replyToStatus = rowText.split("status/")[1].split(" ")[0];
  var reply = rowText.split(replyToStatus)[1];
  console.log("tweet " + rowText.split(".reply ")[1]);
  client.post(
    "statuses/update",
    { in_reply_to_status_id: replyToStatus, status: reply },
    function (error, tweet, response) {
      if (error) {
        console.log(error);
        console.log(response);
        sendMessage(chatter, "error tweeting: " + error, isGroupChat);
        return;
      }

      console.log(tweet);

      console.log(
        chatter,
        "tweeted: " +
          reply +
          " in response to " +
          replyToStatus +
          ", url: https://twitter.com/typicalyospos/status/" +
          tweet.id_str
      );
      sendMessage(
        chatter,
        "tweeted: " +
          reply +
          " in response to " +
          replyToStatus +
          ", url: https://twitter.com/typicalyospos/status/" +
          tweet.id_str,
        isGroupChat
      );
      return;
    }
  );
}

function twitterFollow(rowText, chatter, isGroupChat) {
  console.log("follow " + rowText.split(".follow ")[1]);
  client.post(
    "friendships/create",
    {
      screen_name: rowText.split(".follow ")[1].substring(0, 140),
      follow: true,
    },
    function (error, tweet, response) {
      if (error) {
        console.log(error);
        console.log(response);
        sendMessage(
          chatter,
          "error following: " + JSON.stringify(error),
          isGroupChat
        );
        return;
      }

      console.log(tweet);

      console.log(
        chatter,
        "followed: " + rowText.split(".follow ")[1].substring(0, 140)
      );
      sendMessage(
        chatter,
        "followed: " + rowText.split(".follow ")[1].substring(0, 140),
        isGroupChat
      );
      return;
    }
  );
}

function favoriteTweet(rowText, chatter, isGroupChat) {
  console.log("fav " + rowText.split(".fav ")[1]);
  client.post(
    "favorites/create",
    { id: rowText.split("status/")[1] },
    function (error, tweet, response) {
      if (error) {
        console.log(error);
        console.log(response);
        sendMessage(
          chatter,
          "error favoriting: " + JSON.stringify(error),
          isGroupChat
        );
        return;
      }

      console.log(tweet);

      console.log(chatter, "favorited: " + rowText.split("status/")[1]);
      sendMessage(
        chatter,
        "favorited: " + rowText.split("status/")[1],
        isGroupChat
      );
      return;
    }
  );
}

function urbandictionarySearch(rowText, chatter, isGroupChat) {
  console.log("urbandictionary for for " + rowText.substring(3));
  urban(rowText.substring(3)).first(function (data) {
    console.log(data);
    if (!data) {
      console.log(
        chatter,
        "no urbandictionary entry for: " + rowText.substring(3)
      );
      sendMessage(
        chatter,
        "no urbandictionary entry for: " + rowText.substring(3),
        isGroupChat
      );
      return;
    }
    console.log(
      chatter,
      "urbandictionary entry for: " +
        rowText.substring(3) +
        ": " +
        data.definition +
        " url: " +
        data.permalink
    );
    sendMessage(
      chatter,
      "urbandictionary entry for: " +
        rowText.substring(3) +
        ": " +
        data.definition +
        " url: " +
        data.permalink,
      isGroupChat
    );
  });
}

function eightBall(rowText, chatter, isGroupChat) {
  var answer = eightball();
  console.log("eightball for " + rowText.substring(3));
  console.log("eight: " + answer);
  sendMessage(chatter, "eight: " + answer, isGroupChat);
}

function inspirationalQuote(rowText, chatter, isGroupChat) {
  var randomQuote = Quote.getRandomQuote();
  console.log("random quote: " + randomQuote);
  sendMessage(chatter, "quote: " + randomQuote);
}

function giphySearch(rowText, chatter, isGroupChat) {
  let url = `http://api.giphy.com/v1/gifs/search?q=${rowText.substring(
    3
  )}&api_key=${giphyApiKey}`;
  request.get({ url }, function (err, res, body) {
    if (!err && res.statusCode === 200) {
      var results = JSON.parse(body);
      // console.log(Object.keys(results.data[0]))
      console.log(`giphy for ${rowText.substring(3)}`);
      console.log(`giphy: ${results.data[0].url}`);
      sendMessage(chatter, `giphy: ${results.data[0].url}`, isGroupChat);
    } else {
      console.log(err);
      //console.log(response);
      //console.log(body);
      //console.log(error);
    }
  });
}

function getFortune(rowText, chatter, isGroupChat) {
  let url = `http://fortunecookieapi.herokuapp.com/v1/cookie`;
  request.get({ url }, (err, res, body) => {
    if (!err && res.statusCode === 200) {
      var result = JSON.parse(body);
      // console.log(Object.keys(result[0]))
      console.log(`fortune: ${result[0].fortune.message}`);
      sendMessage(
        chatter,
        `fortune: ${
          result[0].fortune.message
        } \n lucky numbers: ${JSON.stringify(
          result[0].lotto.numbers
        )} \n english:${result[0].lesson.english} chinese:${
          result[0].lesson.chinese
        } prounciation: ${result[0].lesson.pronunciation}`,
        isGroupChat
      );
    } else {
      console.log(err);
    }
  });
}

function getCommands(rowText, chatter, isGroupChat) {
  const commandList = [
    {
      name: "g",
      description: ".g <search term> - returns first result on google",
    },
    {
      name: "tweet",
      description: ".tweet <message> - posts a tweet on the twittersphere",
    },
    {
      name: "twimg",
      description:
        ".twimg - posts the last image posted in chat (non-url) to twitter",
    },
    {
      name: "wea",
      description: ".wea <zipcode> - returns weather dipshit",
    },
    {
      name: "8",
      description: ".8 returns magic eight ball",
    },
    {
      name: "giphy",
      description: ".giphy <term> - gets a gif",
    },
    {
      name: "u",
      description: ".u <term> - gets urbandictionary result",
    },
    {
      name: "quote",
      description: ".quote - gets a random quote",
    },
  ];

  let message = `commands: \n`;
  for (var i = 0; i < commandList.length; i++) {
    message += `.${commandList[i].name} - ${commandList[i].description}\n`;
  }
  console.log(`sending ${message} to ${chatter}`);
  sendMessage(chatter, message, isGroupChat);
}

function sendiMessage(rowText, chatter, isGroupChat) {
  var text = rowText.substring(3);
  var sendTo = text.split(" ")[0];
  text = rowText.substring(sendTo.length + 4);
  sendMessage(sendTo, chatter + " says: " + text, true);
  setTimeout(
    function () {
      console.log(chatter, "sent: " + text + " to: " + sendTo);
      sendMessage(chatter, "sent: " + text + " to: " + sendTo, isGroupChat);
    }.bind(this),
    3000
  );
}

function SANewThread(rowText, chatter, isGroupChat) {
  var regex = /\[[a-z0-9\s]+\]/;
  console.log(rowText);
  console.log(regex.exec(rowText));
  var threadTitle = regex.exec(rowText);
  console.log(threadTitle);
  var threadText = rowText.substring(
    parseInt(threadTitle.index) + parseInt(threadTitle[0].length),
    rowText.length
  );
  threadTitle = threadTitle[0].substring(1, threadTitle[0].length - 1);

  saNewThread(threadTitle, threadText, function () {
    console.log(
      chatter,
      "I did something on the forums! you better go check: http://forums.somethingawful.com/forumdisplay.php?forumid=219"
    );
    sendMessage(
      chatter,
      "I did something on the forums! you better go check: http://forums.somethingawful.com/forumdisplay.php?forumid=219",
      isGroupChat
    );
  });
}

function SAReplyThread(rowText, chatter, isGroupChat) {
  console.log(rowText);

  var regex = /[a-z]+[:.].*?(?=\s)/;
  var threadUrl = regex.exec(rowText);
  console.log("url: " + threadUrl);
  console.log("url: " + threadUrl.index);
  console.log("url: " + threadUrl.length);
  console.log(
    "url: " + parseInt(threadUrl.index) + parseInt(threadUrl[0].length)
  );
  var postText = rowText.substring(
    parseInt(threadUrl.index) + parseInt(threadUrl[0].length),
    rowText.length
  );
  var threadUrl = threadUrl[0];
  console.log("txt: " + postText);

  saNewPostInThread(threadUrl, postText, function () {
    console.log(
      chatter,
      "I did something on the forums! you better go check: http://forums.somethingawful.com/forumdisplay.php?forumid=219"
    );
    sendMessage(
      chatter,
      "I did something on the forums! you better go check: http://forums.somethingawful.com/forumdisplay.php?forumid=219",
      isGroupChat
    );
  });
}

function getLatestImage(chatter, callback) {
  var sql =
    "SELECT attachment.filename as filename FROM message LEFT OUTER JOIN chat ON chat.room_name = message.cache_roomnames LEFT OUTER JOIN handle ON handle.ROWID = message.handle_id LEFT OUTER JOIN message_attachment_join ON message_attachment_join.message_id = message.ROWID LEFT OUTER JOIN attachment ON attachment.ROWID = message_attachment_join.attachment_id WHERE chat.display_name = '" +
    chatter +
    "' AND attachment.filename IS NOT NULL ORDER BY message.date DESC LIMIT 1";
  db.serialize(
    function () {
      db.all(
        sql,
        function (err, rows) {
          if (rows) {
            console.log(rows);
            callback(rows[0].filename);
          }
        }.bind(this)
      );
    }.bind(this)
  );
}

function tweetLatestImage(rowText, chatter, isGroupChat) {
  console.log("tweet image text " + rowText.split(".twimg ")[1]);

  getLatestImage(
    chatter,
    function (filename) {
      console.log("filename!");
      console.log(filename);
      // Make post request on media endpoint. Pass file data as media parameter
      client.post(
        "media/upload",
        {
          media: require("fs").readFileSync(
            filename.replace("~", process.env.HOME)
          ),
        },
        function (error, media, response) {
          if (error) {
            console.log("error");
            console.log(error);
          }

          // If successful, a media object will be returned.
          console.log(media);

          var postStatus = rowText.split(".twimg ")[1]
            ? rowText.split(".twimg ")[1].substring(0, 140)
            : "";

          // Lets tweet it
          var status = {
            status: postStatus,
            media_ids: media.media_id_string, // Pass the media id string
          };

          client.post(
            "statuses/update",
            status,
            function (error, tweet, response) {
              if (error) {
                console.log(error);
                console.log(response);
                sendMessage(chatter, "error tweeting: " + error, isGroupChat);
                return;
              }

              console.log(tweet);

              console.log(
                chatter,
                "tweeted: " +
                  postStatus +
                  " with image, url: https://twitter.com/typicalyospos/status/" +
                  tweet.id_str
              );
              sendMessage(
                chatter,
                "https://twitter.com/typicalyospos/status/" + tweet.id_str,
                isGroupChat
              );
              return;
            }
          );
        }.bind(this)
      );
    }.bind(this)
  );
}

function checkMessageText(messageId) {
  var SQL =
    "SELECT DISTINCT message.ROWID, handle.id, message.text, message.is_from_me, message.date, message.date_delivered, message.date_read, chat.chat_identifier, chat.display_name FROM message LEFT OUTER JOIN chat ON chat.room_name = message.cache_roomnames LEFT OUTER JOIN handle ON handle.ROWID = message.handle_id WHERE message.service = 'iMessage' AND message.ROWID = " +
    messageId +
    " ORDER BY message.date DESC LIMIT 500";
  // if (OLD_OSX) {
  // 	SQL = "SELECT DISTINCT message.ROWID, handle.id, message.text, message.is_from_me, message.date, message.date_delivered, message.date_read FROM message LEFT OUTER JOIN chat LEFT OUTER JOIN handle ON handle.ROWID = message.handle_id WHERE message.service = 'iMessage' AND message.ROWID = " + messageId + " ORDER BY message.date DESC LIMIT 500";
  // }

  db.serialize(function () {
    var arr = [];
    db.all(SQL, function (err, rows) {
      if (err) throw err;
      // should only be one result since we are selecting by id but I am looping anyways
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        console.log(row);
        if (row.is_from_me || !row || !row.text) {
          return;
        }

        var chatter;
        var isGroupChat = false;
        if (row.chat_identifier === null) {
          chatter = row.id;
        } else if (
          arr.indexOf(row.chat_identifier) < 0 &&
          arr.indexOf(row.display_name + "-" + row.chat_identifier) < 0
        ) {
          if (row.chat_identifier.indexOf("chat") > -1) {
            if (
              (row.display_name &&
                row.display_name !== "" &&
                typeof row.display_name !== "undefined") ||
              OLD_OSX
            ) {
              chatter = row.display_name;
              isGroupChat = true;
            }
          } else {
            if (
              row.chat_identifier &&
              row.chat_identifier !== "" &&
              typeof row.chat_identifier !== "undefined"
            ) {
              chatter = row.chat_identifier;
              isGroupChat = true;
            }
          }
        }

        var rowText = row.text;
        // rowText = rowText.toLowerCase();
        if (rowText.split(" ").length < 1 && rowText.indexOf(".") === 0) {
          console.log("dropping: " + rowText);
          return;
        }

        // check for google search:
        if (rowText.split(" ", 1)[0] === ".g") {
          googleSearch(rowText, chatter, isGroupChat);
        } else if (rowText.split(" ", 1)[0] === ".wea") {
          weatherSearch(rowText, chatter, isGroupChat);
        } else if (rowText.split(" ", 1)[0] === ".t") {
          tweetSearch(rowText, chatter, isGroupChat);
        } else if (rowText.split(" ", 1)[0] === ".tweet") {
          tweetStatus(rowText, chatter, isGroupChat);
        } else if (rowText.split(" ", 1)[0] === ".twimg") {
          tweetLatestImage(rowText, chatter, isGroupChat);
        } else if (rowText.split(" ", 1)[0] === ".reply") {
          tweetReply(rowText, chatter, isGroupChat);
        } else if (rowText.split(" ", 1)[0] === ".follow") {
          twitterFollow(rowText, chatter, isGroupChat);
        } else if (rowText.split(" ", 1)[0] === ".fav") {
          favoriteTweet(rowText, chatter, isGroupChat);
        } else if (rowText.split(" ", 1)[0] === ".u") {
          urbandictionarySearch(rowText, chatter, isGroupChat);
        } else if (rowText.split(" ", 1)[0] === ".i") {
          sendiMessage(rowText, chatter, isGroupChat);
        } else if (rowText.split(" ", 1)[0] === ".yospost") {
          SANewThread(rowText, chatter, isGroupChat);
        } else if (rowText.split(" ", 1)[0] === ".yosreply") {
          SAReplyThread(rowText, chatter, isGroupChat);
        } else if (rowText === ".8") {
          eightBall(rowText, chatter, isGroupChat);
        } else if (rowText === ".quote") {
          inspirationalQuote(rowText, chatter, isGroupChat);
        } else if (rowText.split(" ", 1)[0] === ".giphy") {
          giphySearch(rowText, chatter, isGroupChat);
        } else if (rowText === ".fortune") {
          getFortune(rowText, chatter, isGroupChat);
        } else if (rowText === ".help") {
          getCommands(rowText, chatter, isGroupChat);
        }
      }
    });
  });
}

function sendMessage(to, message, groupChat) {
  console.log(`attempting to send ${message} to ${to} via imessagemodule...`);
  imessagemodule.sendMessage(to, message);
}

const sendNewMessage = ( SELECTED_CHATTER, message ) => {
	return new Promise(async (resolve, reject) => {

		const osaFunction = (SELECTED_CHATTER, message) => {

			const Messages = Application('Messages')
			let target
	
			try {

				target = Messages.chats.whose({ id: SELECTED_CHATTER })[0]
			} catch (e) {

				// console.log(e)
			}
	
			try {

				Messages.send(message, { to: target })
			} catch (e) {

				// console.log(e)
			}

			return {}
		}

		return osa(osaFunction)(SELECTED_CHATTER, message).then(resolve)
	})
}

db.serialize(
  function () {
    db.all(
      "SELECT MAX(ROWID) AS max FROM message",
      function (err, rows) {
        if (rows) {
          var max = rows[0].max;
          if (max > LAST_SEEN_ID) {
            LAST_SEEN_ID = max;
            return;
          }
        }
      }.bind(this)
    );
  }.bind(this)
);

setInterval(function () {
  db.serialize(
    function () {
      db.all(
        "SELECT MAX(ROWID) AS max FROM message",
        function (err, rows) {
          if (rows && !sending) {
            var max = rows[0].max;
            if (max > LAST_SEEN_ID) {
              for (LAST_SEEN_ID; LAST_SEEN_ID <= max; LAST_SEEN_ID++) {
                checkMessageText(LAST_SEEN_ID);
              }
            }
          }
        }.bind(this)
      );
    }.bind(this)
  );
}, 3000);
