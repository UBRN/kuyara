---
title: kuyara support
lang: en
ref: support
---

# kuyara support

kuyara is a free, ad-free weather and outfit recommendation app. It is developed publicly
and its source is available at [github.com/UBRN/kuyara](https://github.com/UBRN/kuyara).

## Contact

- **Bugs and feature requests:** open an issue at
  [github.com/UBRN/kuyara/issues](https://github.com/UBRN/kuyara/issues). Please do not
  put personal data in an issue.
- **Privacy questions and deletion requests:** email the maintainer at
  [quint.inboard_9t@icloud.com](mailto:quint.inboard_9t@icloud.com). The
  [privacy policy](privacy-policy) says what to include.

## Frequently asked questions

**Why did my outfits change?**
Each day, the morning and evening questions let you choose formality and up to three style
preferences. Recommendations refresh for each new day's answer, when your location or saved
clothing preferences change, when forecast coverage ends and you next open Today, or when you
confirm "Ask the stylist again." A weather refresh updates the insight, not the outfit. If AI
is unavailable, the built-in fallback still picks three outfits.

**Why does kuyara ask for my location?**
Only if you choose "Use my location". Location is used solely to fetch the weather for
where you are; you can type a city instead and never grant the permission. kuyara sends
your location rounded to about one kilometre to its own weather server, never stores exact
coordinates, and never includes location in analytics. Approximate location is enough.

**How do I delete my data?**
Deleting the app removes its local data from that device. Copies may remain in your device
backup under your backup settings. Usage analytics and performance or crash diagnostics
follow the choice you make in the app, apart from rare technical records explained in the
[privacy policy](privacy-policy#performance-and-diagnostics). Expo also receives a
launch count and update check with an installation identifier on every launch, regardless of
consent; see [Expo launch requests in the privacy policy](privacy-policy#expo-launch-requests).
To request deletion of past analytics events, copy the identifier shown under Settings >
Privacy while sharing is on and email it to the maintainer. Turning sharing off stops
analytics and diagnostics and discards that identifier; past events remain until deleted
or expired. Diagnostics and Expo requests use a separate identifier kuyara cannot use for
deletion requests.
