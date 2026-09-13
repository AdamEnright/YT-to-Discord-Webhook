# YouTube → Discord Notifier

Dead simple Cloudflare Worker that posts to a Discord channel when a YouTube channel
uploads a new video. It checks the channel's RSS feed every minute, needs no
YouTube API key, and runs on Cloudflare's free plan.

## Setup

1. **Create a Discord webhook:** Server Settings → Integrations → Webhooks →
   New Webhook → Copy Webhook URL.
2. **Get the YouTube channel ID:** on the channel page, click **more** under
   the description → Share channel → Copy channel ID. It starts with `UC`.
3. **Create the Worker:** in the [Cloudflare dashboard](https://dash.cloudflare.com),
   go to Workers & Pages → Create → Create Worker, and deploy it. Click
   **Edit code**, replace everything with [`worker.js`](worker.js), and deploy.
4. **Add storage:** create a KV namespace (Storage & Databases → Workers KV),
   then under the Worker's Settings → Bindings, add it with the variable
   name `YT_STATE`.
5. **Add variables** under Settings → Variables:

   | Name | Value |
   |---|---|
   | `YOUTUBE_CHANNEL` | Channel ID from step 2 |
   | `DISCORD_WEBHOOK_URL` | Webhook URL from step 1 (click **Encrypt**) |
   | `DISCORD_ROLE_ID` | *Optional.* Role to ping on each video |
   | `DISCORD_MESSAGE` | *Optional.* Custom message (see below) |

6. **Schedule it:** under Settings → Triggers, add a Cron Trigger of
   `* * * * *` (every minute).

## Testing

Visit `https://<your-worker>.<your-subdomain>.workers.dev/run`.

- `first_run`: working. The current latest video is saved and not posted.
- `no_change`: working, and there's no new video.
- `notified`: a new video was posted to Discord.
- `"ok": false`: the `error` field says what's wrong.

To force a test post, edit the saved value in your KV namespace to anything
else, then visit `/run` again.

## Custom message

`DISCORD_MESSAGE` supports these placeholders:

| Placeholder | Replaced with |
|---|---|
| `{role}` | Ping for `DISCORD_ROLE_ID` (empty if not set) |
| `{url}` | Video link |
| `{title}` | Video title |
| `{author}` | Channel name |

Default: `{role} new video is out! {url}`

A video card with the title, thumbnail and description is always attached
below the message. Only the configured role can be pinged.