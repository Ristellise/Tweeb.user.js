# Tweeb.user.js

Tweeb is a tampermonkey script that is useful for archiving twitter posts quickly. Initally it spawned from removing promoted posts but now can archive posts.

## Dependencies

None. ~~But this script does depend on xhook.js by jpillora.~~ Depends on humanize-duration.min.js. Included.

## Usage

Tweeb.user.js intercepts requests and reads the payload directly. Common functions are available as buttons to press:

`[DL Tweets] Session`: Downloads the tweets saved during the current session  
`[DL Tweets] Archive`: Downloads all past archives  
`Wipe Session & Archive`: Wipes ALL present and archived tweets. Confirmation is prompted.  
`Auto Scroll`: Toggles Auto Scrolls until the page stops updated.  
`Auto Scroll [R]`: Toggles Auto Scrolls with a json file (downloaded from session or archive) as reference.  

## What does this script not do

- It doesn't bypass any limits imposed on you by twitter (Subscribe upsells and the like)

## TODOs:

[ ]: Enable (Specifically, **Optionally**) anonymous uploads of posts to a centralized server.
  - The structure is already there, just needs a way to upload and store.  
- ~~Store tweets with GM_setValue~~ Done.

## Potentially support...

- ~~OldTwitter: As it calls twitter apis within the extension, xhook can't exactly hook into it. Mmm not sure in a sense to fix it?~~
  - OldTwitter as of late exposes calls to other extensions via postMessage, we use that to hook in.


## License

MIT
