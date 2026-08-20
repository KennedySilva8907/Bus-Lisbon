# Setting up push notifications

Alerts need three things: a VAPID key pair, an Upstash database, and the job
that checks alerts running on a schedule. Without them the app still works, but
tapping a bell shows an error instead of scheduling anything.

## 1. VAPID keys

VAPID is what proves to the push service that the notification came from your
server and not from someone else.

```bash
npx web-push generate-vapid-keys
```

Keep both keys. The public one is not a secret — the browser has to see it. The
private one is.

## 2. Upstash

The alerts live in a key-value store, and so does the line ranking the nightly
job publishes. Create a free Upstash Redis database and keep its REST URL and
REST token. The free plan is 10k commands a day, which is far more than this
uses.

Pick a region close to the API. The API runs in Spain Central.

## 3. Configuration

The backend reads these. In development use user secrets, never a file in the
repository:

```bash
cd backend/src/BusLisbon.Api
dotnet user-secrets set "Vapid:PublicKey"    "<public key>"
dotnet user-secrets set "Vapid:PrivateKey"   "<private key>"
dotnet user-secrets set "Vapid:Subject"      "mailto:you@example.com"
dotnet user-secrets set "Upstash:RestUrl"    "<rest url>"
dotnet user-secrets set "Upstash:RestToken"  "<rest token>"
```

The alert job needs the same five. The collection job needs the Upstash pair
and a connection string, `ConnectionStrings__Observations`, pointing at the SQL
database.

In production these are environment variables on the container app and on both
container app jobs. The database connection uses a managed identity, so the
connection string carries `Authentication=Active Directory Default` and no
password.

The frontend needs the public key only, as `VITE_VAPID_PUBLIC_KEY` in the
Vercel project. The `VITE_` prefix is what makes Vite expose it to browser
code. It is the same value as `Vapid:PublicKey`, duplicated on purpose.

## 4. The schedule

The check runs as an Azure Container Apps Job on a cron trigger, once a minute:
`cj-buslisbon-alerts`. It wakes, loads the pending alerts, asks Carris where
those buses are, sends whatever is due, writes back and exits.

Changing how often it runs means changing two things together — the cron
expression on the job and `Alerts:CheckInterval` — or the job will either miss
alerts or send them twice.

There is a second job, `cj-buslisbon-collection`, which runs nightly and has
nothing to do with alerts.

## 5. Checking it works

Open a stop, tap the bell on a future arrival. If the modal opens, the public
key reached the browser.

For the rest, `GET /api/alerts/pending` lists what is scheduled. It is behind a
secret, `Diagnostics:Secret`, so it is not something anyone can read.

## Known limits

**iOS only delivers push to installed apps.** The notification never arrives
unless the app was added to the home screen first. The UI says so rather than
failing quietly.

**The job runs once a minute,** so it catches the bus somewhere inside a sixty
second window. The notification repeats the threshold you chose, so the number
you read matches the number you picked.

**A minute is not free.** At that cadence the job runs past the free grant for
container app jobs, because each run spends about twenty-seven seconds starting
a container to do a hundred and thirty-five milliseconds of work. Running it
every five minutes stays inside the grant and makes alerts noticeably worse.
That is the trade, and it is a deliberate choice rather than an oversight.

## What it costs

| Thing | Cost |
|---|---|
| Upstash Redis | free plan, 10k commands a day |
| Container Apps Jobs | free grant, exceeded at one minute — see above |
| Web push (FCM, APNS) | free, no practical limit |
