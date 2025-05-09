# Tweeb.user.js

Tweeb is a userscript designed for Tampermonkey and Greasemonkey that automatically archives tweets as you scroll through your Twitter feed.

## Features

* **Automatic Archiving:** Captures tweets in real-time as you scroll.
* **Local Storage:** All archived data is stored directly in your browser's local storage.
* **Data Export:** Easily download your archived tweets.
* **Session and Archive Management:** Options to manage currently saved tweets and the entire archive.
* **Auto Scroll:** Automate scrolling to capture more tweets.
* **Backend Compatibility:** Supports different methods for intercepting tweet data, compatible with both the new Twitter/X interface and the OldTwitter extension.

## Installation

1.  Ensure you have a userscript manager installed in your browser (e.g., Tampermonkey, Greasemonkey, Violentmonkey).
2.  Install Tweeb.user.js from the provided source link.

## Dependencies

* `humanize-duration.min.js`: Included with the script.

## Usage

Tweeb works by intercepting network requests to capture tweet data as it's loaded. The following buttons will appear on the Twitter interface to provide easy access to its functions:

`[DL Tweets] Session`: Downloads the tweets saved during the current session  
`[DL Tweets] Archive`: Downloads all past archives  
`Wipe Session & Archive`: **Caution:** This action will permanently delete ALL tweets saved in both your current session and the entire archive. You will be prompted for confirmation before proceeding.  
`Auto Scroll`: Toggles automatic scrolling. The script will scroll down the page until no new tweets are loaded.  
`Auto Scroll [R]`: Toggles automatic scrolling using a previously downloaded JSON archive file (from a session or full archive) as a reference. This can be used to scroll and check for tweets not present in the reference file.  

## "Backends" / "Methods" / "Hooks"

Tweeb utilizes different methods ("backends") to intercept tweet data, depending on the Twitter interface you are using:

* **`xhook` (Default Backend)**: Used with the standard New Twitter / X interface. This method intercepts requests directly.
* **`sendMessage` (OldTwitter Backend)**: Activated only when the OldTwitter Extension is in use. The `xhook` method is not compatible with the OldTwitter interface, so this alternative method is used.

## `sendMessage` backend notes

- grok removal is not enabled for `sendMessage` as no additional benefit is provided.
- Tweets loaded from the `UserMedia` GraphQL route are not collected when using this backend.

## Limitations

- Tweeb **does not** bypass any limitations imposed on your account by Twitter (e.g., rate limits, prompting for subscriptions).

## Privacy

`Tweeb.user.js` **does not** transmit any of your data to any third-party services or servers. All collected tweet data is stored exclusively in your browser's local storage. You can inspect the full source code within the userscript file to verify its behavior.

## TODOs:

[ ]: Investigate the option to **anonymously** upload archived posts to a centralized server. The necessary data structure for this functionality is already in place, but the upload and storage mechanisms need to be implemented. This feature would be entirely **optional**.

## License

MIT