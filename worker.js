const DEFAULT_MESSAGE = "{role} new video is out! {url}";

const decode = (s = "") =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

async function getLatestVideo(channelId) {
  const resp = await fetch(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
  );
  if (!resp.ok) throw new Error(`RSS feed returned ${resp.status}`);

  const entry = (await resp.text()).match(/<entry>([\s\S]*?)<\/entry>/)?.[1];
  const tag = (re) => entry?.match(re)?.[1];
  const id = tag(/<yt:videoId>([^<]+)</);
  if (!id) throw new Error("No videos found in feed");

  return {
    id,
    title: decode(tag(/<title>([\s\S]*?)<\/title>/)),
    url: tag(/<link rel="alternate" href="([^"]+)"/),
    author: decode(tag(/<name>([\s\S]*?)<\/name>/)),
    published: tag(/<published>([^<]+)</),
    thumbnail: tag(/<media:thumbnail url="([^"]+)"/),
    description: decode(tag(/<media:description>([\s\S]*?)<\/media:description>/)),
  };
}

async function postToDiscord(env, video) {
  const role = (env.DISCORD_ROLE_ID || "").trim();
  const values = {
    role: role && `<@&${role}>`,
    url: `<${video.url}>`,
    title: video.title,
    author: video.author,
  };
  const content = (env.DISCORD_MESSAGE || DEFAULT_MESSAGE)
    .replace(/<\{url\}>|\{(role|url|title|author)\}/g, (_, key = "url") => values[key])
    .trim();

  let description = video.description.trim();
  if (description.length > 300) description = description.slice(0, 297) + "...";

  const resp = await fetch(env.DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "YouTube",
      content,
      embeds: [
        {
          title: video.title,
          url: video.url,
          description,
          color: 0xff0000,
          timestamp: video.published,
          author: { name: video.author },
          image: video.thumbnail && { url: video.thumbnail },
        },
      ],
      allowed_mentions: { parse: [], roles: role ? [role] : [] },
    }),
  });
  if (!resp.ok) {
    throw new Error(`Discord returned ${resp.status}: ${await resp.text()}`);
  }
}

async function check(env) {
  for (const name of ["YOUTUBE_CHANNEL", "DISCORD_WEBHOOK_URL", "YT_STATE"]) {
    if (!env[name]) throw new Error(`${name} is not set`);
  }
  const channelId = env.YOUTUBE_CHANNEL.trim();
  if (!/^UC[\w-]{22}$/.test(channelId)) {
    throw new Error("YOUTUBE_CHANNEL must be a channel ID starting with UC");
  }

  const video = await getLatestVideo(channelId);
  const key = `last_video_id:${channelId}`;
  const lastId = await env.YT_STATE.get(key);

  if (lastId === video.id) return { action: "no_change", videoId: video.id };
  if (lastId !== null) await postToDiscord(env, video);
  await env.YT_STATE.put(key, video.id);
  return { action: lastId === null ? "first_run" : "notified", videoId: video.id };
}

export default {
  async scheduled(event, env) {
    await check(env);
  },

  async fetch(request, env) {
    if (new URL(request.url).pathname !== "/run") {
      return new Response("YouTube -> Discord notifier is running. Visit /run to check now.");
    }
    try {
      return Response.json({ ok: true, ...(await check(env)) });
    } catch (err) {
      return Response.json({ ok: false, error: err.message }, { status: 500 });
    }
  },
};