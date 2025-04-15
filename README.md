# Tweeb.user.js

Tweeb is a tampermonkey script that is useful for archiving twitter posts quickly. Initally it spawned from removing promoted posts but now can archive posts.

## Dependencies

None. But this script does depend on xhook.js by jpillora.

## Usage

At the moment the script is quite finnicky, requiring you to refresh the page to reset a "Capture"

Using the console is recommended. Here are some functions:

1. `TweebScroll()`: Start scrolling the page, capturing each tweet as it is loaded.
2. `TweebDownload()`: Dumps what has been captured.

## TODOs:

[ ]: Enable (Specifically, **Optionally**) anonymous uploads of posts to a centralized server.
  - The structure is already there, just needs a way to upload and store.
[ ]: Store tweets with GM_setValue

## License

MIT
