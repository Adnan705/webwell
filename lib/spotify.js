// Spotify helpers shared by the new tab and the offscreen player. No DOM.
// WebWell plays Spotify through its official embedded player (open.spotify.com/embed),
// so there is no API key and no login handled by WebWell: Spotify itself decides
// whether you hear full songs (signed in) or 30-second previews (signed out).
'use strict';

const SPOTIFY_SUGGESTED = [
  { name: 'Deep Focus',         url: 'https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ' },
  { name: 'lofi beats',         url: 'https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn' },
  { name: 'Peaceful Piano',     url: 'https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO' },
  { name: 'Ambient Relaxation', url: 'https://open.spotify.com/playlist/37i9dQZF1DX3Ogo9pFvBkY' },
  { name: 'Brain Food',         url: 'https://open.spotify.com/playlist/37i9dQZF1DWXLeA8Omikj7' }
];

// https://open.spotify.com/track/ID?si=…  |  …/intl-de/album/ID  |  spotify:playlist:ID
function parseSpotify(input) {
  const s = String(input || '').trim();
  let m = s.match(/^https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{10,30})(?:[/?#]|$)/);
  if (!m) m = s.match(/^spotify:(track|album|playlist|episode|show|artist):([A-Za-z0-9]{10,30})$/);
  if (!m) return null;
  return { type: m[1], id: m[2], url: 'https://open.spotify.com/' + m[1] + '/' + m[2] };
}

function spotifyEmbedUrl(p) {
  return 'https://open.spotify.com/embed/' + p.type + '/' + p.id + '?utm_source=webwell&theme=0';
}

if (typeof module !== 'undefined') { module.exports = { SPOTIFY_SUGGESTED, parseSpotify, spotifyEmbedUrl }; }
