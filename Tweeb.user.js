// ==UserScript==
// @name         Tweeb
// @namespace    http://tampermonkey.net/
// @version      24.05.13
// @description  Tweeb: Userscript for twitter
// @author       Shinon
// @match        https://twitter.com/*
// @match        https://x.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=twitter.com
// @require      https://cdnjs.cloudflare.com/ajax/libs/humanize-duration/3.32.1/humanize-duration.min.js
// @updateURL    https://github.com/Ristellise/Tweeb.user.js/raw/refs/heads/main/Tweeb.user.js
// @grant        unsafeWindow
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addElement
// @sandbox JavaScript
// @run-at document-start
// ==/UserScript==

// bundle xhook.min.js with modified window -> unsafeWindow
// if (unsafeWindow) window = unsafeWindow;
//XHook - v1.6.2 - https://github.com/jpillora/xhook
//Jaime Pillora <dev@jpillora.com> - MIT Copyright 2023
var xhook = (function () {
  "use strict";

  const slice = (o, n) => Array.prototype.slice.call(o, n);

  let result = null;

  //find global object
  if (
    typeof WorkerGlobalScope !== "undefined" &&
    self instanceof WorkerGlobalScope
  ) {
    result = self;
  } else if (typeof global !== "undefined") {
    result = global;
  } else if (unsafeWindow) {
    result = unsafeWindow;
  } else if (window) {
    result = window;
  }

  const windowRef = result;
  const documentRef = result.document;

  const UPLOAD_EVENTS = ["load", "loadend", "loadstart"];
  const COMMON_EVENTS = ["progress", "abort", "error", "timeout"];

  const depricatedProp = (p) =>
    ["returnValue", "totalSize", "position"].includes(p);

  const mergeObjects = function (src, dst) {
    for (let k in src) {
      if (depricatedProp(k)) {
        continue;
      }
      const v = src[k];
      try {
        dst[k] = v;
      } catch (error) {}
    }
    return dst;
  };

  //proxy events from one emitter to another
  const proxyEvents = function (events, src, dst) {
    const p = (event) =>
      function (e) {
        const clone = {};
        //copies event, with dst emitter inplace of src
        for (let k in e) {
          if (depricatedProp(k)) {
            continue;
          }
          const val = e[k];
          clone[k] = val === src ? dst : val;
        }
        //emits out the dst
        return dst.dispatchEvent(event, clone);
      };
    //dont proxy manual events
    for (let event of Array.from(events)) {
      if (dst._has(event)) {
        src[`on${event}`] = p(event);
      }
    }
  };

  //create fake event
  const fakeEvent = function (type) {
    if (documentRef && documentRef.createEventObject != null) {
      const msieEventObject = documentRef.createEventObject();
      msieEventObject.type = type;
      return msieEventObject;
    }
    // on some platforms like android 4.1.2 and safari on windows, it appears
    // that new Event is not allowed
    try {
      return new Event(type);
    } catch (error) {
      return { type };
    }
  };

  //tiny event emitter
  const EventEmitter = function (nodeStyle) {
    //private
    let events = {};
    const listeners = (event) => events[event] || [];
    //public
    const emitter = {};
    emitter.addEventListener = function (event, callback, i) {
      events[event] = listeners(event);
      if (events[event].indexOf(callback) >= 0) {
        return;
      }
      i = i === undefined ? events[event].length : i;
      events[event].splice(i, 0, callback);
    };
    emitter.removeEventListener = function (event, callback) {
      //remove all
      if (event === undefined) {
        events = {};
        return;
      }
      //remove all of type event
      if (callback === undefined) {
        events[event] = [];
      }
      //remove particular handler
      const i = listeners(event).indexOf(callback);
      if (i === -1) {
        return;
      }
      listeners(event).splice(i, 1);
    };
    emitter.dispatchEvent = function () {
      const args = slice(arguments);
      const event = args.shift();
      if (!nodeStyle) {
        args[0] = mergeObjects(args[0], fakeEvent(event));
        Object.defineProperty(args[0], "target", {
          writable: false,
          value: this,
        });
      }
      const legacylistener = emitter[`on${event}`];
      if (legacylistener) {
        legacylistener.apply(emitter, args);
      }
      const iterable = listeners(event).concat(listeners("*"));
      for (let i = 0; i < iterable.length; i++) {
        const listener = iterable[i];
        listener.apply(emitter, args);
      }
    };
    emitter._has = (event) => !!(events[event] || emitter[`on${event}`]);
    //add extra aliases
    if (nodeStyle) {
      emitter.listeners = (event) => slice(listeners(event));
      emitter.on = emitter.addEventListener;
      emitter.off = emitter.removeEventListener;
      emitter.fire = emitter.dispatchEvent;
      emitter.once = function (e, fn) {
        var fire = function () {
          emitter.off(e, fire);
          return fn.apply(null, arguments);
        };
        return emitter.on(e, fire);
      };
      emitter.destroy = () => (events = {});
    }

    return emitter;
  };

  //helper
  const CRLF = "\r\n";

  const objectToString = function (headersObj) {
    const entries = Object.entries(headersObj);

    const headers = entries.map(([name, value]) => {
      return `${name.toLowerCase()}: ${value}`;
    });

    return headers.join(CRLF);
  };

  const stringToObject = function (headersString, dest) {
    const headers = headersString.split(CRLF);
    if (dest == null) {
      dest = {};
    }

    for (let header of headers) {
      if (/([^:]+):\s*(.+)/.test(header)) {
        const name = RegExp.$1 != null ? RegExp.$1.toLowerCase() : undefined;
        const value = RegExp.$2;
        if (dest[name] == null) {
          dest[name] = value;
        }
      }
    }

    return dest;
  };

  const convert = function (headers, dest) {
    switch (typeof headers) {
      case "object": {
        return objectToString(headers);
      }
      case "string": {
        return stringToObject(headers, dest);
      }
    }

    return [];
  };

  var headers = { convert };

  //global set of hook functions,
  //uses event emitter to store hooks
  const hooks = EventEmitter(true);

  const nullify = (res) => (res === undefined ? null : res);

  //browser's XMLHttpRequest
  const Native$1 = windowRef.XMLHttpRequest;

  //xhook's XMLHttpRequest
  const Xhook$1 = function () {
    const ABORTED = -1;
    const xhr = new Native$1();

    //==========================
    // Extra state
    const request = {};
    let status = null;
    let hasError = undefined;
    let transiting = undefined;
    let response = undefined;
    var currentState = 0;

    //==========================
    // Private API

    //read results from real xhr into response
    const readHead = function () {
      // Accessing attributes on an aborted xhr object will
      // throw an 'c00c023f error' in IE9 and lower, don't touch it.
      response.status = status || xhr.status;
      if (status !== ABORTED) {
        response.statusText = xhr.statusText;
      }
      if (status !== ABORTED) {
        const object = headers.convert(xhr.getAllResponseHeaders());
        for (let key in object) {
          const val = object[key];
          if (!response.headers[key]) {
            const name = key.toLowerCase();
            response.headers[name] = val;
          }
        }
        return;
      }
    };

    const readBody = function () {
      //https://xhr.spec.whatwg.org/
      if (!xhr.responseType || xhr.responseType === "text") {
        response.text = xhr.responseText;
        response.data = xhr.responseText;
        try {
          response.xml = xhr.responseXML;
        } catch (error) {}
        // unable to set responseXML due to response type, we attempt to assign responseXML
        // when the type is text even though it's against the spec due to several libraries
        // and browser vendors who allow this behavior. causing these requests to fail when
        // xhook is installed on a page.
      } else if (xhr.responseType === "document") {
        response.xml = xhr.responseXML;
        response.data = xhr.responseXML;
      } else {
        response.data = xhr.response;
      }
      //new in some browsers
      if ("responseURL" in xhr) {
        response.finalUrl = xhr.responseURL;
      }
    };

    //write response into facade xhr
    const writeHead = function () {
      facade.status = response.status;
      facade.statusText = response.statusText;
    };

    const writeBody = function () {
      if ("text" in response) {
        facade.responseText = response.text;
      }
      if ("xml" in response) {
        facade.responseXML = response.xml;
      }
      if ("data" in response) {
        facade.response = response.data;
      }
      if ("finalUrl" in response) {
        facade.responseURL = response.finalUrl;
      }
    };

    const emitFinal = function () {
      if (!hasError) {
        facade.dispatchEvent("load", {});
      }
      facade.dispatchEvent("loadend", {});
      if (hasError) {
        facade.readyState = 0;
      }
    };

    //ensure ready state 0 through 4 is handled
    const emitReadyState = function (n) {
      while (n > currentState && currentState < 4) {
        facade.readyState = ++currentState;
        // make fake events for libraries that actually check the type on
        // the event object
        if (currentState === 1) {
          facade.dispatchEvent("loadstart", {});
        }
        if (currentState === 2) {
          writeHead();
        }
        if (currentState === 4) {
          writeHead();
          writeBody();
        }
        facade.dispatchEvent("readystatechange", {});
        //delay final events incase of error
        if (currentState === 4) {
          if (request.async === false) {
            emitFinal();
          } else {
            setTimeout(emitFinal, 0);
          }
        }
      }
    };

    //control facade ready state
    const setReadyState = function (n) {
      //emit events until readyState reaches 4
      if (n !== 4) {
        emitReadyState(n);
        return;
      }
      //before emitting 4, run all 'after' hooks in sequence
      const afterHooks = hooks.listeners("after");
      var process = function () {
        if (afterHooks.length > 0) {
          //execute each 'before' hook one at a time
          const hook = afterHooks.shift();
          if (hook.length === 2) {
            hook(request, response);
            process();
          } else if (hook.length === 3 && request.async) {
            hook(request, response, process);
          } else {
            process();
          }
        } else {
          //response ready for reading
          emitReadyState(4);
        }
        return;
      };
      process();
    };

    //==========================
    // Facade XHR
    var facade = EventEmitter();
    request.xhr = facade;

    // Handle the underlying ready state
    xhr.onreadystatechange = function (event) {
      //pull status and headers
      try {
        if (xhr.readyState === 2) {
          readHead();
        }
      } catch (error) {}
      //pull response data
      if (xhr.readyState === 4) {
        transiting = false;
        readHead();
        readBody();
      }

      setReadyState(xhr.readyState);
    };

    //mark this xhr as errored
    const hasErrorHandler = function () {
      hasError = true;
    };
    facade.addEventListener("error", hasErrorHandler);
    facade.addEventListener("timeout", hasErrorHandler);
    facade.addEventListener("abort", hasErrorHandler);
    // progress means we're current downloading...
    facade.addEventListener("progress", function (event) {
      if (currentState < 3) {
        setReadyState(3);
      } else if (xhr.readyState <= 3) {
        //until ready (4), each progress event is followed by readystatechange...
        facade.dispatchEvent("readystatechange", {}); //TODO fake an XHR event
      }
    });

    // initialise 'withCredentials' on facade xhr in browsers with it
    // or if explicitly told to do so
    if ("withCredentials" in xhr) {
      facade.withCredentials = false;
    }
    facade.status = 0;

    // initialise all possible event handlers
    for (let event of Array.from(COMMON_EVENTS.concat(UPLOAD_EVENTS))) {
      facade[`on${event}`] = null;
    }

    facade.open = function (method, url, async, user, pass) {
      // Initailize empty XHR facade
      currentState = 0;
      hasError = false;
      transiting = false;
      //reset request
      request.headers = {};
      request.headerNames = {};
      request.status = 0;
      request.method = method;
      request.url = url;
      request.async = async !== false;
      request.user = user;
      request.pass = pass;
      //reset response
      response = {};
      response.headers = {};
      // openned facade xhr (not real xhr)
      setReadyState(1);
    };

    facade.send = function (body) {
      //read xhr settings before hooking
      let k, modk;
      for (k of ["type", "timeout", "withCredentials"]) {
        modk = k === "type" ? "responseType" : k;
        if (modk in facade) {
          request[k] = facade[modk];
        }
      }

      request.body = body;
      const send = function () {
        //proxy all events from real xhr to facade
        proxyEvents(COMMON_EVENTS, xhr, facade);
        //proxy all upload events from the real to the upload facade
        if (facade.upload) {
          proxyEvents(
            COMMON_EVENTS.concat(UPLOAD_EVENTS),
            xhr.upload,
            facade.upload,
          );
        }

        //prepare request all at once
        transiting = true;
        //perform open
        xhr.open(
          request.method,
          request.url,
          request.async,
          request.user,
          request.pass,
        );

        //write xhr settings
        for (k of ["type", "timeout", "withCredentials"]) {
          modk = k === "type" ? "responseType" : k;
          if (k in request) {
            xhr[modk] = request[k];
          }
        }

        //insert headers
        for (let header in request.headers) {
          const value = request.headers[header];
          if (header) {
            xhr.setRequestHeader(header, value);
          }
        }
        //real send!
        xhr.send(request.body);
      };

      const beforeHooks = hooks.listeners("before");
      //process beforeHooks sequentially
      var process = function () {
        if (!beforeHooks.length) {
          return send();
        }
        //go to next hook OR optionally provide response
        const done = function (userResponse) {
          //break chain - provide dummy response (readyState 4)
          if (
            typeof userResponse === "object" &&
            (typeof userResponse.status === "number" ||
              typeof response.status === "number")
          ) {
            mergeObjects(userResponse, response);
            if (!("data" in userResponse)) {
              userResponse.data = userResponse.response || userResponse.text;
            }
            setReadyState(4);
            return;
          }
          //continue processing until no beforeHooks left
          process();
        };
        //specifically provide headers (readyState 2)
        done.head = function (userResponse) {
          mergeObjects(userResponse, response);
          setReadyState(2);
        };
        //specifically provide partial text (responseText  readyState 3)
        done.progress = function (userResponse) {
          mergeObjects(userResponse, response);
          setReadyState(3);
        };

        const hook = beforeHooks.shift();
        //async or sync?
        if (hook.length === 1) {
          done(hook(request));
        } else if (hook.length === 2 && request.async) {
          //async handlers must use an async xhr
          hook(request, done);
        } else {
          //skip async hook on sync requests
          done();
        }
        return;
      };
      //kick off
      process();
    };

    facade.abort = function () {
      status = ABORTED;
      if (transiting) {
        xhr.abort(); //this will emit an 'abort' for us
      } else {
        facade.dispatchEvent("abort", {});
      }
    };

    facade.setRequestHeader = function (header, value) {
      //the first header set is used for all future case-alternatives of 'name'
      const lName = header != null ? header.toLowerCase() : undefined;
      const name = (request.headerNames[lName] =
        request.headerNames[lName] || header);
      //append header to any previous values
      if (request.headers[name]) {
        value = request.headers[name] + ", " + value;
      }
      request.headers[name] = value;
    };
    facade.getResponseHeader = (header) =>
      nullify(response.headers[header ? header.toLowerCase() : undefined]);

    facade.getAllResponseHeaders = () =>
      nullify(headers.convert(response.headers));

    //proxy call only when supported
    if (xhr.overrideMimeType) {
      facade.overrideMimeType = function () {
        xhr.overrideMimeType.apply(xhr, arguments);
      };
    }

    //create emitter when supported
    if (xhr.upload) {
      let up = EventEmitter();
      facade.upload = up;
      request.upload = up;
    }

    facade.UNSENT = 0;
    facade.OPENED = 1;
    facade.HEADERS_RECEIVED = 2;
    facade.LOADING = 3;
    facade.DONE = 4;

    // fill in default values for an empty XHR object according to the spec
    facade.response = "";
    facade.responseText = "";
    facade.responseXML = null;
    facade.readyState = 0;
    facade.statusText = "";

    return facade;
  };

  Xhook$1.UNSENT = 0;
  Xhook$1.OPENED = 1;
  Xhook$1.HEADERS_RECEIVED = 2;
  Xhook$1.LOADING = 3;
  Xhook$1.DONE = 4;

  //patch interface
  var XMLHttpRequest = {
    patch() {
      if (Native$1) {
        windowRef.XMLHttpRequest = Xhook$1;
      }
    },
    unpatch() {
      if (Native$1) {
        windowRef.XMLHttpRequest = Native$1;
      }
    },
    Native: Native$1,
    Xhook: Xhook$1,
  };

  /******************************************************************************
  Copyright (c) Microsoft Corporation.

  Permission to use, copy, modify, and/or distribute this software for any
  purpose with or without fee is hereby granted.

  THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
  REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
  AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
  INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
  LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
  OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
  PERFORMANCE OF THIS SOFTWARE.
  ***************************************************************************** */

  function __rest(s, e) {
    var t = {};
    for (var p in s)
      if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
      for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
        if (
          e.indexOf(p[i]) < 0 &&
          Object.prototype.propertyIsEnumerable.call(s, p[i])
        )
          t[p[i]] = s[p[i]];
      }
    return t;
  }

  function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  }

  //browser's fetch
  const Native = windowRef.fetch;
  function copyToObjFromRequest(req) {
    const copyedKeys = [
      "method",
      "headers",
      "body",
      "mode",
      "credentials",
      "cache",
      "redirect",
      "referrer",
      "referrerPolicy",
      "integrity",
      "keepalive",
      "signal",
      "url",
    ];
    let copyedObj = {};
    copyedKeys.forEach((key) => (copyedObj[key] = req[key]));
    return copyedObj;
  }
  function covertHeaderToPlainObj(headers) {
    if (headers instanceof Headers) {
      return covertTDAarryToObj([...headers.entries()]);
    }
    if (Array.isArray(headers)) {
      return covertTDAarryToObj(headers);
    }
    return headers;
  }
  function covertTDAarryToObj(input) {
    return input.reduce((prev, [key, value]) => {
      prev[key] = value;
      return prev;
    }, {});
  }
  /**
   * if fetch(hacked by Xhook) accept a Request as a first parameter, it will be destrcuted to a plain object.
   * Finally the whole network request was convert to fectch(Request.url, other options)
   */
  const Xhook = function (input, init = { headers: {} }) {
    let options = Object.assign(Object.assign({}, init), { isFetch: true });
    if (input instanceof Request) {
      const requestObj = copyToObjFromRequest(input);
      const prevHeaders = Object.assign(
        Object.assign({}, covertHeaderToPlainObj(requestObj.headers)),
        covertHeaderToPlainObj(options.headers),
      );
      options = Object.assign(
        Object.assign(Object.assign({}, requestObj), init),
        { headers: prevHeaders, acceptedRequest: true },
      );
    } else {
      options.url = input;
    }
    const beforeHooks = hooks.listeners("before");
    const afterHooks = hooks.listeners("after");
    return new Promise(function (resolve, reject) {
      let fullfiled = resolve;
      const processAfter = function (response) {
        if (!afterHooks.length) {
          return fullfiled(response);
        }
        const hook = afterHooks.shift();
        if (hook.length === 2) {
          hook(options, response);
          return processAfter(response);
        } else if (hook.length === 3) {
          return hook(options, response, processAfter);
        } else {
          return processAfter(response);
        }
      };
      const done = function (userResponse) {
        if (userResponse !== undefined) {
          const response = new Response(
            userResponse.body || userResponse.text,
            userResponse,
          );
          resolve(response);
          processAfter(response);
          return;
        }
        //continue processing until no hooks left
        processBefore();
      };
      const processBefore = function () {
        if (!beforeHooks.length) {
          send();
          return;
        }
        const hook = beforeHooks.shift();
        if (hook.length === 1) {
          return done(hook(options));
        } else if (hook.length === 2) {
          return hook(options, done);
        }
      };
      const send = () =>
        __awaiter(this, void 0, void 0, function* () {
          const { url, isFetch, acceptedRequest } = options,
            restInit = __rest(options, ["url", "isFetch", "acceptedRequest"]);
          if (
            input instanceof Request &&
            restInit.body instanceof ReadableStream
          ) {
            restInit.body = yield new Response(restInit.body).text();
          }
          return Native(url, restInit)
            .then((response) => processAfter(response))
            .catch(function (err) {
              fullfiled = reject;
              processAfter(err);
              return reject(err);
            });
        });
      processBefore();
    });
  };
  //patch interface
  var fetch = {
    patch() {
      if (Native) {
        windowRef.fetch = Xhook;
      }
    },
    unpatch() {
      if (Native) {
        windowRef.fetch = Native;
      }
    },
    Native,
    Xhook,
  };

  //the global hooks event emitter is also the global xhook object
  //(not the best decision in hindsight)
  const xhook = hooks;
  xhook.EventEmitter = EventEmitter;
  //modify hooks
  xhook.before = function (handler, i) {
    if (handler.length < 1 || handler.length > 2) {
      throw "invalid hook";
    }
    return xhook.on("before", handler, i);
  };
  xhook.after = function (handler, i) {
    if (handler.length < 2 || handler.length > 3) {
      throw "invalid hook";
    }
    return xhook.on("after", handler, i);
  };

  //globally enable/disable
  xhook.enable = function () {
    XMLHttpRequest.patch();
    fetch.patch();
  };
  xhook.disable = function () {
    XMLHttpRequest.unpatch();
    fetch.unpatch();
  };
  //expose native objects
  xhook.XMLHttpRequest = XMLHttpRequest.Native;
  xhook.fetch = fetch.Native;

  //expose helpers
  xhook.headers = headers.convert;

  //enable by default
  xhook.enable();

  return xhook;
})();
//# sourceMappingURL=xhook.min.js.map

// End xhook mod

// webpack hook for regular

/*
  >: Global defines.
*/

var _ = null;
tweebGlobalAdded = -1;
sessionTweetStore = {};

function ulog(...args) {
  console.log(`%c[Tweeb]`, "color:#8bdffe", ...args);
}

function saveData(data, fileName) {
  var a = document.createElement("a");
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

function uLogTimelineError(timelineType, ...args) {
  ulog(`Cannot find instructions for timeline @ ${timelineType}:`, ...args);
}

/**
 * Attempts to remove grok buttons for a given entry
 * @param {object} entry
 * @returns
 */
function yeetGrok(entry) {
  // Coalesce the base entry gracefully
  const baseEntry = entry?.item || entry?.content || entry?.result;
  if (!baseEntry) return entry;

  const result = baseEntry.itemContent?.tweet_results?.result;
  if (!result) return entry;

  if (result.grok_analysis_button) result.grok_analysis_button = false;
  if (result.tweet?.grok_analysis_button)
    result.tweet.grok_analysis_button = false;

  if (result.legacy?.retweeted_status_result?.grok_analysis_button) {
    result.legacy.retweeted_status_result.grok_analysis_button = false;
  }

  if (result.tweet?.legacy?.retweeted_status_result?.grok_analysis_button) {
    result.tweet.legacy.retweeted_status_result.grok_analysis_button = false;
  }

  return entry;
}

function isEmpty(obj) {
  for (const prop in obj) {
    if (Object.hasOwn(obj, prop)) {
      return false;
    }
  }

  return true;
}

/**
 * Extract timelines
 * @param {object} timelineData
 * @returns
 */
function getTimelineInstructions(timelineData) {
  const data = timelineData?.data;
  if (!data) return null;

  // A clean waterfall of possible instruction paths using optional chaining
  return (
    data.communityResults?.result?.community_media_timeline?.timeline
      ?.instructions ||
    data.communityResults?.result?.ranked_community_timeline?.timeline
      ?.instructions ||
    data.home?.home_timeline_urt?.instructions ||
    data.list?.tweets_timeline?.timeline?.instructions ||
    data.search_by_raw_query?.search_timeline?.timeline?.instructions ||
    data.threaded_conversation_with_injections_v2?.instructions ||
    data.user?.result?.timeline_v2?.timeline?.instructions ||
    data.user?.result?.timeline?.timeline?.instructions ||
    data.viewer?.explore_communities_timeline?.timeline?.instructions ||
    null
  );
}

/**
 * Extract timeline data and solve for it.
 * @param {object} timelineData The timeline data
 * @returns
 */
function timelineExtractor(timelineData, grokSkip = false) {
  const instructions = getTimelineInstructions(timelineData);

  if (!instructions) {
    // Edge case: Empty search timeline
    if (
      timelineData?.data?.search_by_raw_query?.search_timeline &&
      isEmpty(timelineData.data.search_by_raw_query.search_timeline)
    ) {
      return;
    }
    ulog("Cannot find instructions for timeline", timelineData);
    return;
  }
  // Reconstruct timeline instructions to remove promotions.

  var newInstructions = [];
  for (let instructIdx = 0; instructIdx < instructions.length; instructIdx++) {
    var instruction = instructions[instructIdx];
    if (instruction.type == "TimelineAddEntries") {
      ulog(instruction.entries);
      var cleanedEntries = instruction.entries.filter((entry) => {
        if (entry.entryId.startsWith("conversationthread-")) {
          entry.content.items = entry.content.items.filter((subEntry) => {
            const hasPromoMetadata =
              !!subEntry?.item?.itemContent?.promotedMetadata;
            const oldPromote = subEntry.entryId.includes("-promoted-tweet-");
            return hasPromoMetadata || oldPromote ? false : true;
          });
        }
        return !entry.entryId.startsWith("promoted");
      });
      // Remove grok.
      if (!grokSkip) {
        instruction.entries.forEach((entry) => {
          if (entry.entryId.startsWith("conversationthread-")) {
            entry.content.items.forEach((subEntry) => {
              if (subEntry.entryId.includes("-tweet-")) {
                subEntry = yeetGrok(subEntry);
              }
            });
            // Yes, all 3 different methods.
          } else if (entry.entryId.startsWith("tweet-")) {
            entry = yeetGrok(entry);
          }
        });
      }
      instruction.entries = cleanedEntries;
    }
    newInstructions.push(instruction);
  }

  // Extract timeline data

  var hasPushedTweets = false;

  newInstructions.forEach((instruction) => {
    // 1. Destructure for cleaner variable names
    const { type, entries, moduleEntryId, moduleItems } = instruction;

    // 2. Handle AddToModule
    if (type === "TimelineAddToModule") {
      if (moduleEntryId?.split("-")[1] === "grid") {
        pushTweetsBundle(moduleItems);
        hasPushedTweets = true;
      }
      return; // Stop processing this specific instruction
    }

    // 3. Handle AddEntries
    if (type === "TimelineAddEntries") {
      // Ignore if no entries
      if (!entries || entries.length === 0) return;

      const firstId = entries[0]?.entryId || "";

      // A: Profile or Search Grids
      if (
        firstId.startsWith("profile-grid-") ||
        firstId.startsWith("search-grid-")
      ) {
        pushTweetsBundle(entries[0].content.items);
        hasPushedTweets = true;
        return;
      }

      // B: Blank Cursors (checks if ALL items are cursors, max 2)
      const isOnlyCursors =
        entries.length <= 2 &&
        entries.every((e) => e.entryId?.startsWith("cursor-"));

      if (isOnlyCursors) {
        if (!hasPushedTweets) {
          ulog("Found blank cursor");
          tweebGlobalAdded = 0;
        }
        return; // Do nothing for blank cursors
      }

      // C: Default behavior (Push the entries)
      pushTweetsBundle(entries);
      hasPushedTweets = true;
    }
  });
}

function pushExistingTweets(objectEntries) {
  if (sessionTweetStore === undefined) {
    sessionTweetStore = {};
  }

  const seenIds = Object.keys(sessionTweetStore);
  var timelineTweets = objectEntries;
  var filteredTweetIds = Object.keys(timelineTweets).filter(
    (key) => !seenIds.includes(key),
  );
  var newTweets = {};
  for (let index = 0; index < filteredTweetIds.length; index++) {
    const tweetId = filteredTweetIds[index];
    newTweets[tweetId] = timelineTweets[tweetId];
  }
  sessionTweetStore = { ...sessionTweetStore, ...newTweets };
  // Force negative to ensure page scrolls
  tweebGlobalAdded = -1;
  ulog("[refresh]", "addedTweets", tweebGlobalAdded);
  const timer = Date.now();
  writeTweetStore(newTweets);
  ulog(
    "[refresh]",
    `Saved to store. Took: ${(Date.now() - timer) / 1000}s to complete.`,
  );
}

/**
 * Given a list of instructions, extracts and pushes tweets to the bundle.
 * @param {array} entries
 */
function pushTweetsBundle(entries) {
  if (sessionTweetStore === undefined) {
    sessionTweetStore = {};
  }

  const seenIds = Object.keys(sessionTweetStore);
  var timelineTweets = extractTweetData(entries);
  var filteredTweetIds = Object.keys(timelineTweets).filter(
    (key) => !seenIds.includes(key),
  );
  var newTweets = {};

  for (let index = 0; index < filteredTweetIds.length; index++) {
    const tweetId = filteredTweetIds[index];
    newTweets[tweetId] = timelineTweets[tweetId];
  }
  sessionTweetStore = { ...sessionTweetStore, ...newTweets };

  tweebGlobalAdded = Object.keys(newTweets).length;
  if (tweebGlobalAdded > 0) {
    triggerSnackbar(`Added ${tweebGlobalAdded} new tweets.`);
    ulog("[newPush]", "addedTweets", tweebGlobalAdded);
    const timer = Date.now();
    writeTweetStore(newTweets);
    ulog(
      "[newPush]",
      `Saved to store. Took: ${(Date.now() - timer) / 1000}s to complete.`,
    );
  }
}

function writeTweetStore(newTweets) {
  GM_setValue(`tweeb-Bundle-${Date.now()}`, JSON.stringify(newTweets));
}

function cleanupStore() {
  const tweebKeys = GM_listValues()
    .filter((m) => {
      return m.startsWith("tweeb-Bundle") || m.startsWith("tweeb-BatchBundle");
    })
    .sort();
  if (tweebKeys.length >= 10) {
    // localStorage lock so that 2 cleanup operations can't happen at the same time.
    if (GM_getValue("cleanupLock")) return;
    GM_setValue("cleanupLock", "1");
    ulog("Cleaning up bundle Storage...");
    var bigBundle = {};
    tweebKeys.forEach((tweebBundleKey) => {
      const partialBundle = JSON.parse(GM_getValue(tweebBundleKey));
      ulog(partialBundle);
      Object.keys(partialBundle).forEach((tweetKey) => {
        bigBundle[tweetKey] = partialBundle[tweetKey];
      });
      GM_deleteValue(tweebBundleKey);
    });
    GM_setValue(`tweeb-BatchBundle-${Date.now()}`, JSON.stringify(bigBundle));
    GM_deleteValue("cleanupLock");
  }
}

function debugStorage() {
  ulog(
    "List of bundles in storage are:",
    GM_listValues()
      .filter((m) => {
        return (
          m.startsWith("tweeb-Bundle") || m.startsWith("tweeb-BatchBundle")
        );
      })
      .sort(),
  );
}

function wipeTweebStore() {
  const tweebKeys = GM_listValues()
    .filter((m) => {
      return m.startsWith("tweeb-Bundle") || m.startsWith("tweeb-BatchBundle");
    })
    .sort();
  tweebKeys.forEach((tweebBundleKey) => {
    GM_deleteValue(tweebBundleKey);
  });
}

function getAllTweebStore() {
  cleanupStore(); // Probably fine to execute cleanup storage here since you only download your archive ever so frequently.

  var bigBundle = {};
  // Sort by time
  const tweebKeys = GM_listValues()
    .filter((m) => {
      return m.startsWith("tweeb-Bundle") || m.startsWith("tweeb-BatchBundle");
    })
    .sort();
  // ulog(tweebKeys);
  tweebKeys.forEach((tweebBundleKey) => {
    const partialBundle = JSON.parse(GM_getValue(tweebBundleKey));
    // ulog(partialBundle);
    Object.keys(partialBundle).forEach((tweetKey) => {
      bigBundle[tweetKey] = partialBundle[tweetKey];
    });
  });
  return bigBundle;
}

function smuggleTweetResults(tweet_result) {
  let trueResult = null;
  if (tweet_result?.result?.tweet) {
    trueResult = tweet_result?.result?.tweet;
  } else {
    trueResult = tweet_result?.result;
  }
  if (trueResult == undefined || trueResult == null) {
    return null;
  }

  if (tweet_result.post_image_description) {
    trueResult._tweeb = {};
    trueResult._tweeb.media_description = tweet_result.post_image_description;
  }
  return trueResult;
}

/**
 * Finds and extracts the proper root for the tweet object.
 * @param {object} entryItem potential tweet entry from the timeline
 * @returns null if not a tweet, else the tweet object
 */
function getRealTweetObject(entryItem) {
  const entryId = entryItem?.entryId || "";

  if (
    entryId.startsWith("tweet-") ||
    entryId.startsWith("profile-grid-") ||
    entryId.startsWith("search-grid-")
  ) {
    const baseEntry = entryItem.item || entryItem.content;
    return smuggleTweetResults(baseEntry?.itemContent?.tweet_results);
  }

  if (entryId.includes("-tweet-")) {
    return smuggleTweetResults(entryItem.item?.itemContent?.tweet_results);
  }

  if (entryItem.result?.__typename?.startsWith("Tweet")) {
    return smuggleTweetResults(entryItem);
  }

  return null;
}

/**
 * Flattens entries of instructions (mixed conversations and regular tweets) into 1 single flat array of tweets
 * @param {array} instructionEntries list of entries from the timeline
 * @returns flattened array for tweets
 */
function flattenTweetDetail(instructionEntries) {
  if (!Array.isArray(instructionEntries)) return [];

  return instructionEntries.flatMap((entry) => {
    const id = entry?.entryId || "";

    // Identify container modules (threads, related tweets, etc.)
    // It must contain "conversation" or "relatedtweets", but CANNOT contain "-tweet-"
    const isContainer =
      (id.includes("conversation") || id.includes("relatedtweets")) &&
      !id.includes("-tweet-");

    if (isContainer && entry.content?.items) {
      // Recurse and flatten the sub-items
      return flattenTweetDetail(entry.content.items);
    }

    // If it's a standard tweet, a leaf-node inside a thread, or a cursor, just return it
    return entry;
  });
}

/**
 * Solves a user object from Twitter/X GraphQL responses.
 * @param {object} coreResult userCoreResult
 * @returns object
 */
function solveUserObject(coreResult) {
  if (!coreResult?.legacy) {
    ulog("failed to find legacyData in ", coreResult);
    return {};
  }

  const legacy = coreResult.legacy;
  const core = coreResult.core;

  // --- Bio & URL Resolution ---
  let fullBioText = legacy.description || "";
  legacy.entities?.description?.urls?.forEach((url) => {
    fullBioText = fullBioText.replace(url.url, url.expanded_url);
  });

  // Main Profile Website Link (Resolving the t.co shortlink)
  let websiteUrl = legacy.url || null;
  if (legacy.entities?.url?.urls?.length > 0) {
    websiteUrl = legacy.entities.url.urls[0].expanded_url || websiteUrl;
  }

  // Prefer core data, fallback to legacy
  const handle = core?.screen_name || legacy.screen_name;
  const display_name = core?.name || legacy.name;
  const createdStr = core?.created_at || legacy.created_at;

  if (!handle) {
    alert(
      "[Tweeb.user.js] User object appears to be invalidated. Report this to GitHub.",
    );
  }

  // --- Image Handling ---
  // Twitter serves avatars with "_normal" (48x48). We can strip it to get the original high-res image.
  let avatarUrl =
    coreResult.avatar?.image_url || legacy.profile_image_url_https || null;
  let avatarHighRes = avatarUrl ? avatarUrl.replace("_normal", "") : null;

  // --- Professional Data Extraction ---
  let professionalCategory = null;
  let professionalType = null;
  if (coreResult.professional) {
    professionalType = coreResult.professional.professional_type;
    const catArray = coreResult.professional.category;
    if (catArray && catArray.length > 0) {
      professionalCategory = catArray[0].name; // e.g., "Media & News Company"
    }
  }

  return {
    id: coreResult.rest_id,
    display_name: display_name,
    handle: handle,
    location: coreResult.location?.location || legacy.location || null,
    created: createdStr ? Date.parse(createdStr) / 1000 : null,
    bio: fullBioText,
    website: websiteUrl,
    avatar: avatarHighRes || avatarUrl,
    banner: legacy.profile_banner_url || null,
    professional_type: professionalType,
    professional_category: professionalCategory,
    pinned: legacy.pinned_tweet_ids_str || [],

    locked: !!(coreResult.privacy?.protected || legacy.protected),
    graduation: !!coreResult.has_graduated_access,

    blue: {
      has: !!coreResult.is_blue_verified,
      legacy: !!(coreResult.verification?.verified || legacy.verified),
      hidden: !!coreResult.has_hidden_subscriptions_on_profile,
    },

    counts: {
      followers: legacy.followers_count ?? -1, // NEW: The combined display number
      posts: legacy.statuses_count ?? -1,
      likes: legacy.favourites_count ?? -1,
      media: legacy.media_count ?? -1,
      listed: legacy.listed_count ?? 0, // NEW: How many lists they are on
      follows: {
        fast: legacy.fast_followers_count ?? 0,
        slow: legacy.normal_followers_count ?? -1,
        friends: legacy.friends_count ?? -1, // "Friends" is Twitter's internal name for "Following"
      },
    },
  };
}

function extractMediaInfo(extEntity) {
  if (!extEntity?.media) return [];

  return extEntity.media
    .map((mediaItem) => {
      if (mediaItem.type === "photo") {
        const mediaFinal = {
          type: mediaItem.type,
          url: mediaItem.media_url_https + "?name=orig",
          alt: mediaItem.ext_alt_text || null,
          size: {
            orig: [
              mediaItem.original_info?.width,
              mediaItem.original_info?.height,
            ],
            large: [
              mediaItem.sizes?.large?.width,
              mediaItem.sizes?.large?.height,
            ],
          },
        };

        if (mediaItem.features?.all?.tags) {
          mediaFinal.tags = mediaItem.features.all.tags.map((tag) =>
            tag.type === "user"
              ? {
                  id: tag.user_id,
                  display_name: tag.name,
                  handle: tag.screen_name,
                  type: tag.type,
                }
              : tag,
          );
        }
        return mediaFinal;
      }

      if (mediaItem.type === "video" || mediaItem.type === "animated_gif") {
        const variants = mediaItem.video_info?.variants || [];
        // Find variant with highest bitrate
        const bestVariant = variants.reduce((prev, current) => {
          return prev.bitrate > (current.bitrate || 0) ? prev : current;
        }, variants[0]);

        return {
          type: "video",
          url: bestVariant?.url,
        };
      }

      ulog("Media type", mediaItem.type, "not known.", mediaItem);
      return null;
    })
    .filter(Boolean); // removes nulls if unrecognized type
}

/**
 * Solves a tweetEntry/Object.
 * @param {object} tweetItem The tweet Object. Could be almost any type.
 * @returns null if no tweetObject is found, a object if a simplified tweet object can be constructed
 */
function solveTweet(tweetItem) {
  let tweetObject = getRealTweetObject(tweetItem);
  if (!tweetObject) return null;

  if (tweetObject.tweet) {
    tweetObject = tweetObject.tweet;
  }

  if (tweetObject.__typename?.includes("Tombstone")) return null;

  const tweetContent = tweetObject.legacy;

  if (!tweetContent) {
    if (tweetObject.rest_id) {
      return {
        id: tweetObject.rest_id,
        text: "[Tweet/Quote Unavailable or Restricted]",
        missing: true,
      };
    }
    return null;
  }

  if (
    tweetContent.retweeted_status_result ||
    tweetObject.retweeted_status_result
  ) {
    const rtNode =
      tweetObject.retweeted_status_result ||
      tweetContent.retweeted_status_result;
    return solveTweet(rtNode) || null;
  }

  // --- Text & Entity Extraction ---
  let fullText = "";
  let rawHashtags = [];
  let rawMentions = [];

  if (tweetObject.note_tweet?.note_tweet_results?.result) {
    const noteResults = tweetObject.note_tweet.note_tweet_results.result;
    fullText = noteResults.text || "";

    // Note Tweets (Long form) have their own entity set
    noteResults.entity_set?.urls?.forEach((url) => {
      fullText = fullText.replace(url.url, url.expanded_url);
    });
    rawHashtags = noteResults.entity_set?.hashtags || [];
    rawMentions = noteResults.entity_set?.user_mentions || [];
  } else {
    fullText = tweetContent.full_text || "";
    tweetContent.entities?.urls?.forEach((url) => {
      fullText = fullText.replace(url.url, url.expanded_url);
    });
    tweetContent.entities?.media?.forEach((media) => {
      fullText = fullText.replace(media.url, "");
    });

    rawHashtags = tweetContent.entities?.hashtags || [];
    rawMentions = tweetContent.entities?.user_mentions || [];
  }
  fullText = fullText.trim();

  // Clean up hashtags and mentions into simple arrays
  const hashtags = rawHashtags.map((h) => h.text);
  const mentions = rawMentions.map((m) => ({
    id: m.id_str,
    handle: m.screen_name,
    name: m.name,
  }));

  // --- Quote Extraction ---
  let solvedQuote = null;
  const rawQuote =
    tweetObject.quoted_status_result ||
    tweetContent.quoted_status_result ||
    tweetObject.quotedRefResult;
  if (rawQuote) solvedQuote = solveTweet(rawQuote);

  if (!solvedQuote && tweetContent.quoted_status_id_str) {
    solvedQuote = {
      id: tweetContent.quoted_status_id_str,
      text: "[Quote Unavailable]",
      missing: true,
    };
  }

  // --- Views ---
  let viewCount = 0;
  if (tweetObject.views && tweetObject.views.count) {
    viewCount = parseInt(tweetObject.views.count, 10);
  }

  // --- Source Tag Cleaner (Turns "<a href...>Twitter for Android</a>" into "Twitter for Android") ---
  let sourceApp = tweetObject.source || tweetContent.source || "";
  const sourceMatch = sourceApp.match(/>([^<]+)</);
  if (sourceMatch) sourceApp = sourceMatch[1];

  // --- Construct Standard Output ---
  const simpleTweet = {
    id: tweetContent.id_str || tweetObject.rest_id,
    conversation_id: tweetContent.conversation_id_str || tweetContent.id_str, // Critical for threads
    text: fullText,
    user: solveUserObject(tweetObject.core?.user_results?.result),
    media: extractMediaInfo(tweetContent.extended_entities),
    created: tweetContent.created_at
      ? Date.parse(tweetContent.created_at) / 1000
      : null,

    // New Public Metadata
    lang: tweetContent.lang || "unknown",
    source: sourceApp || "unknown",
    sensitive: tweetContent.possibly_sensitive || false,
    edited: tweetObject.edit_control?.edit_tweet_ids?.length > 1,

    // Extracted Entities
    hashtags: hashtags,
    mentions: mentions,

    counts: {
      reply: tweetContent.reply_count || 0,
      like: tweetContent.favorite_count || 0,
      retweet: tweetContent.retweet_count || 0,
      quote: tweetContent.quote_count || 0,
      bookmarked: tweetContent.bookmark_count || 0,
      views: viewCount,
    },

    quote: solvedQuote,

    // Enhanced Reply Info
    reply: tweetContent.in_reply_to_status_id_str
      ? {
          to_tweet_id: tweetContent.in_reply_to_status_id_str,
          to_user_id: tweetContent.in_reply_to_user_id_str,
          to_handle: tweetContent.in_reply_to_screen_name,
        }
      : null,
  };

  if (tweetObject.post_image_description) {
    simpleTweet.media_image_description = tweetObject.post_image_description;
  }

  return simpleTweet;
}

function extractTweetData(entries) {
  var allTweetsWithMedia = {};

  var flattenEntries = flattenTweetDetail(entries);
  // ulog("flattenEntries", flattenEntries);

  flattenEntries.forEach((tweetItem) => {
    var simpleTweet = solveTweet(tweetItem);
    if (simpleTweet) {
      allTweetsWithMedia[simpleTweet.id] = simpleTweet;
    }
  });

  return allTweetsWithMedia;
}

function isParsable(u) {
  return (
    u.pathname.includes("/graphql/") &&
    (u.pathname.endsWith("TweetDetail") ||
      u.pathname.endsWith("UserMedia") ||
      u.pathname.endsWith("Timeline") ||
      u.pathname.endsWith("UserTweets") ||
      u.pathname.endsWith("UserTweetsAndReplies"))
  );
}

/*
  Xhook: Via regular twitter.
*/

function xhook_hook(request, response) {
  const u = new URL(request.url);
  if (request.url && isParsable(u)) {
    // ulog(u,"Captured")
    if (response.status == 429) {
      alert(
        `[Tweeb.user.js] Rate limit exceeded.\nLimits will refresh in: ${humanizeDuration(
          (response.headers["x-rate-limit-reset"] - Date.now() / 1000) * 1000,
          { round: true },
        )}`,
      );
      ulog(
        "Rate limits",
        response.headers["x-rate-limit-remaining"],
        "Bucket Refilled @ ",
        new Date(response.headers["x-rate-limit-reset"] * 1000),
      );
      return;
    }
    try {
      var hometimeline = JSON.parse(response.text);
    } catch (error) {
      // dolly up the error to twitter to handle
      ulog(error);
      return;
    }
    timelineExtractor(hometimeline);
    response.text = JSON.stringify(hometimeline);
  }
  if (
    request.url &&
    u.pathname.includes("/graphql/") &&
    u.pathname.endsWith("AudioSpaceById")
  ) {
    try {
      var spaceByIdData = JSON.parse(response.text);
    } catch (error) {
      // dolly up the error to twitter to handle
      ulog(error);
      return;
    }
    if (
      "data" in Object.keys(spaceByIdData) &&
      spaceByIdData?.data?.audioSpace?.metadata?.media_key
    ) {
      const spaceID = spaceByIdData?.data?.audioSpace?.metadata?.rest_id;
      SessionSpaceCache[spaceID] = spaceByIdData?.data?.audioSpace;
    }
  }
  return response;
}

// Used to capture space media ids.
SessionSpaceCache = {};

function download_space(spaceId) {
  if (spaceId in Object.keys(SessionSpaceCache)) {
    const spaceMeta = SessionSpaceCache[spaceId];
    fetch(
      `https://x.com/i/api/1.1/live_video_stream/status/${spaceMeta.metadata.media_key}`,
    );
  }
}

const XHookBlock = `<a href="#none" id="tweebDL" aria-label="Download Media" role="link"
        class="css-175oi2r r-6koalj r-eqz5dr r-16y2uox r-1habvwh r-cnw61z r-13qz1uu r-1ny4l3l r-1loqt21">
        <div class="css-175oi2r r-sdzlij r-dnmrzs r-1awozwy r-18u37iz r-1777fci r-xyw6el r-o7ynqc r-6416eg" style="padding:5px;">
            <div dir="ltr"
                class="css-146c3p1 r-dnmrzs r-1udh08x r-3s2u2q r-bcqeeo r-1ttztb7 r-qvutc0 r-37j5jr r-adyw6z r-135wba7 r-16dba41 r-dlybji r-nazi8o"
                style="text-overflow: unset; color: rgb(231, 233, 234);"><span
                    class="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3" style="text-overflow: unset;">[DL Tweets] Session</span>
            </div>
        </div>
    </a><a href="#none" id="tweebArchive" aria-label="Download Media" role="link"
        class="css-175oi2r r-6koalj r-eqz5dr r-16y2uox r-1habvwh r-cnw61z r-13qz1uu r-1ny4l3l r-1loqt21">
        <div class="css-175oi2r r-sdzlij r-dnmrzs r-1awozwy r-18u37iz r-1777fci r-xyw6el r-o7ynqc r-6416eg" style="padding:5px;">
            <div dir="ltr"
                class="css-146c3p1 r-dnmrzs r-1udh08x r-3s2u2q r-bcqeeo r-1ttztb7 r-qvutc0 r-37j5jr r-adyw6z r-135wba7 r-16dba41 r-dlybji r-nazi8o"
                style="text-overflow: unset; color: rgb(231, 233, 234);"><span
                    class="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3" style="text-overflow: unset;">[DL Tweets] Archive</span>
            </div>
        </div>
    </a><a href="#none" id="tweebWipe" aria-label="Download Media" role="link"
        class="css-175oi2r r-6koalj r-eqz5dr r-16y2uox r-1habvwh r-cnw61z r-13qz1uu r-1ny4l3l r-1loqt21">
        <div class="css-175oi2r r-sdzlij r-dnmrzs r-1awozwy r-18u37iz r-1777fci r-xyw6el r-o7ynqc r-6416eg" style="padding:5px;">
            <div dir="ltr"
                class="css-146c3p1 r-dnmrzs r-1udh08x r-3s2u2q r-bcqeeo r-1ttztb7 r-qvutc0 r-37j5jr r-adyw6z r-135wba7 r-16dba41 r-dlybji r-nazi8o"
                style="text-overflow: unset; color: rgb(231, 233, 234);"><span
                    class="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3" style="text-overflow: unset;">Wipe Session & Archive</span>
            </div>
        </div>
    </a><a href="#none" id="tweebScroll" aria-label="Toggle AutoScroll" role="link"
        class="css-175oi2r r-6koalj r-eqz5dr r-16y2uox r-1habvwh r-cnw61z r-13qz1uu r-1ny4l3l r-1loqt21">
        <div class="css-175oi2r r-sdzlij r-dnmrzs r-1awozwy r-18u37iz r-1777fci r-xyw6el r-o7ynqc r-6416eg" style="padding:5px;">
            <div dir="ltr"
                class="css-146c3p1 r-dnmrzs r-1udh08x r-3s2u2q r-bcqeeo r-1ttztb7 r-qvutc0 r-37j5jr r-adyw6z r-135wba7 r-16dba41 r-dlybji r-nazi8o"
                style="text-overflow: unset; color: rgb(231, 233, 234);"><span
                    class="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3" style="text-overflow: unset;">Auto Scroll</span>
            </div>
        </div>
    </a><a href="#none" id="tweebScrollRef" aria-label="Toggle AutoScroll With Reference" role="link"
        class="css-175oi2r r-6koalj r-eqz5dr r-16y2uox r-1habvwh r-cnw61z r-13qz1uu r-1ny4l3l r-1loqt21">
        <div class="css-175oi2r r-sdzlij r-dnmrzs r-1awozwy r-18u37iz r-1777fci r-xyw6el r-o7ynqc r-6416eg" style="padding:5px;">
            <div dir="ltr"
                class="css-146c3p1 r-dnmrzs r-1udh08x r-3s2u2q r-bcqeeo r-1ttztb7 r-qvutc0 r-37j5jr r-adyw6z r-135wba7 r-16dba41 r-dlybji r-nazi8o"
                style="text-overflow: unset; color: rgb(231, 233, 234);"><span
                    class="css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3" style="text-overflow: unset;">Auto Scroll [R]</span>
            </div>
        </div>
    </a>`;

function hook_regular_twitter() {
  xhook.after(xhook_hook);
  xhook.before(function (request) {
    const u = new URL(request.url);
    if (
      request.url &&
      (u.pathname.endsWith("client_event.json") ||
        u.pathname.endsWith("error_log.json") ||
        u.pathname.endsWith("/update_subscriptions") ||
        u.pathname.includes("/measurement/") ||
        u.pathname.includes("/live_pipeline/events") ||
        u.pathname.endsWith("user_flow.json") ||
        u.pathname.endsWith("ces/p2") ||
        // Creepy...
        u.pathname.endsWith("2/grok/search.json"))
    ) {
      return new Response(`{}`);
    } else if (
      scrollData[0] &&
      (u.hostname == "pbs.twimg.com" || u.hostname == "video.twimg.com")
    )
      return new Response();
    else if (request.url && isParsable(u)) {
      ulog("Modify Params...");
      var vars = JSON.parse(decodeURI(u.searchParams.get("variables")));

      if (vars && "count" in vars && vars["count"] < 20) {
        vars["count"] = 20;
      }
      if (vars && "includePromotedContent" in vars) {
        vars["includePromotedContent"] = false;
      }

      u.searchParams.set("variables", JSON.stringify(vars));
      // u.searchParams.set("features", JSON.stringify(features));
      request.url = u.toString();
    }
  });

  var XHookNavElement = null;

  const MORETARGET =
    "[aria-label='More menu items'],[data-testid='AppTabBar_More_Menu']";

  var XHookBtnElementcatcher = new MutationObserver(function (mutations) {
    for (const mutation of mutations) {
      // ulog("Mutation updated");
      // console.log(mutation);
      if (mutation.type != "childList") continue;
      if (mutation.target.querySelector(MORETARGET) && !XHookNavElement) {
        XHookNavElement = mutation.target;
        ulog("Found target");
        XHookBtnElementcatcher.disconnect();
        setupSnackbar();
        const moreTarget = mutation.target.querySelector(MORETARGET).parentNode;
        moreTarget.insertAdjacentHTML("beforeend", XHookBlock);
        document
          .querySelector("#tweebDL")
          .addEventListener("click", function () {
            unsafeWindow.TweebDownload();
          });
        document
          .querySelector("#tweebArchive")
          .addEventListener("click", function () {
            unsafeWindow.TweebArchive();
          });
        document
          .querySelector("#tweebWipe")
          .addEventListener("click", function () {
            unsafeWindow.TweebWipeArchive();
          });
        document
          .querySelector("#tweebScroll")
          .addEventListener("click", function () {
            unsafeWindow.TweebScroll();
          });
        document
          .querySelector("#tweebScrollRef")
          .addEventListener("click", function () {
            unsafeWindow.TweebScrollWRef();
          });
      }
    }
  });

  XHookBtnElementcatcher.observe(document, {
    childList: true,
    subtree: true,
  });
}

/*
  OldTwitter
*/

const versioning = GM_info.script.version;

const oldTwitterButtons = `<br><br><div>
    <span><a href="https://github.com/Ristellise/Tweeb.user.js">Tweeb.user.js</a> [OldTwitter Hook]
    v${versioning}</span>.<br>
    <a href="#none" class="tweebDL">Download Session</a><br>
    <a href="#none" class="tweebArchive">Download Archive</a><br>
    <a href="#none" class="tweebScroll">Scroll Timeline</a><br>
    <a href="#none" class="tweebWipe">Scroll Timeline with reference</a><br>
</div>`;

var OLD_TWITTER_HOOKED = false;

function on_old_twitter_message(params) {
  if (params.data.type != "OLDTWITTER_REQUEST_LOAD") return;
  ulog("Detected OldTwitterMessage", params.data);
  const pathName = params.data.url;
  if (!OLD_TWITTER_HOOKED) {
    OLD_TWITTER_HOOKED = true;
    hookOldTwitterTimelineData();
  }
  if (
    pathName.endsWith("HomeLatestTimeline") ||
    pathName.endsWith("HomeTimeline") ||
    pathName.endsWith("UserTweets") ||
    pathName.endsWith("UserTweetsAndReplies") ||
    pathName.endsWith("SearchTimeline") ||
    pathName.endsWith("UserMedia") ||
    pathName.endsWith("TweetDetail")
  ) {
    const timer = Date.now();
    timelineExtractor(params.data.body, true);
    ulog(
      "[timelineExtractor]",
      `Took: ${(Date.now() - timer) / 1000}s to complete.`,
    );
  }
}

function hookOldTwitterTimelineData() {
  setupSnackbar();
  const node = document.querySelector("body#injected-body");
  node
    .querySelector("#about-left")
    .insertAdjacentHTML("beforeend", oldTwitterButtons);
  node
    .querySelector("#about-right")
    .insertAdjacentHTML("beforeend", oldTwitterButtons);
  document
    .querySelectorAll(
      "a.tweebDL, a.tweebArchive, a.tweebWipe, a.tweebScroll, a.tweebScrollRef",
    )
    .forEach((m) => {
      if (m.classList.contains("tweebDL")) {
        m.addEventListener("click", function () {
          unsafeWindow.TweebDownload();
        });
      } else if (m.classList.contains("tweebArchive")) {
        m.addEventListener("click", function () {
          unsafeWindow.TweebArchive();
        });
      } else if (m.classList.contains("tweebWipe")) {
        m.addEventListener("click", function () {
          unsafeWindow.TweebWipeArchive();
        });
      } else if (m.classList.contains("tweebScroll")) {
        m.addEventListener("click", function () {
          unsafeWindow.TweebScroll();
        });
      } else if (m.classList.contains("tweebScrollRef")) {
        m.addEventListener("click", function () {
          unsafeWindow.TweebScrollWRef();
        });
      }
    });
}

function hook_old_twitter_ext() {
  unsafeWindow.addEventListener("message", on_old_twitter_message);
}

/*
  >: Snackbar
*/

const snackStyle = `<style> #tweebSnackbar {   visibility: hidden;   min-width: 250px;   margin-left: -125px;   background-color: #333;   color: #fff;   text-align: center;   border-radius: 2px;   padding: 16px;   position: fixed;   z-index: 1;   left: 50%;   bottom: 30px;   font-size: 17px; }  #tweebSnackbar.show {   visibility: visible;   -webkit-animation: fadein 0.5s, fadeout 0.5s 2.5s;   animation: fadein 0.5s, fadeout 0.5s 2.5s; }  @-webkit-keyframes fadein {   from {bottom: 0; opacity: 0;}    to {bottom: 30px; opacity: 1;} }  @keyframes fadein {   from {bottom: 0; opacity: 0;}   to {bottom: 30px; opacity: 1;} }  @-webkit-keyframes fadeout {   from {bottom: 30px; opacity: 1;}    to {bottom: 0; opacity: 0;} }  @keyframes fadeout {   from {bottom: 30px; opacity: 1;}   to {bottom: 0; opacity: 0;} } </style>`;
const snackContent = `<div id="tweebSnackbar">...</div>`;
var GsnackElement = null;

function setupSnackbar() {
  const body = document.querySelector("body");
  body.insertAdjacentHTML("beforeend", snackStyle);
  body.insertAdjacentHTML("beforeend", snackContent);
  const snackElement = document.querySelector("#tweebSnackbar");
  if (snackElement) {
    GsnackElement = snackElement;
  }
}

var GsnackhideTimeout = null;

function triggerSnackbar(text) {
  if (GsnackElement) {
    GsnackElement.textContent = text;
    if (GsnackhideTimeout) {
      clearTimeout(GsnackhideTimeout);
      GsnackhideTimeout = null;
    } else {
      GsnackElement.className = "show";
    }
    GsnackhideTimeout = setTimeout(function () {
      GsnackElement.className = GsnackElement.className.replace("show", "");
      GsnackhideTimeout = null;
    }, 3000);
  }
}

/*
  Main functions.
*/

/**
 * Counts the total media present within the archive storage.
 * @param null
 * @returns null
 */
function TweebCountMedia() {
  var totalMedia = 0;
  Object.keys(sessionTweetStore).forEach((tweetKey) => {
    if (sessionTweetStore[tweetKey].media)
      totalMedia += sessionTweetStore[tweetKey].media.length;
  });
  ulog("Media Items:", totalMedia);
}

/**
 * Scrolls the timeline with a reference file provided to stop at.
 * @param null
 * @returns null
 */
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
      if (!sessionTweetStore) {
        console.warn("sessionTweetStore is not defined yet.");
        return;
      }
      if (tweebGlobalAdded === 0) {
        console.log("No new images detected. Stopping.");
        clearInterval(scrollData[0]); // Stop DoomScroller
        clearInterval(imageCheckInterval);
        scrollData[0] = null;
        triggerSnackbar("Scroll Finished.");
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
      startImageCheck(sessionTweetStore);
    };
  };

  input.click();
}

/**
 * Downloads current Session to a json file
 * @param null
 * @returns null
 */
function TweebDownload() {
  var currentURL = new URL(document.URL);
  var currentPage = currentURL.pathname;
  // ulog(currentPage);
  if (currentPage == "/home") {
    currentPage = currentPage.substring(1);
    currentPage = `${currentPage}.json`;
  } else if (
    currentPage.includes("/media") ||
    currentPage.includes("/with_replies")
  ) {
    var fragement = currentPage.split("/");
    currentPage = `${fragement[fragement.length - 1]}.json`;
  } else if (currentPage.includes("/search")) {
    var searchParam = currentURL.searchParams.get("q");
    currentPage = `${searchParam}.json`;
  } else {
    currentPage = currentPage.substring(1);
    currentPage = `${currentPage}.json`;
  }
  saveData(sessionTweetStore, currentPage);
}

function TweebDownloadArchive() {
  triggerSnackbar("Getting all archived tweets. This can take some time...");
  // ulog("Getting all archived tweets. This can take some time...");
  saveData(
    getAllTweebStore(),
    `TweetUserScriptArchive-${Math.floor(Date.now() / 1000)}.json`,
  );
}

function TweebWipeArchive() {
  if (
    confirm(
      "Delete *ALL* your saved tweets?\nThis is not reversible!\n(Includes current session and previously archived!)",
    )
  ) {
    sessionTweetStore = {};
    wipeTweebStore();
    alert("Wiped All stored tweets!");
  }
}

var scrollData = [null, 20, 0, 0, 0];

function alternativeOldTwitterScrollLoop() {
  ulog("Scrolling Timeline...");
  var loadMoreElement = document.querySelector("#load-more");
  if (loadMoreElement) {
    // XXX: Not very localizable.
    if (loadMoreElement.innerHTML.toLowerCase() == "load more") {
      loadMoreElement.click();
    }
  }
  if (tweebGlobalAdded == 0) {
    triggerSnackbar("Scroll Finished. No more new tweets detected.");
    // alert("Scroll Finished. No more new tweets detected.");
    clearInterval(scrollData[0]);
    scrollData[0] = null;
    scrollData[3] = 0;
  }
}

var hasEverSeenModernTwitterProgressBar = false;

const timelineSelector = [
  'div[aria-label~="Timeline:" i] > div > div:nth-last-child(1)',
  'div[aria-label~="タイムライン:" i] > div > div:nth-last-child(1)',
].join(", ");

const timelineSelectorAlt = [
  'div[aria-label~="Timeline:" i] > div > div',
  'div[aria-label~="タイムライン:" i] > div > div',
].join(", ");

function scrollLoop() {
  ulog("Scrolling Timeline...");
  var originalTimeline = document.querySelector(timelineSelector);
  if (originalTimeline !== null) {
    document.querySelectorAll(timelineSelectorAlt).style = "width:0%;";
    // Solve the min-height
    var minHeight = originalTimeline.parentElement.style["min-height"];
    minHeight = parseInt(minHeight.substr(0, minHeight.length - 2));
    unsafeWindow.scrollTo(0, minHeight + 10 * 1000);
  } else {
    originalTimeline = document
      .querySelector("#timeline > div:nth-last-child(1)")
      .scrollIntoViewIfNeeded();
  }
  if (tweebGlobalAdded == 0) {
    triggerSnackbar("Scroll Finished. No more new tweets detected.");
    // alert("Scroll Finished. No more new tweets detected.");
    clearInterval(scrollData[0]);
    scrollData[0] = null;
    scrollData[3] = 0;
  }

  let isLastElementProgess = originalTimeline.querySelector(
    'div:nth-last-child(1) div[role*="progressbar"]',
  )
    ? true
    : false;
  if (isLastElementProgess && !hasEverSeenModernTwitterProgressBar) {
    ulog(
      "Seen modern progress bar for the first time. Using alternative scrolling.",
    );
    hasEverSeenModernTwitterProgressBar = true;
  }
  if (hasEverSeenModernTwitterProgressBar) {
    if (scrollData[1] > scrollData[3]) {
      scrollData[3]++;
    } else if (
      unsafeWindow.scrollY === scrollData[2] &&
      !isLastElementProgess
    ) {
      // There's a split % chance where the progressbar is hidden / no more but it hasn't scrolled yet.
      if (scrollData[1] > scrollData[4]) {
        scrollData[4]++;
      } else {
        ulog(
          "Progress Scroll locked. Giving up...",
          tweebGlobalAdded,
          unsafeWindow.scrollY === scrollData[2],
        );
        triggerSnackbar("Progressive Scroll Finished. Timeline locked up.");
        clearInterval(scrollData[0]);
        scrollData[0] = null;
        scrollData[3] = 0;
        scrollData[4] = 0;
      }
    }
  } else {
    if (unsafeWindow.scrollY === scrollData[2]) {
      if (scrollData[1] > scrollData[3]) {
        scrollData[3]++;
      } else {
        ulog(
          "Scroll locked. Giving up...",
          tweebGlobalAdded,
          unsafeWindow.scrollY === scrollData[2],
        );
        triggerSnackbar("Scroll Finished. Timeline locked up.");
        clearInterval(scrollData[0]);
        scrollData[0] = null;
        scrollData[3] = 0;
      }
    } else {
      scrollData[3] = 0;
    }
  }

  scrollData[2] = unsafeWindow.scrollY;
}

function DoomScroller() {
  if (scrollData[0]) {
    clearInterval(scrollData[0]);
    scrollData[0] = null;
  } else {
    if (document.querySelector("#load-more")) {
      scrollData[0] = setInterval(alternativeOldTwitterScrollLoop, 100);
    } else scrollData[0] = setInterval(scrollLoop, 100);
  }
}

(function () {
  "use strict";
  ulog("Injecting xhooks...");
  hook_regular_twitter();
  hook_old_twitter_ext();
  ulog("xhooks done! Preparing other functions...");

  // [Util] Any Twitter: Count total media
  unsafeWindow.TweebCount = TweebCountMedia;

  unsafeWindow.TweebDownload = TweebDownload;
  unsafeWindow.TweebArchive = TweebDownloadArchive;
  unsafeWindow.TweebWipeArchive = TweebWipeArchive;
  unsafeWindow.TweebArchiveDebug = debugStorage;

  // [Util] New Twitter: Download button
  unsafeWindow.TweebScroll = DoomScroller;
  // window.TweebIds = tweetIds;
  unsafeWindow.TweebScrollWRef = TweebScrollWithReference;
  ulog("Ready.");
})();
