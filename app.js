var sqlite3 = require('sqlite3').verbose();
var fs = require("fs");
var dir = process.env.HOME + '/Library/Messages/';
var file = process.env.HOME + '/Library/Messages/chat.db';
var applescript = require("./applescript/lib/applescript.js");
var exec = require('exec');
var google = require('google');
var weather = require('weather-js');
var glob = require('glob');
var Twitter = require('twitter');

var client = new Twitter({
	consumer_key: '',
	consumer_secret: '',
	access_token_key: '-',
	access_token_secret: ''
});

var exists = fs.existsSync(file);
if (!exists) {
	return;
}

// discover if we are running and old version of OS X or not
var OLD_OSX = false;
var os = require('os');
if (os.release().split('.')[0] === "12") { // 12 is 10.8 Mountain Lion, which does not have named group chats
	OLD_OSX = true;
}

// discover whether the keyboard setting "Full Keyboard Access" is set to
// "Text boxes and lists only" -- error or 1 or less
// "All controls" (takes 2 tabs instead of one switching between elements in Messages.app) -- 2 or more
var FULL_KEYBOARD_ACCESS = false; // false for text boxes and lists, true for all controls
exec('defaults read NSGlobalDomain AppleKeyboardUIMode', function(err, out, code) {
	if (err instanceof Error) {
		// return because we already have false set and error means text boxes and lists only
		return;
	}

	if (parseInt(out) > 1) {
		FULL_KEYBOARD_ACCESS = true;
	}
});

// read the Messages.app sqlite db
var db = new sqlite3.Database(file);

// internally used variables
var LAST_SEEN_ID = 0;
var ENABLE_OTHER_SERVICES = false;
var sending = false;

function checkMessageText(messageId) {
	var SQL = "SELECT DISTINCT message.ROWID, handle.id, message.text, message.is_from_me, message.date, message.date_delivered, message.date_read, chat.chat_identifier, chat.display_name FROM message LEFT OUTER JOIN chat ON chat.room_name = message.cache_roomnames LEFT OUTER JOIN handle ON handle.ROWID = message.handle_id WHERE message.service = 'iMessage' AND message.ROWID = " + messageId + " ORDER BY message.date DESC LIMIT 500";
	if (OLD_OSX) {
		SQL = "SELECT DISTINCT message.ROWID, handle.id, message.text, message.is_from_me, message.date, message.date_delivered, message.date_read FROM message LEFT OUTER JOIN chat LEFT OUTER JOIN handle ON handle.ROWID = message.handle_id WHERE message.service = 'iMessage' AND message.ROWID = " + messageId + " ORDER BY message.date DESC LIMIT 500";
	}

	db.serialize(function() {
		var arr = [];
		db.all(SQL, function(err, rows) {
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
				} else if (arr.indexOf(row.chat_identifier) < 0 && arr.indexOf(row.display_name+'-'+row.chat_identifier) < 0) {
					if (row.chat_identifier.indexOf('chat') > -1) {
						if (row.display_name && row.display_name !== "" && typeof(row.display_name) !== "undefined" || OLD_OSX) {
							chatter = row.display_name;
							isGroupChat = true;
						}
					} else {
						if (row.chat_identifier && row.chat_identifier !== "" && typeof(row.chat_identifier) !== "undefined") {
							chatter = row.chat_identifier;
							isGroupChat = true;
						}
					}
				}

				var rowText = row.text;
				rowText = rowText.toLowerCase();

				// check for google search:
				if (rowText.split(' ', 1)[0] === '.g') {
					google(rowText.substring(3), function(err, next, links) {
						if (!links) {
							return;
						}

						console.log(links[0]);
						console.log(chatter, "g: \"" + rowText.substring(3).substring(0, 8) + "...\": title: " + links[0].title.substring(0, 16) + "... description: " + links[0].description.substring(0, 32) + "... link: " + links[0].link);
						sendMessage(chatter, "g: \"" + rowText.substring(3).substring(0, 8) + "...\": title: " + links[0].title.substring(0, 16) + "... description: " + links[0].description.substring(0, 32) + "... link: " + links[0].link, isGroupChat);
						return;
					});
				} else if (rowText.split(' ', 1)[0] === '.w') {
					console.log('weather for ' + rowText.substring(3));
					weather.find({search: rowText.substring(3), degreeType: 'F'}, function(err, result) {
						if (err || !result) {
							console.log('no weather for ' +  + rowText.substring(3));
							return;
						}

						var wea = {
							high: result[0].forecast[0].high,
							low: result[0].forecast[0].low,
							temp: result[0].current.temperature,
							skytext: result[0].current.skytext
						};

						console.log(chatter, "w: " + rowText.substring(3) + ": current: " + wea.temp + " and " + wea.skytext + " high: " + wea.high + " low: " + wea.low);
						sendMessage(chatter, "w: " + rowText.substring(3) + ": current: " + wea.temp + " and " + wea.skytext + " high: " + wea.high + " low: " + wea.low, isGroupChat);

					});
				} else if (rowText.split(' ', 1)[0] === '.t') {
					console.log('tweet for ' + rowText.substring(3));
					client.get('search/tweets', {q: rowText.substring(3)}, function(error, tweets, response) {
						if (error) {
							return;
						}

						var tweet = tweets.statuses[0];
						console.log(tweets.statuses);
						console.log(tweet);
						if (!tweet) {
							console.log(chatter, "t: " + rowText.substring(3) + ": no tweets found.");
							sendMessage(chatter, "t: " + rowText.substring(3) + ": no tweets found.", isGroupChat);
						} else {
							console.log(tweet.text);
							console.log(chatter, "t: " + rowText.substring(3) + ": tweet: " + tweet.text + " user: " + tweet.user.screen_name);
							sendMessage(chatter, "t: " + rowText.substring(3) + ": tweet: " + tweet.text + " user: " + tweet.user.screen_name, isGroupChat);
						}
						return;
					});
				} else if (rowText.split(' ', 1)[0] === '.tweet') {
					console.log('tweet ' + rowText.split('.tweet ')[1]);
					client.post('statuses/update', {status: rowText.split('.tweet ')[1]}, function(error, tweet, response) {
						if (error) {
							console.log(error);
							console.log(response);
							sendMessage(chatter, "error tweeting: " + error, isGroupChat);
							return;
						}

						console.log(tweet);

						console.log(chatter, "tweeted: " + rowText.split('.tweet ')[1] + ", url: https://twitter.com/typicalyospos/status/" + tweet.id_str);
						sendMessage(chatter, "tweeted: " + rowText.split('.tweet ')[1] + ", url: https://twitter.com/typicalyospos/status/" + tweet.id_str, isGroupChat);
						return;
					});
				} else if (rowText.split(' ', 1)[0] === '.r') {
					applescript.execFile(__dirname+'/send_return.AppleScript', [], function(err, result) {
						if (err) {
							throw err;
						}
					});
				} else if (rowText.indexOf('http://') > -1 || rowText.indexOf('https://') > -1) {
					var protocol = "http";
					var index = rowText.indexOf('http://');
					if (index === -1) {
						index = rowText.indexOf('https://');
						protocol = "https";
					}

					var url = rowText.split(protocol + '://')[1]; // get everything after the protocol
					console.log(url);

					var htp = {};
					if (protocol === 'http') {
						htp = require('follow-redirects').http;
					} else {
						htp = require('follow-redirects').https;
					}

					var options = {
						host: url.split('/')[0], // host is everything before first /
						path: '/' + ((url.indexOf('/') > -1) ? url.split('/')[1].split(' ')[0] : ''), // path is everything after, plus opening /
					};

					console.log(options);

					var callback = function(response) {
						var documentText = ''
						response.on('data', function (chunk) {
							documentText += chunk;
						});

						response.on('end', function () {
							var regex = /<title>(.+?)<\/title>/igm;
							var title = regex.exec(documentText);
							if (!title) {
								title = [];
								title[1] = "no title";
							}
							// console.log(title[1]);
							console.log(chatter, "url: " + protocol + '://' + url.split('/')[0] + '/' + ((url.indexOf('/') > -1) ? url.split('/')[1].split(' ')[0] : '') + " title: " + title[1]);
							sendMessage(chatter, "url: " + protocol + '://' + url.split('/')[0] + '/' + ((url.indexOf('/') > -1) ? url.split('/')[1].split(' ')[0] : '') + " title: " + title[1], isGroupChat);
						});
					}

					htp.request(options, callback).end();
				}
			}
		});
	});
}

function sendMessage(to, message, groupChat) {
	if (sending) { return; }
	sending = true;

	if (groupChat) {
		applescript.execFile(__dirname+'/sendmessage.AppleScript', [[to], message, FULL_KEYBOARD_ACCESS], function(err, result) {
			if (err) {
				throw err;
			}

			sending = false;
		}.bind(this));
	} else {
		applescript.execFile(__dirname+'/sendmessage_single.AppleScript', [[to], message, FULL_KEYBOARD_ACCESS, ENABLE_OTHER_SERVICES], function(err, result) {
			if (err) {
				throw err;
			}

			sending = false;
		}.bind(this));
	}
}

db.serialize(function() {
	db.all("SELECT MAX(ROWID) AS max FROM message", function(err, rows) {
		if (rows) {
			var max = rows[0].max;
			if (max > LAST_SEEN_ID) {
				LAST_SEEN_ID = max;
				return;
			}
		}
	}.bind(this));
}.bind(this));

setInterval(function() {
	db.serialize(function() {
		db.all("SELECT MAX(ROWID) AS max FROM message", function(err, rows) {
			if (rows) {
				var max = rows[0].max;
				if (max > LAST_SEEN_ID) {

					for (LAST_SEEN_ID; LAST_SEEN_ID <= max; LAST_SEEN_ID++) {
						checkMessageText(LAST_SEEN_ID);
					}
				}
			}
		}.bind(this));
	}.bind(this));
}, 2500);