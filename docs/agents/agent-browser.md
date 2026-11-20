# Giving the agent a browser

This is how you drive a page in the app, and ask it questions.

It uses [agent-browser](https://github.com/vercel-labs/agent-browser), a CLI
built for exactly this — one command per action, an answer on stdout.

## Once, per machine

```bash
npm install -g agent-browser
agent-browser install
```

## Asking your own question

Start the app with `npm run dev` first. The examples below use
`http://localhost:5173`, the dev server's default address — if `npm run dev`
printed a different one, use that.

A screenshot is pixels. To verify a fix you need a yes or a no, so read the
DOM:

```bash
agent-browser open http://localhost:5173/courses
agent-browser find placeholder "Search courses..." fill "typescript"
agent-browser find role button click --name "Search"

# Did the search reach the URL?
agent-browser get url

# How many course cards came back?
agent-browser get count 'a[href^="/courses/"]'

# What does the empty state say, if there is one?
agent-browser get text main

# Did anything break?
agent-browser errors
agent-browser console
```

## Signing in as a seeded user

`npm run db:seed` gives these ids on a fresh database:

| id  | User           | Role       | Use it for                                                                    |
| --- | -------------- | ---------- | ----------------------------------------------------------------------------- |
| 1   | Alex Rivera    | admin      | `/admin/*`                                                                    |
| 2   | Sarah Chen     | instructor | Owns `introduction-to-typescript`                                             |
| 3   | Marcus Johnson | instructor | Owns `building-rest-apis-with-nodejs`                                         |
| 5   | Emma Wilson    | student    | Enrolled in `introduction-to-typescript` and `building-rest-apis-with-nodejs` |
| 6   | James Park     | student    | Enrolled in `introduction-to-typescript` only: a locked lesson elsewhere      |

Lessons worth knowing: `building-rest-apis-with-nodejs` starts at lesson 20,
and lesson 22 has a quiz. `introduction-to-typescript` starts at lesson 1, and
lessons 3 and 8 have quizzes.

Switch user by posting to the route the DevUI panel uses, then reload:

```bash
agent-browser open http://localhost:5173/courses
agent-browser eval "fetch('/api/switch-user', {method: 'POST', body: new URLSearchParams({userId: '5'})}).then(r => r.status)"
agent-browser open http://localhost:5173/courses/building-rest-apis-with-nodejs/lessons/20
```

## Commands

The commands worth knowing: `open`, `click`, `fill`,
`find <role|text|label|placeholder> …`, `wait`, `get text|html|attr|count|url`,
`is visible|enabled|checked`, `eval`, `snapshot` (the accessibility tree, with
refs), `screenshot`, `console`, `errors`, `close`. `agent-browser --help` has
the rest.

**Ask the page, do not ask the person.** A change you have not looked at is a
change you are reporting on trust.

Screenshots are PR evidence: a before and an after for a change that shows in
the UI.

## Two things that will bite you

**Hydration lags "networkidle".** The button is in the server HTML before
React attaches its `onClick`, so the first click can be a silent no-op. Poll
for the click's effect and click again, rather than waiting a fixed time.

**Vite re-optimizes on the first load.** On a fresh checkout, the first page
load discovers dependencies Vite has not pre-bundled, and pushes a full-page
reload a moment after the response has finished. Absorb it once against a
throwaway load before the real loop; otherwise it lands mid-interaction and
every click after it hits a page that is already navigating away.
