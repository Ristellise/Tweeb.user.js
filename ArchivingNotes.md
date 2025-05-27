# Archive format

The structure of the archive looks like this.

```js
{
    // Tweet ID
    "1911071812236042406": {
        // Tweet ID
        "id": "1911071812236042406",
        // Text of tweet.
        "text": "gm group chat say it back",
        "user": {
            // RestID. Use this to skip 1 step from resolving "screen_name" / handle to fetching userdata.
            "id": "783214",
            // display name of the user
            "display_name": "X",
            // the @handle
            "handle": "X",
            // Location string
            "location": "everywhere",
            // Created time
            "created": 1171982154,
            // The bio for the user
            "bio": "what's happening?!",
            // If the account is protected or not. This can change @ scrape time.
            "locked": false,
            // "Has_graduated_access". This appears to be "false" for some old accounts and quite likely new ones... This needs confirmation on what this actually is for.
            "graduation": true,
            "blue": {
                "has": true,
                "legacy": false,
                "hidden": false
            },
            "counts": {
                // No. of posts
                "posts": 15572,
                // No. of likes
                "likes": 5915,
                // No. of media posts
                "media": 2460,
                // Follows are split into a couple sections
                "follows": {
                    // No. of "fast_follows".
                    "fast": 0,
                    // Regular followers
                    "slow": 68730407,
                    // Followers who also followed this account. ala friends.
                    "friends": 1
                }
            }
        },
        // Any media animated_gif, video and photos are supported.
        "media": [],
        // Time of tweet creation.
        "created": 1744470000,
        "counts": {
            // No. of replies
            "reply": 5502,
            // No. of likes
            "like": 9567,
            // No. of retweets
            "retweet": 826,
            // No. of retweets that are quotes
            "quote": 232,
            // No. of bookmarks
            "bookmarked": 261
        },
        "quote": null,
        // Reply ID if this is a reply to another tweet
        "reply": null
    }
}
```

## Timestamps?

~~For most tweets (except those early tweets), the timestamp within the snowflake ID should be accurate enough to determine a posting time.~~ Added timestamps.

## Any potential attacks?

This structure is not tied to any user who scrapes it\*

\*In theory, an attack would be possible if a user scrapes a specific user only. But then again, that isn't identifyable.

## Why not warcs?

"Archiving" to me means "Reasonable Replication". You could save the entire page 1 to 1 down to the byte. But a huge waste of space where it is more space efficient when you extract only specific contents of the page.

## Why views are not included?

Mmm, I think views are not exactly reprehensive of how popular a post is. Plus they can be boosted.  

...Basically I think views are probably copium fuel for certain *individuals that I shall not mention.*

## Repost / Retweets "posts"

Repost are resolved to the original post.