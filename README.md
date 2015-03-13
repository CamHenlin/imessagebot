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
Send an iMessage to the logged in iMessage account. If you preface the message with '.g', the bot will google search for the rest of the text in the message, and return the first result.

`Note: Sometimes using AppleScript to send iMessages can be unreliable and cause an error dialog to pop up in Messages.app, which will in turn prevent future messages from being sent. If you suspect this has happened, you can send the message '.r', which will cause the bot to attempt to clear error messages in Messages.app.`

## This is clunky!
It seems to me that there is a way to access private APIs within OS X to send messages without the use of Messages.app, but I haven't figured out how to do so yet. Maybe you can help out and contribute? You can make this less clunky by helping out with this project [nodeprivatemessageskit](https://github.com/camhenlin/nodeprivatemessageskit)

## Why did you make this?
Why not?

Based on code from: [iMessageWebClient](https://github.com/CamHenlin/iMessageWebClient)
And: [iMessageClient](https://github.com/CamHenlin/imessageclient)

![made with a mac](http://henlin.org/mac.gif "made with a mac")
