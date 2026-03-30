import { fetchTranscript } from 'youtube-transcript-plus';
import Exercise from '../models/Exercise.js';
import Challenge from '../models/Challenge.js';

// Extract videoId from a YouTube URL or plain ID
export function extractVideoId(input) {
  if (!input) return null;
  const str = input.trim();

  // Plain video ID (11 chars, no slashes)
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;

  try {
    const url = new URL(str);
    // youtube.com/watch?v=ID
    if (url.searchParams.has('v')) return url.searchParams.get('v');
    // youtu.be/ID
    if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('/')[0];
    // youtube.com/embed/ID or /shorts/ID
    const pathMatch = url.pathname.match(/\/(embed|shorts|v)\/([a-zA-Z0-9_-]{11})/);
    if (pathMatch) return pathMatch[2];
  } catch {
    // Not a valid URL
  }
  return null;
}

// Fetch YouTube video metadata via oEmbed (no API key needed)
async function fetchVideoMeta(videoId) {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(url);
    if (!res.ok) return {};
    const data = await res.json();
    return {
      title: data.title || '',
      channelName: data.author_name || '',
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch {
    return {
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    };
  }
}

// Clean transcript text (mirrors user's cleanText function)
function cleanText(text) {
  return text
    .replace(/\n/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// Process transcript in the background after exercise is created
export async function processTranscript(exerciseId) {
  let exercise;
  try {
    exercise = await Exercise.findById(exerciseId);
    if (!exercise) return;

    // Mark as processing
    exercise.transcriptStatus = 'processing';
    await exercise.save();

    const videoId = exercise.youtubeVideoId;

    // Fetch metadata and transcript in parallel
    const [meta, transcript] = await Promise.all([
      fetchVideoMeta(videoId),
      fetchTranscript(videoId),
    ]);

    // Update exercise metadata
    if (meta.title) exercise.title = exercise.title || meta.title;
    if (meta.channelName) exercise.channelName = meta.channelName;
    if (meta.thumbnailUrl) exercise.thumbnailUrl = meta.thumbnailUrl;

    // Build challenges from transcript items
    // Each caption item becomes one challenge
    const challenges = transcript.map((item, index) => ({
      exerciseId: exercise._id,
      index,
      content: cleanText(item.text),
      timeStart: Number(item.offset.toFixed(2)),
      timeEnd: Number((item.offset + item.duration).toFixed(2)),
    })).filter(ch => ch.content.length > 0);

    if (challenges.length === 0) {
      throw new Error('No transcript items found — video may have no captions');
    }

    // Set duration from last challenge end time
    exercise.durationSeconds = Math.ceil(challenges[challenges.length - 1].timeEnd);

    // Delete any old challenges and insert new ones
    await Challenge.deleteMany({ exerciseId: exercise._id });
    await Challenge.insertMany(challenges);

    exercise.transcriptStatus = 'ready';
    await exercise.save();

    console.log(`✓ Transcript ready for exercise ${exerciseId} (${challenges.length} challenges)`);
  } catch (err) {
    console.error(`✗ Transcript failed for exercise ${exerciseId}:`, err.message);
    if (exercise) {
      exercise.transcriptStatus = 'failed';
      exercise.transcriptError = err.message;
      await exercise.save();
    }
  }
}
