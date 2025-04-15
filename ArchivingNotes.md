# About archives this tweet produces

The structure of the archive looks like this:

```js
{
    // Tweet ID
    "20": {
        // Tweet ID
        "id": "20",
        // full_text
        "text": "just setting up my twttr",
        "user": {
            // User's internal rest_id. Can be useful for skipping a handle to a rest_id lookup
            "id": "12",
            // Display name of the user
            "display_name": "jack",
            // The @handle for the user
            "handle": "jack",
            // Bio of the user
            "bio": "no state is the best state"
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
    },
}
```

## Timestamps?

For most tweets (except those early tweets), the timestamp within the snowflake ID should be accurate enough to determine a posting time.

## Any potential attacks?

This structure is not tied to any user who scrapes it\*

\*In theory, an attack would be possible if a user scrapes a specific user only. But then again, that isn't identifyable.

## Why not warcs?

"Archiving" to me means "Reasonable Replication". You could save the entire page 1 to 1 down to the byte. But a huge waste of space where it is more space efficient when you extract only specific contents of the page.

## Why views are not included?

Mmm, I think views are not exactly representive of how popular a post is. Plus they can be boosted.  

...Basically I think views are probably copium fuel for certain *individuals that I shall not mention.*