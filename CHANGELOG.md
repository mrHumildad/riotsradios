# riotsradios

## 1.5.0

### Minor Changes

- Prompt listeners when a newer published release is detected, with a reload on the web and the Play Store listing on Android.
- Switch stations with the next/previous buttons on wired or Bluetooth headphones in the Android app, even while it keeps playing in the background.
- The EPG button in the station list now rotates through three views: the station rows, the two-hour guide lanes, and a merged feed of the newest posts from every station. Feed rows carry the station's icon, name, city and date.
- Open a station's news log from its info modal: a NEWS button swaps the programme guide for the posts published on the station's feed.

## 1.4.0

### Minor Changes

- The channel list gains an EPG lane: the EPG toggle turns every station with a guide into a two-hour programme window centred on the station's own clock, with the current time marked in the middle, while stations without a guide keep their normal row at the bottom. A LANG toggle cycles through the languages the catalog carries, reading the new optional `language` column so Catalan and Basque stations are no longer counted as Spanish. Eleven new stations and refreshed guides come with it.

## 1.3.0

### Minor Changes

- Station rows keep four fixed lines: long names, programme titles, the stream's own now-playing title and catalogue meta scroll like a broadcast caption instead of wrapping or being cut off. The row headline cycles name → on-air programme → now playing, so the track no longer needs a line of its own.

## 1.2.0

### Minor Changes

- 71803b0: added many radios

## 1.1.0

### Minor Changes

- a06141b: migrated to csv for stations

## 1.0.0

Initial production release - Free Community Radio Player with EPG support, keyboard controls, and responsive mobile-first design.
