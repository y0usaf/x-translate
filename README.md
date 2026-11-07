# X Translate

A userscript that translates foreign-language posts on X in place, with a row under each one that looks like X's own "Translated from … · Show original".

**[Install](https://raw.githubusercontent.com/y0usaf/x-translate/main/x-translate.user.js)** (open the link with Violentmonkey, Tampermonkey or any userscript manager installed).

It translates into your browser's language. Posts X has already translated, posts already in your language, and posts with no text are left alone. "Show original" swaps back per post.

Translations come from Google Translate's free web endpoint (`translate.googleapis.com`, no key), which is unofficial and may rate-limit. The only permission it needs is `GM_xmlhttpRequest` to that host.
