/**
 * fetch-youtube.js — YouTube Data API v3 fetcher
 *
 * CREDENTIALS NEEDED:
 * YOUTUBE_API_KEY    — Google Cloud Console → APIs & Services → Credentials → API Key
 *                      Enable: YouTube Data API v3
 *                      Restrict to: YouTube Data API v3 (optional but recommended)
 * YOUTUBE_CHANNEL_ID — YouTube Studio → Settings → Channel → Basic Info → Channel ID
 *                      OR: YouTube channel page URL → /channel/UCxxxxxxxx
 *
 * ZAPIER ALTERNATIVE: No — YouTube Data API is straightforward with an API key, no OAuth needed
 *                     for public channel data (subscribers, views, etc.)
 *
 * API DOCS: https://developers.google.com/youtube/v3/docs
 */

const { getStore } = require('@netlify/blobs');

const API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
const YT_BASE = 'https://www.googleapis.com/youtube/v3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

async function ytFetch(endpoint, params = {}) {
  const url = new URL(`${YT_BASE}/${endpoint}`);
  url.searchParams.set('key', API_KEY);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`YouTube API error ${res.status}: ${err}`);
  }
  return res.json();
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  try {
    if (!API_KEY) throw new Error('YOUTUBE_API_KEY not set');
    if (!CHANNEL_ID) throw new Error('YOUTUBE_CHANNEL_ID not set');

    // --- Channel statistics ---
    const channelData = await ytFetch('channels', {
      part: 'statistics,snippet,brandingSettings',
      id: CHANNEL_ID,
    });

    const channel = channelData.items?.[0];
    if (!channel) throw new Error(`Channel ${CHANNEL_ID} not found`);

    const stats = channel.statistics || {};

    // --- Recent videos (last 20) ---
    // First get uploads playlist ID
    const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
    let recentVideos = [];

    if (uploadsPlaylistId) {
      const playlistData = await ytFetch('playlistItems', {
        part: 'snippet,contentDetails',
        playlistId: uploadsPlaylistId,
        maxResults: 20,
        order: 'date',
      });

      const videoIds = (playlistData.items || [])
        .map((item) => item.contentDetails?.videoId)
        .filter(Boolean)
        .join(',');

      if (videoIds) {
        const videoStats = await ytFetch('videos', {
          part: 'statistics,snippet,contentDetails',
          id: videoIds,
        });

        recentVideos = (videoStats.items || []).map((v) => ({
          id: v.id,
          title: v.snippet?.title,
          publishedAt: v.snippet?.publishedAt,
          thumbnail: v.snippet?.thumbnails?.medium?.url,
          duration: v.contentDetails?.duration,
          views: parseInt(v.statistics?.viewCount || 0),
          likes: parseInt(v.statistics?.likeCount || 0),
          comments: parseInt(v.statistics?.commentCount || 0),
          // Engagement rate = (likes + comments) / views * 100
          engagementRate: v.statistics?.viewCount > 0
            ? (((parseInt(v.statistics?.likeCount || 0) + parseInt(v.statistics?.commentCount || 0)) / parseInt(v.statistics.viewCount)) * 100).toFixed(2)
            : '0.00',
        }));
      }
    }

    // Sort by views descending to find top video
    const topVideo = [...recentVideos].sort((a, b) => b.views - a.views)[0] || null;

    // Calculate 7-day views (videos published in last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentVideoViews = recentVideos
      .filter((v) => new Date(v.publishedAt) >= sevenDaysAgo)
      .reduce((sum, v) => sum + v.views, 0);

    // Avg engagement rate across recent videos
    const avgEngagementRate = recentVideos.length > 0
      ? (recentVideos.reduce((sum, v) => sum + parseFloat(v.engagementRate), 0) / recentVideos.length).toFixed(2)
      : '0.00';

    const result = {
      dataSource: 'live',
      fetchedAt: new Date().toISOString(),
      channel: {
        id: CHANNEL_ID,
        title: channel.snippet?.title,
        description: channel.snippet?.description,
        customUrl: channel.snippet?.customUrl,
        thumbnail: channel.snippet?.thumbnails?.medium?.url,
        country: channel.snippet?.country,
        publishedAt: channel.snippet?.publishedAt,
      },
      statistics: {
        subscriberCount: parseInt(stats.subscriberCount || 0),
        viewCount: parseInt(stats.viewCount || 0),
        videoCount: parseInt(stats.videoCount || 0),
        hiddenSubscriberCount: stats.hiddenSubscriberCount || false,
      },
      metrics: {
        avgEngagementRate,
        recentVideoViews7d: recentVideoViews,
        videosPublishedLast7d: recentVideos.filter((v) => new Date(v.publishedAt) >= sevenDaysAgo).length,
        totalLikes30d: recentVideos.reduce((sum, v) => sum + v.likes, 0),
        totalComments30d: recentVideos.reduce((sum, v) => sum + v.comments, 0),
      },
      topVideo,
      recentVideos,
    };

    try {
      const store = getStore('marketing-cache');
      await store.setJSON('youtube', result);
    } catch (blobErr) {
      console.warn('Blob cache write failed:', blobErr.message);
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(result) };
  } catch (err) {
    console.error('fetch-youtube error:', err.message);

    try {
      const store = getStore('marketing-cache');
      const cached = await store.get('youtube', { type: 'json' });
      if (cached) {
        cached.dataSource = 'cached';
        cached.cacheWarning = `Live fetch failed: ${err.message}`;
        return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(cached) };
      }
    } catch (blobErr) {
      console.warn('Blob cache read failed:', blobErr.message);
    }

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message, dataSource: 'error' }),
    };
  }
};
