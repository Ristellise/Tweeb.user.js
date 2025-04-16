# Archive format

The structure of the archive looks like this.

```js
{
    // Tweet ID
    "1911071812236042406": {
        // Tweet ID
        "id": "1911071812236042406",
        // full_text
        "text": "gm group chat say it back",
        "user": {
            // User's internal rest_id. Can be useful for skipping a handle to a rest_id lookup
            "id": "783214",
            // Display name of the user
            "display_name": "X",
            // The @handle for the user
            "handle": "X",
            "location": "everywhere",
            // Bio of the user
            "bio": "what's happening?!",
            "locked": false,
            // """Verified"""/blue status.
            "blue": {
                // Verified / Paid for it
                "has": true,
                // Older twitter verified
                "legacy": false,
                // If the user hid their blueness.
                "hidden": false
            },
            // Counts for the user
            "counts": {
                // total posts for the user
                "posts": 15557,
                // Likes from a user
                "likes": 5854,
                // media posts
                "media": 2455,
                "follows": {
                    // XXX: If anyone figures out what fast means, lmk.
                    // ? Probably inflated / unverified follows?
                    "fast": 0,
                    // Most follows should be this
                    "slow": 68982113,
                    "friends": 1
                }
            }
        },
        // Any media animated_gif, video and photos are supported.
        "media": [],
        // User counts.
        "counts": {
            "reply": 15803,
            "like": 264090,
            // Retweets
            "retweet": 123711,
            // quotes. (I think retweets include quotes)
            "quote": 2911,
            // bookmarks
            "bookmarked": 10585
        },
        "reply": null
    }
}
```

## Timestamps?

~~For most tweets (except those early tweets), the timestamp within the snowflake ID should be accurate enough to determine a posting time.~~

Added.

## Any potential attacks?

This structure is not tied to any user who scrapes it\*

\*In theory, an attack would be possible if a user scrapes a specific user only. But then again, that isn't identifyable.

## Why not warcs?

"Archiving" to me means "Reasonable Replication". You could save the entire page 1 to 1 down to the byte. But a huge waste of space where it is more space efficient when you extract only specific contents of the page.

## Why views are not included?

Mmm, I think views are not exactly representive of how popular a post is. Plus they can be boosted.  

...Basically I think views are probably copium fuel for certain *individuals that I shall not mention.*

## Repost "posts"

Repost are resolved to the origina post.