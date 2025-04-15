// ==UserScript==
// @name         Tweeb
// @namespace    http://tampermonkey.net/
// @version      25.04.15
// @description  Tweeb: Userscript for
// @author       Shinon
// @match        https://twitter.com/*
// @match        https://x.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=twitter.com
// @grant        none
// @require https://jpillora.com/xhook/dist/xhook.min.js
// @run-at document-start
// ==/UserScript==

function ulog(...args) {
  console.log(`\x1B[94m[Tweeb]\x1B[m`, ...args);
}

function saveData(data, fileName) {
  var a = document.createElement("a");
  // document.body.appendChild(a);
  // a.style = "display: none";
  var json = JSON.stringify(data),
    blob = new Blob([json], {
      type: "text/json",
    }),
    url = window.URL.createObjectURL(blob);
  a.href = url;
  a.download = fileName;
  a.click();
  window.URL.revokeObjectURL(url);
}

var _ = null;
tweebGlobalAdded = -1;

function uLogTimelineError(timelineType, ...args) {
  ulog(`Cannot find instructions for timeline @ ${timelineType}:`, ...args);
}

function timelineExtractor(timelineData) {
  // if (timelineData.data && timelineData.data.home.home_timeline_urt) {

  // }
  // Instructions for the timeline
  var instructions = null;
  if (timelineData.data.user) {
    if (timelineData.data.user.result.timeline_v2) {
      // user timeline ("V2")
      instructions =
        timelineData.data.user.result.timeline_v2.timeline.instructions;
    } else if (timelineData.data.user.result.timeline) {
      // user timeline ("V2.5?")
      instructions =
        timelineData.data.user.result.timeline.timeline.instructions;
    } else {
      // Anything else is logged.
      uLogTimelineError("timelineData.data.user", timelineData.data.user);
    }
  } else if (timelineData.data.home) {
    if (timelineData.data.home.home_timeline_urt) {
      instructions = timelineData.data.home.home_timeline_urt.instructions;
    } else {
      // Anything else is logged.
      uLogTimelineError("timelineData.data.home", timelineData.data.home);
    }
  } else if (timelineData.data.search_by_raw_query) {
    if (timelineData.data.search_by_raw_query.search_timeline) {
      // For search
      instructions =
        timelineData.data.search_by_raw_query.search_timeline.timeline
          .instructions;
    } else {
      // Anything else is logged.
      uLogTimelineError(
        "timelineData.data.search_by_raw_query",
        timelineData.data.search_by_raw_query
      );
    }
  } else if (timelineData.data.threaded_conversation_with_injections_v2) {
    instructions =
      timelineData.data.threaded_conversation_with_injections_v2.instructions;
  }
  if (!instructions) {
    ulog("Cannot find instructions", timelineData);
    return timelineData, [];
  }
  // Reconstruct timeline instructions to remove promotions.

  var newInstructions = [];
  // XXX: This actually modifies instructions when doing a filter. probably fine but uhh. This feels super sus.
  // This doesn't apply to media page since that uses another entryType
  for (let instructIdx = 0; instructIdx < instructions.length; instructIdx++) {
    var instruction = instructions[instructIdx];
    if (instruction.type == "TimelineAddEntries") {
      var cleanedEntries = instruction.entries.filter((entry) => {
        return !entry.entryId.startsWith("promoted");
      });
      instruction.entries.forEach((entry) => {
        if (entry.entryId.startsWith("conversationthread-")) {
          entry.content.items.forEach((subEntry) => {
            if (subEntry.entryId.includes("-tweet-")) {
              if (
                subEntry.item.itemContent.tweet_results.result
                  .grok_analysis_button
              ) {
                subEntry.item.itemContent.tweet_results.result.grok_analysis_button = false;
              }
            }
          });
        }
      });
      instruction.entries = cleanedEntries;
    }
    newInstructions.push(instruction);
  }

  newInstructions.forEach((instruction) => {
    if (
      instruction.type == "TimelineAddEntries" &&
      instruction.entries.length >= 1 &&
      instruction.entries[0].entryId.startsWith("profile-grid-")
    ) {
      // ulog("Adding Media Grid Entries...")
      pushAndUpdateMediaTweets(instruction.entries[0].content.items);
    } else if (
      instruction.type == "TimelineAddToModule" &&
      instruction.moduleEntryId.startsWith("profile-grid-")
    ) {
      // ulog("Adding Media Grid Update Entries...")
      pushAndUpdateMediaTweets(instruction.moduleItems);
    } else if (instruction.type == "TimelineAddEntries") {
      // ulog("Adding Common timeline entries...")
      if (
        instruction.entries.length <= 2 &&
        instruction.entries[0].entryId.startsWith("cursor-") &&
        instruction.entries[1].entryId.startsWith("cursor-")
      ) {
        // do nothing for blank cursors
      } else pushAndUpdateMediaTweets(instruction.entries);
    }
  });
}

function pushExistingTweets(objectEntries) {
  if (window.TweebImages === undefined) {
    window.TweebImages = {};
  }
  const seenIds = Object.keys(window.TweebImages);
  var timelineTweets = objectEntries;
  var filteredTweetIds = Object.keys(timelineTweets).filter(
    (key) => !seenIds.includes(key)
  );
  var newTweets = {};
  for (let index = 0; index < filteredTweetIds.length; index++) {
    const tweetId = filteredTweetIds[index];
    newTweets[tweetId] = timelineTweets[tweetId];
  }
  window.TweebImages = { ...window.TweebImages, ...newTweets };
  // Force negative to ensure page scrolls
  tweebGlobalAdded = -1;
  ulog("[refresh]", newTweets, "addedTweets", tweebGlobalAdded);
}

function pushAndUpdateMediaTweets(entries) {
  if (window.TweebImages === undefined) {
    window.TweebImages = {};
  }

  const seenIds = Object.keys(window.TweebImages);
  var timelineTweets = extractTweetData(entries);
  var filteredTweetIds = Object.keys(timelineTweets).filter(
    (key) => !seenIds.includes(key)
  );
  var newTweets = {};
  for (let index = 0; index < filteredTweetIds.length; index++) {
    const tweetId = filteredTweetIds[index];
    newTweets[tweetId] = timelineTweets[tweetId];
  }
  window.TweebImages = { ...window.TweebImages, ...newTweets };
  tweebGlobalAdded = Object.keys(newTweets).length;
  ulog("[newPush]", newTweets, "addedTweets", tweebGlobalAdded);
}

function getRealTweetObject(entryItem) {
  if (entryItem.entryId.startsWith("tweet-")) {
    if (entryItem.content.itemContent.tweet_results.result.tweet)
      return entryItem.content.itemContent.tweet_results.result.tweet;
    return entryItem.content.itemContent.tweet_results.result;
  } else if (entryItem.entryId.includes("-tweet-")) {
    if (entryItem.item.itemContent)
      return entryItem.item.itemContent.tweet_results.result;
  } else if (entryItem.entryId.startsWith("profile-grid-")) {
    return entryItem.item.itemContent.tweet_results.result;
  }
  return null;
}

function flattenTweetDetail(entries) {
  var tweets = [];
  entries.forEach((entry) => {
    if (
      entry.entryId.startsWith("conversationthread-") &&
      !entry.entryId.includes("-tweet-")
    ) {
      tweets.push(...flattenTweetDetail(entry.content.items));
    } else if (
      entry.entryId.startsWith("conversationthread-") &&
      entry.entryId.includes("-tweet-")
    ) {
      tweets.push(entry);
    }
  });
  return tweets;
}

function extractTweetData(entries) {
  var allTweetsWithMedia = {};

  var flattenEntries = flattenTweetDetail(entries);
  ulog("flattenEntries", flattenEntries);

  flattenEntries.forEach((tweetItem) => {
    const tweetObject = getRealTweetObject(tweetItem);
    // ulog("tweetObject",tweetObject, tweetItem)
    if (tweetObject == null) return;
    if (tweetObject.__typename && tweetObject.__typename.includes("Tombstone"))
      return;
    ulog(tweetObject);
    var userCore = { name: "?", display_name: "?", handle: "@", bio: "?" };
    if (tweetObject.core.user_results);
    userCore = tweetObject.core.user_results.result.legacy;
    var tweetContent = tweetObject.legacy;
    var simpleTweet = {
      id: tweetContent.id_str,
      text: tweetContent.full_text,
      user: {
        id: userCore.name,
        display_name: userCore.name,
        handle: userCore.screen_name,
        bio: userCore.description,
      },
      media: [],
      counts: {
        like: tweetContent.favorite_count,
        retweet: tweetContent.retweet_count,
        bookmarked: tweetContent.bookmark_count,
      },
    };

    // tweetContent.
    var extEntity = tweetContent.extended_entities;
    if (extEntity && extEntity.media) {
      var media = [];
      extEntity.media.forEach((mediaItem) => {
        if (mediaItem.type == "photo") {
          media.push({
            type: mediaItem.type ? mediaItem.type : null,
            url: mediaItem.media_url_https + "?name=orig",
            alt: mediaItem.ext_alt_text ? mediaItem.ext_alt_text : null,
          });
        } else if (
          mediaItem.type == "video" ||
          mediaItem.type == "animated_gif"
        ) {
          var bitrate = 0;
          var bestRate = -1;
          const variants = mediaItem.video_info.variants;
          for (let varIdx = 0; varIdx < variants.length; varIdx++) {
            const variant = variants[varIdx];
            if (variant.bitrate && variant.bitrate > bitrate) {
              bestRate = varIdx;
            }
          }
          if (bestRate == -1) {
            bestRate = 0;
          }
          media.push({
            type: "video",
            url: variants[bestRate],
          });
        } else {
          ulog("Media type", mediaItem.type, "not known.", mediaItem);
        }
      });
    }
    simpleTweet.media = media;
    allTweetsWithMedia[simpleTweet.id] = simpleTweet;
  });

  return allTweetsWithMedia;
}

function safePush(array, items) {
  if (!array) {
    array = []; // Initialize if the array is null or undefined
  }
  if (!Array.isArray(items)) {
    items = [items]; // If the input is not an array, make it one.
  }
  var added = 0;
  items.forEach((item) => {
    if (!array.includes(item)) {
      array.push(item);
      added += 1;
    }
  });
  return array, added;
}

(function () {
  "use strict";
  // xhook: for regular twitter stuff
  xhook.after(function (request, response) {
    const u = new URL(request.url);
    if (
      request.url &&
      u.pathname.includes("/graphql/") &&
      (u.pathname.endsWith("HomeLatestTimeline") ||
        u.pathname.endsWith("UserTweets") ||
        u.pathname.endsWith("SearchTimeline") ||
        u.pathname.endsWith("UserMedia") ||
        u.pathname.endsWith("TweetDetail"))
    ) {
      try {
        var hometimeline = JSON.parse(response.text);
      } catch (error) {
        ulog(
          "Rate limits",
          response.headers["x-rate-limit-remaining"],
          "Bucket Refilled @ ",
          new Date(response.headers["x-rate-limit-reset"] * 1000)
        );
        // dolly up the error to twitter to handle
        ulog(error);
        return;
      }

      timelineExtractor(hometimeline);
      response.text = JSON.stringify(hometimeline);
    }
    return response;
  });

  // [Util] Any Twitter: Count total media
  function TweebCountMedia() {
    var totalMedia = 0;
    Object.keys(window.TweebImages).forEach((tweetKey) => {
      if (window.TweebImages[tweetKey].media)
        totalMedia += window.TweebImages[tweetKey].media.length;
    });
    ulog("Media Items:", totalMedia);
  }
  window.TweebCount = TweebCountMedia;

  function TweebScrollWithReference() {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    let imageCheckInterval;

    function startImageCheck(tweets) {
      if (!tweets) {
        console.warn("No images provided.");
        return;
      }
      DoomScroller(); //start doomscroller
      previousImageCount = Object.keys(tweets).length;
      imageCheckInterval = setInterval(() => {
        if (!window.TweebImages) {
          console.warn("window.TweebImages is not defined yet.");
          return;
        }
        if (tweebGlobalAdded === 0) {
          console.log("No new images detected. Stopping.");
          clearInterval(scrollData[0]); // Stop DoomScroller
          clearInterval(imageCheckInterval);
          scrollData[0] = null;
          alert("Scroll Finished.");
        }
      }, 500); // Check every 500ms
    }

    input.onchange = (e) => {
      var file = e.target.files[0];
      var reader = new FileReader();
      reader.readAsText(file, "UTF-8");

      reader.onload = (readerEvent) => {
        var content = readerEvent.target.result;
        var includedTweebs;

        try {
          includedTweebs = JSON.parse(content);
        } catch (error) {
          console.error("Error parsing JSON file:", error);
          return;
        }
        // if (!window.TweebImages) {
        //   window.TweebImages = {};
        // }
        pushExistingTweets(includedTweebs);
        ulog(`Added ${tweebGlobalAdded} Inital medias`);
        startImageCheck(window.TweebImages);
      };
    };

    input.click();
  }

  // [Util] Any Twitter: Download function for media.
  function TweebDownload(params) {
    saveData(
      window.TweebImages,
      `${document.URL.toLowerCase().split("/")[3]}.json`
    );
  }
  window.TweebDownload = TweebDownload;

  // [Util] New Twitter: Download button
  const downloadHref = `<a href="#none" onclick="window.TweebDownload()" aria-label="Download Media" role="link"
        class="css-175oi2r r-6koalj r-eqz5dr r-16y2uox r-1habvwh r-cnw61z r-13qz1uu r-1ny4l3l r-1loqt21">
        <div class="css-175oi2r r-sdzlij r-dnmrzs r-1awozwy r-18u37iz r-1777fci r-xyw6el r-o7ynqc r-6416eg" style="padding:5px;">
            <div dir="ltr"
                class="css-146c3p1 r-dnmrzs r-1udh08x r-3s2u2q r-bcqeeo r-1ttztb7 r-qvutc0 r-37j5jr r-adyw6z r-135wba7 r-16dba41 r-dlybji r-nazi8o"
                style="text-overflow: unset; color: rgb(231, 233, 234);"><span
                    class="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3" style="text-overflow: unset;">Download Media</span>
            </div>
        </div>
    </a><a href="#none" onclick="window.TweebScroll()" aria-label="Toggle AutoScroll" role="link"
        class="css-175oi2r r-6koalj r-eqz5dr r-16y2uox r-1habvwh r-cnw61z r-13qz1uu r-1ny4l3l r-1loqt21">
        <div class="css-175oi2r r-sdzlij r-dnmrzs r-1awozwy r-18u37iz r-1777fci r-xyw6el r-o7ynqc r-6416eg" style="padding:5px;">
            <div dir="ltr"
                class="css-146c3p1 r-dnmrzs r-1udh08x r-3s2u2q r-bcqeeo r-1ttztb7 r-qvutc0 r-37j5jr r-adyw6z r-135wba7 r-16dba41 r-dlybji r-nazi8o"
                style="text-overflow: unset; color: rgb(231, 233, 234);"><span
                    class="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3" style="text-overflow: unset;">Toggle AutoScroll</span>
            </div>
        </div>
    </a><a href="#none" onclick="window.TweebScrollWRef()" aria-label="Toggle AutoScroll With Reference" role="link"
        class="css-175oi2r r-6koalj r-eqz5dr r-16y2uox r-1habvwh r-cnw61z r-13qz1uu r-1ny4l3l r-1loqt21">
        <div class="css-175oi2r r-sdzlij r-dnmrzs r-1awozwy r-18u37iz r-1777fci r-xyw6el r-o7ynqc r-6416eg" style="padding:5px;">
            <div dir="ltr"
                class="css-146c3p1 r-dnmrzs r-1udh08x r-3s2u2q r-bcqeeo r-1ttztb7 r-qvutc0 r-37j5jr r-adyw6z r-135wba7 r-16dba41 r-dlybji r-nazi8o"
                style="text-overflow: unset; color: rgb(231, 233, 234);"><span
                    class="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3" style="text-overflow: unset;">Toggle AutoScroll w/ Ref</span>
            </div>
        </div>
    </a>`;
  var navElement = null;
  var downloadBtnElementcatcher = new MutationObserver(function (mutations) {
    for (const mutation of mutations) {
      // ulog("Mutation updated");
      // console.log(mutation);
      if (mutation.type != "childList") continue;
      if (
        mutation.target.querySelector("[aria-label='More menu items']") &&
        !navElement
      ) {
        navElement = mutation.target;
        ulog("Found target");
        downloadBtnElementcatcher.disconnect();
        const moreTarget = mutation.target.querySelector(
          "[aria-label='More menu items']"
        ).parentNode;
        moreTarget.insertAdjacentHTML("beforeend", downloadHref);
      }
    }
  });

  ulog("Enabling Download button observer.");
  if (window.TweebImages === undefined) {
    window.TweebImages = [];
  }
  downloadBtnElementcatcher.observe(document, {
    childList: true,
    subtree: true,
  });

  var scrollData = [null, 20, 0, 0];

  function scrollLoop() {
    ulog("Scrolling Timeline...");
    var originalTimeline = document.querySelector(
      'div[aria-label~="Timeline:" i] > div > div:nth-last-child(1)'
    );
    if (originalTimeline !== null) {
      originalTimeline.scrollIntoViewIfNeeded();
    } else {
      originalTimeline = document
        .querySelector("#timeline > div:nth-last-child(1)")
        .scrollIntoViewIfNeeded();
    }

    if (window.scrollY === scrollData[2]) {
      if (scrollData[1] > scrollData[3]) {
        scrollData[3]++;
      } else {
        ulog("Scroll locked. Giving up...");
        alert("Scroll Finished.");
        clearInterval(scrollData[0]);
        scrollData[0] = null;
        scrollData[3] = 0;
      }
    } else {
      scrollData[3] = 0;
    }
    scrollData[2] = window.scrollY;
  }

  function DoomScroller() {
    if (scrollData[0]) {
      clearInterval(scrollData[0]);
      scrollData[0] = null;
    } else {
      scrollData[0] = setInterval(scrollLoop, 100);
    }
  }

  function TweebReset() {
    if (window.TweebImages) window.TweebImages = {};
  }

  window.TweebScroll = DoomScroller;
  // window.TweebIds = tweetIds;
  window.TweebScrollWRef = TweebScrollWithReference;
  window.TweebClear = TweebReset;
})();
