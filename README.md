# iMessage Bot for Mac OS X

## requirements:
- nodejs
- Apple iMessages account signed in to Messages.app

## How to run on your Mac:
Firstly, at the very minimum, you will have to enable assistive access to Terminal.app or iTerm2. If you want to run this over ssh, you will also need to enable access to sshd-keygen-wrapper. Next:
```bash
git clone https://github.com/CamHenlin/imessagebot.git

cd imessagebot

npm install

node app
```

## How to use:
Send an iMessage to the logged in iMessage account, or add the account to an existing group chat.

The bot will then respond to a list of commands:

- ```.g some search term``` will search for "some search term" in google, and return the first result to the chat
- ```.t some search term``` will search twitter for "some search term", and return the first result to the chat (twitter api key must be set up at top of app.js)
- ```.follow @some username``` will follow @some username on twitter
- ```.fav link to some tweet``` will fav a link to some tweet
- ```.tweet some text``` will tweet some text (twitter api key must be set up at top of app.js)
- ```.reply somestatusurl @someperson some text``` will a reply to @someperson's somestatusurl some text (twitter api key must be set up at top of app.js)
- ```.w some location``` will return the weather for "some location" to the chat
- ```.u some text``` will look up some text on urbandictionary
- ```.i some imessage address some text``` will send an iMessage directly to some imessage address with the contents some text
- the bot will also check the title of any web page that has its url pssted into the chat
- the bot will also report status updates that mention the user set on line 57 if the twitter api keys are set up.

`Note: Sometimes using AppleScript to send iMessages can be unreliable and cause an error dialog to pop up in Messages.app, which will in turn prevent future messages from being sent. If you suspect this has happened, you can send the message '.r', which will cause the bot to attempt to clear error messages in Messages.app.`

## This is clunky!
It seems to me that there is a way to access private APIs within OS X to send messages without the use of Messages.app, but I haven't figured out how to do so yet. Maybe you can help out and contribute? You can make this less clunky by helping out with this project [nodeprivatemessageskit](https://github.com/camhenlin/nodeprivatemessageskit)

## Why did you make this?
To get more people interested in hacking around with iMessages! This project is much more simple than the other iMessages projects listed below, and is more accessible for people to hack on and extend!

Based on code from: [iMessageWebClient](https://github.com/CamHenlin/iMessageWebClient)
And: [iMessageClient](https://github.com/CamHenlin/imessageclient)

Uses [iMessageModule](https://github.com/CamHenlin/iMessageModule).

![made with a mac](http://henlin.org/mac.gif "made with a mac")
