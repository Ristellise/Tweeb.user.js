# Tweeb.user.js

Tweeb is a tampermonkey script that is useful for archiving twitter posts quickly. Initally it spawned from removing promoted posts but now can archive posts.

## Dependencies

None. ~~But this script does depend on xhook.js by jpillora.~~ Depends on humanize-duration.min.js. Included.

## Usage

Tweeb.user.js intercepts requests and reads the payload directly. Common functions are available as buttons to press:

`[DL Tweets] Session`: Downloads the tweets saved during the current session  
`[DL Tweets] Archive`: Downloads all past archives  
`Wipe Session & Archive`: Wipes ALL present and archived tweets. Confirmation is prompted.  
`Auto Scroll`: Toggles Auto Scrolls until the page stops updated. (Unavailable with OldTwitter backend at the moment)  
`Auto Scroll [R]`: Toggles Auto Scrolls with a json file (downloaded from session or archive) as reference. (Unavailable with OldTwitter backend at the moment)  

## "Backends" / "Methods" / "Hooks"

This script has 2 so called "backends" or hook methods. They are as follows:

- `xhook` (aka. Default Backend): New Twitter / X's default method.
- `sendMessage` (aka. OldTwitter Backend): Only enabled with OldTwitter Extension is used. xhook does not work for example.

## `sendMessage` backend notes

- grok removal is not enabled for `sendMessage` as no additional benefit is provided. 

## What does this script not do

- It doesn't bypass any limits imposed on you by twitter (Subscribe upsells and the like)

## TODOs:

[ ]: Enable (Specifically, **Optionally**) anonymous uploads of posts to a centralized server.
  - The structure is already there, just needs a way to upload and store.  
- ~~Store tweets with GM_setValue~~ Done.

## License

MIT
