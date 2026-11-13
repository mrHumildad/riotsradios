# Funding RIOTSRADIOS — ethical revenue strategies

Time is the only scarce resource in this project. This file ranks the ways to pay
for it without breaking the thing that makes the app worth funding: it asks
nothing of the listener.

Every option here passes one test — **the app must not start asking anything of
the people who use it**. No ads, no accounts, no analytics, no paid placement in
the catalog, no feature unlocked by money. Anything that fails that test costs
more in trust than it can earn.

## The constraint that decides everything

- Running costs are roughly **€0**: GitHub Pages hosting, no server, no database,
  the one-off Play registration fee already paid.
- The revenue does not need to cover infrastructure. It has to cover **your
  hours**, which means the honest ask is *"support the maintainer"*, never
  *"keep the servers running"*. Donors and grant reviewers can tell the
  difference, and the second one is a lie in this repo.
- The Play listing already declares: **Free**, **no ads**, **no in-app
  purchases**, **no advertising ID**, **no data collected, no data shared**. Those
  answers are true today and are a large part of why the app is trusted. Every
  strategy below has to leave them true.
- The licence — **MIUC (Me Invitarás Una Cerveza)** — already asks for a beer.
  Donation-based funding is not a pivot here; it is what the project said it
  wanted from the start.

## At a glance

| Track | Time to first euro | Realistic yield | Effort | Fit |
|---|---|---|---|---|
| Grants (NLnet, FUTO, Mozilla) | 2–8 months | €1k–125k per award | High, one-off writing | Excellent |
| Donations (Liberapay, Sponsors) | Days | Tens of €/month, not a salary | Low | Perfect |
| Sector money (networks, culture funds, paid EPG work) | 1–3 months | Hundreds to low thousands | Medium | Good |
| Selling hours (station apps, contract work) | 1–4 weeks | Market rate for the days you sell | Medium, recurring | Good, but spends the same hours |
| Sponsor line, merch | Weeks | Pocket money | Low | Optional |

Do them in that order of leverage, not in that order of comfort. Donations are
the easiest to start and the least likely to fund a month; grants are the
opposite.

---

## Track A — Grants

The application writes itself out of what already exists. Reviewers fund evidence
of execution, and this repository is full of it: a working app on Play, a
validated catalog, a documented EPG format, a daily health probe in CI, a release
pipeline with real discipline. Very few solo applicants can show that.

### Programmes, checked 13 November 2026

| Programme | Amount | Deadline | Fit and notes |
|---|---|---|---|
| **NLnet / NGI Zero** | typically €5k–50k for a solo work package; up to €150k on Commons calls | Next deadline **3 Jan 2027** | Best structural fit: open internet commons, privacy, R&D. The Commons Fund's final call closed 1 June 2026; **Restack** and **CodeSupply** are the successor funds — confirm which is open before writing. Proposals are short, in English, and must have R&D as the primary objective, so "maintain an app" is not enough. |
| **FUTO** | microgrants **$1,000–$5,000**; Fellows package up to **$40,000** plus three months in Austin | Rolling, applications open | Nearly a description of this app: user control over technology, "the users are not the product", open source, no surveillance. Microgrants are frequently unsolicited — send the repo and a one-pager, not a deck. The Fellows residency means relocating to Austin; skip it unless that is possible. |
| **Mozilla Foundation Fellowship 2027** | **$125,000** Independent ($100k stipend + $25k project budget); $100,000 Embedded | Letter of Intent **17 Dec 2026**, 23:59 Pacific | 10 fellowships, individuals only, global, 12 months from 1 June 2027. Themes reward work that is "too early, too unexpected or too ambitious" — a shipped, working app is none of those, so read the RFP before spending the week. The LoI itself is short. |
| **Sovereign Tech Fund** | €50,000 minimum | Rolling | **Not a fit.** It funds open digital base technologies and explicitly excludes user-facing applications. The only route would be reframing the catalog/EPG format as infrastructure other apps depend on — do not spend a day on it otherwise. |

### What to propose

Three work packages, all half-built already. Fund the half that is missing.

**W1 — Catalog and EPG as a documented, validated open format.**
Deliverables: a published spec with conformance tests, the validator promoted from
a build gate to a reusable tool, a versioned publish contract, and a reference
consumer that proves a third party can use it. Evidence today:
`docs/EPG-FORMAT.md`, `docs/EPG-REPO-CATALOG.md`, `scripts/validate-stations.js`,
`scripts/validate-epgs.js`, the separate `riotsradios-epg` repository.

**W2 — Stream-health verification as public data.**
Deliverables: a probe that classification, retries and CORS detection are
specified and tested against, a stable published schema, and an honest badge
model. Evidence today: `lib/health.js`, `data/health.json`, the daily
`catalog-sync` workflow, `lib/stations.js` cleartext rules.

**W3 — Inclusive playback.**
Deliverables: accessibility pass (screen reader, focus order, large text),
Android TV/D-pad hardening, offline-first cold start, and keeping the app's
promise that the only network request is the stream. Evidence today: the TV
layout, self-hosted woff2 fonts, `docs/CORS-IN-APP.md`, `docs/SPECTRUM-ANDROID.md`,
the full Play release procedure in `docs/PLAY-STORE-LAUNCH.md`.

Numbers worth putting in the application (re-check before sending):

- 85 catalog rows, **43 playable** after `stream_broken` hiding; stations across
  Spain, Italy, France, the UK and Argentina, in several languages.
- One human maintainer and a bot: **bus factor 1** on a catalog other clients can
  consume. That is the sustainability argument, stated plainly.
- A daily automated health probe and a CI gate that refuses to ship a malformed
  row — reliability that is measured, not claimed.
- Zero telemetry, zero accounts, self-hosted fonts: privacy as an architectural
  property, not a policy paragraph.

### How to run it

1. Pick **one** programme and **one** work package. A focused €15k proposal beats
   a vague €60k one.
2. Write the budget from hours × a stated day rate, plus the fiscal-host fee if
   you use one. Reviewers expect a number they can check against deliverables.
3. Attach the roadmap as milestones with dates, and name what you will publish
   under a free licence as a result.
4. Apply to FUTO in parallel — it is small, fast, and does not conflict with an
   NLnet application as long as the activities described are distinct.
5. Keep the rejection. Reviewers' notes are the cheapest proposal feedback
   available, and the next call is a few months away.

---

## Track B — Donations

The right shape here is a **maintainer fund**, not a product tier. Nothing is
unlocked; nothing is exclusive; nobody's name buys a station into the catalog.

### Rails, checked 13 November 2026

| Rail | Cut | Notes |
|---|---|---|
| **Liberapay** | 0% platform; ~3% Stripe or ~5% PayPal processing | French nonprofit since 2015, open source. Recurring only, so one-off tips are awkward. Donors are anonymous by default, each donor is capped at $100/week to dampen influence, and **rewarding patrons is forbidden** — the platform's rules are the funding policy you wanted anyway. Needs a Stripe or PayPal account. |
| **GitHub Sponsors** | 0% on personal-account sponsorships; up to 6% on organisation sponsorships | Zero friction, but the audience is developers. This app's audience is listeners, so this is the rail for people who read the repo, not the one for people who listen. |
| **One-off tip link** (Ko-fi, Buy Me a Coffee, or a plain Stripe payment link) | 0–5% depending on the service | For listeners who will not create an account anywhere. Pick the one that lets you take a payment without embedding a script in the site. |

Expected yield: **tens of euros a month, not a salary.** Say that out loud before
starting, so a quiet month reads as normal rather than as failure. Donations are
worth having for two other reasons: they prove demand to grant reviewers, and
they turn a passive audience into a small constituency that will defend the app.

### Play-safe implementation — the part most people get wrong

Google's Payments policy requires Play billing for in-app features, content and
digital goods, but lists **tax-exempt donations** and peer-to-peer payments among
the cases where Play billing must *not* be used. So a donation link is not an
in-app purchase — as long as nothing is unlocked by it.

| Do | Do not |
|---|---|
| A plain `https://` link that opens in the **system browser** | An in-app webview, SDK or embedded widget |
| Copy that says "support the maintainer" | Anything that implies a feature, station or guide is for sale |
| A `SUPPORT` line in About/footer and the website | Tracking parameters, referral IDs, or an analytics redirect |
| Keep the Console at **In-app purchases: No** | Add a perk tier — that becomes an in-app purchase and changes the data-safety and IAP declarations |

The privacy page and the Play data-safety form say the app collects nothing and
makes no request except the stream. A donation widget is a request to a third
party and would make both statements false. A link opened by the system browser
does not.

**Tax:** recurring income and grants are taxable where you live, and regular
donation income can be treated as economic activity. This file is not legal or
tax advice — check locally, and consider a fiscal host before the amounts get
interesting (see Track C).

### Ready to paste

`FUNDING.md` at the repository root:

```markdown
# Supporting RIOTSRADIOS

RIOTSRADIOS is free, has no ads, no accounts and no trackers, and never will.
The stations are streamed straight from the broadcasters.

If you want more of it, you can pay for the maintainer's hours:

- Liberapay (recurring): <link>
- One-off: <link>

The money pays for time, not for features. Donors get no influence over which
stations are listed, no placement and nothing exclusive — the app is the same
for everyone. Funding rules in full: docs/FUNDING.md
```

App copy, for the footer or About row — keep it one line so it never competes
with the tuner:

```
SUPPORT · keeps the tuner free
```

---

## Track C — Sector money

Community radio has institutions, and they have budgets for infrastructure even
when they have none for apps. This is the most underused track for a project like
this one.

**Who to approach:** community-radio federations and networks, regional culture
and media-literacy programmes, public-media innovation funds, foundations that
fund independent media, and universities with radio stations. Where you are
matters more than the size of the funder — local and regional culture grants are
less competitive than international tech grants and often explicitly want
"community radio" as culture.

**What to sell them:** not "an app". Shared infrastructure for N stations —
a validated catalog, published schedules, and measured stream health. That is a
sentence a programme officer can defend internally.

**The paid version of the same work:** schedule authoring and validation for
stations that publish no EPG. You already have the format, the validator and the
publishing contract; they have a programmer with a paper grid and no time. Charge
per guide, keep the result in the public catalog, and the app improves as you get
paid. This is the cleanest overlap between income and project progress in the
whole list.

**Fiscal host:** if you need to invoice an institution, a host gives you a legal
entity, receipts and published accounts without incorporating.

| Host | Fee | Notes |
|---|---|---|
| Open Collective Europe | 6% | EU-based collectives |
| Open Source Collective | 10% | Open-source projects worldwide |
| All For Climate | 3% | Climate and social-justice projects in Europe |

Host fees are typically 4–10% and are charged before payment-processor fees;
Open Collective does not charge hosted collectives a platform fee. The host is
also the honest answer to "where does the money go" — publish a ledger and the
donation ask gets easier everywhere else.

---

## Track D — Sell hours, not users

The fastest real money, and the only track that can pay a month's rent in a
month. It also competes for exactly the hours you are trying to buy, so cap it.

**What this repository proves you can do:** Capacitor 8 Android packaging,
Android TV/leanback with D-pad focus, Media3 background playback and media
notifications, stream-health probing and CORS handling, CSV/EPG pipeline design,
and a release process (signed AAB, `versionCode` discipline, two-phase Play
upload, generated store assets) that most independent developers get wrong.

**Productised offers, in order of how easily they sell:**

1. **Station player, branded** — one station or network, same codebase, their
   icon, their colors, their catalog. The asset generators, release script and
   Play checklist already exist; the marginal work is configuration.
2. **Guide pipeline** — build and maintain EPG data for a network, publishing to
   the same open format.
3. **Contract work** — Android TV, media playback, Capacitor builds. Highest
   rate, least leverage, easiest to find.
4. **Workshops** — "ship a community radio app" for a media collective or a
   cultural programme. Fits the sector funders in Track C.

Price per project, not per hour, and derive the number from what a month of your
time costs rather than from a market guess. Publish nothing about client work in
this repo; the app stays free and non-commercial either way.

---

## Track E — Optional, small

- **One sponsor line.** "This release is supported by <organisation>" in the
  README and the About page, no tracking, no influence on the catalog, no logo in
  the tuner. Only from organisations you would be happy to list. Small money,
  zero cost to listeners, and it needs a written rule so it cannot drift into
  advertising.
- **Merch.** A small print-on-demand run of the amber-CRT artwork. Fits the
  post-punk identity, no inventory, pocket money at best.
- **F-Droid / IzzyOnDroid.** Not revenue, but the audience that cares most about
  no-trackers apps is the audience that actually donates. Cheap to do once.

---

## What not to do, and why

| Idea | Why it fails here |
|---|---|
| Ads or an ad SDK | Breaks the promise and sits badly beside the non-commercial stations the app indexes. Forces a rewrite of the ads, IAP and data-safety declarations, and the Play listing's "free, no ads" is the differentiator. |
| Selling listening data | There is none, by design. Adding telemetry destroys the only moat and cannot be undone reputationally. |
| Paid station placement or ranking | Corrupts the catalog, which is the shared asset everything else rests on. |
| Affiliate links (VPNs, hosts) | Off-brand, reads as a sell, earns almost nothing at this scale. |
| Paywalled stations or a "premium" guide | Turns listeners into customers and contradicts MIUC. Also: a free app on Play cannot become paid, and features sold outside Play billing violate the Payments policy. |
| Tokens, NFTs, "community coin" | Attracts exactly the wrong constituency and adds regulatory work you do not need. |
| Bidding for grants with a huge scope | Reviewers fund evidence of execution. One work package, delivered, beats a grand plan every time. |

---

## Next 30 days

Dates assume a start of 13 November 2026.

| When | What | Why |
|---|---|---|
| This week | Liberapay + GitHub Sponsors live; one-off link; `FUNDING.md` at the root; `SUPPORT` line in the app opening the system browser | Days of work, and it makes the project legible as fundable |
| This week | Check the Mozilla RFP themes against this project | The LoI is short, but the themes are specific — decide before writing |
| By 22 Nov | One-page NLnet work package: W1, W2 or W3, milestones, budget | Next deadline 3 Jan 2027; writing over a weekend beats writing in a panic |
| By 17 Dec | Mozilla Letter of Intent submitted (if the themes fit) | Hard deadline, 23:59 Pacific, no extensions |
| By 3 Jan | NLnet proposal submitted | Hard deadline |
| Rolling | FUTO microgrant: repo + one-pager | Small, fast, and the mission is a near match |
| This month | F-Droid/IzzyOnDroid listing; approach three stations or one network about paid guide work | Grows the donating audience and starts Track C |
| Every quarter | Re-check every deadline and fee in this file | Programmes close, fees move, and stale numbers are worse than none |

---

## Rules of the house

Write these down before the first euro arrives, because the moment to decide is
before anyone has an interest in the answer.

1. No ads, no trackers, no accounts, no telemetry — now or later.
2. Donors and sponsors get no influence over which stations are listed, how they
   are ordered, or what the app does.
3. Money buys time, not features. Nothing is unlocked.
4. The catalog stays merit-based: a station is listed because it exists, is
   playable, and belongs in a free community tuner.
5. Income and expenses are published, at least annually.
6. If a funder ever wants something that breaks 1–5, the answer is no, and the
   project stays smaller.

## Sources

Checked 13 November 2026. Fees and deadlines change; re-read the programme pages
before relying on any of this.

- Google Play Payments policy, including the tax-exempt donations exception:
  https://support.google.com/googleplay/android-developer/answer/9858738
- NLnet / NGI Zero funding and open calls: https://nlnet.nl/
- FUTO grants and microgrants: https://futo.org/grants
- Mozilla Foundation 2027 Fellowship call: https://www.mozillafoundation.org/en/what-we-do/grantmaking/fellowship/2027-call-for-applications
- Liberapay about and FAQ: https://en.liberapay.com/about
- GitHub Sponsors fees: https://docs.github.com/en/sponsors/getting-started-with-github-sponsors/about-github-sponsors
- Open Collective pricing and fiscal hosts:
  https://documentation.opencollective.com/why-open-collective/pricing
- Sovereign Tech Fund scope and minimum:
  https://www.sovereign.tech/programs/fund
