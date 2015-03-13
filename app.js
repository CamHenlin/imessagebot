var sqlite3 = require('sqlite3').verbose();
var fs = require("fs");
var dir = process.env.HOME + '/Library/Messages/';
var file = process.env.HOME + '/Library/Messages/chat.db';
var applescript = require("./applescript/lib/applescript.js");
var exec = require('exec');
var google = require('google');
var weather = require('weather-js');
var glob = require('glob');

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

	db.serialize(function() {
		var arr = [];
		db.all(SQL, function(err, rows) {
			if (err) throw err;
			// should only be one result since we are selecting by id but I am looping anyways
			for (var i = 0; i < rows.length; i++) {
				var row = rows[i];
				if (row.is_from_me || !row || !row.text) {
					return;
				}

				console.log(row);

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
							temp: result[0].current.temperature
						};

						console.log(chatter, "w: " + rowText.substring(3) + ": current: " + wea.temp + " high: " + wea.high + " low: " + wea.low);
						sendMessage(chatter, "w: " + rowText.substring(3) + ": current: " + wea.temp + " high: " + wea.high + " low: " + wea.low, isGroupChat);

					});
				} else if (rowText.split(' ', 1)[0] === '.r') {
					applescript.execFile(__dirname+'/send_return.AppleScript', [], function(err, result) {
						if (err) {
							throw err;
						}
					});
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

					for (LAST_SEEN_ID++; LAST_SEEN_ID <= max; LAST_SEEN_ID++) {
						checkMessageText(LAST_SEEN_ID);
					}
				}
			}
		}.bind(this));
	}.bind(this));
}, 2500);