const audio = new Audio();
let songs = [];
let currentIndex = 0;
let isPlaying = false;
let currentPage = 'home';
function getPlaylists() {
    return JSON.parse(localStorage.getItem('rift_playlists')) || {};
}
function savePlaylists(playlists) {
    localStorage.setItem('rift_playlists', JSON.stringify(playlists));
}
window.addEventListener('DOMContentLoaded', () => {
    applySavedTheme();
    document.getElementById('toggle-btn').onclick = () => {
        document.getElementById('Sidebar').classList.toggle('close');
    };
    setupPlayerControls();
    loadSongs();
});
const SUPABASE_URL = 'https://vjhejqbcajtuclbfahhf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqaGVqcWJjYWp0dWNsYmZhaGhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyOTA3NDAsImV4cCI6MjA5MDg2Njc0MH0.wRdcJJi68TkiziDjkxmLdl-H5kFMbNZmIefoRKMQhxg';

async function loadSongs() {
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/songs?select=*&order=created_at.asc`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        const data = await res.json();

        songs = data.map(row => ({
            song: row.title,
            album: row.album,
            artist: row.artist,
            image: row.image_url,
            audioSrc: row.audio_url
        }));

        const saved = JSON.parse(localStorage.getItem('rift_player_state'));
        if (saved && songs[saved.index]) {
            currentIndex = saved.index;
            setSong(currentIndex, false);
            audio.addEventListener('loadedmetadata', () => {
                audio.currentTime = saved.currentTime || 0;
            }, { once: true });
        } else {
            setSong(0, false);
        }

        loadPage('home');
    } catch (err) {
        console.error('Failed to load songs:', err);
    }
}
function setSong(index, andPlay = true) {
    if (!songs[index]) return;
    currentIndex = index;
    const song = songs[index];

    document.getElementById('player-cover').src = song.image;
    document.getElementById('player-cover').alt = song.album;
    document.getElementById('player-title').textContent = song.song;
    document.getElementById('player-artist').textContent = song.artist;
    audio.src = song.audioSrc;

    const likedSongs = JSON.parse(localStorage.getItem('rift_likes')) || [];
    document.getElementById('Like').textContent = likedSongs.some(s => s.song === song.song) ? 'Liked!' : 'Like';

    audio.onloadedmetadata = () => {
        const totalEl = document.getElementById('total-time');
        if (totalEl) totalEl.textContent = formatTime(audio.duration);
    };

    if (andPlay) {
        audio.play();
        isPlaying = true;
        document.getElementById('Pause').textContent = 'Pause';
    }
    savePlayerState();
}
function setupPlayerControls() {
    document.getElementById('Pause').onclick = () => {
        if (isPlaying) {
            audio.pause();
            isPlaying = false;
            document.getElementById('Pause').textContent = 'Play';
        } else {
            audio.play();
            isPlaying = true;
            document.getElementById('Pause').textContent = 'Pause';
        }
        savePlayerState();
    };

    document.getElementById('Next').onclick = () => setSong((currentIndex + 1) % songs.length);
    document.getElementById('Previous').onclick = () => setSong((currentIndex - 1 + songs.length) % songs.length);

    document.getElementById('Like').onclick = () => {
        const song = songs[currentIndex];
        let likedSongs = JSON.parse(localStorage.getItem('rift_likes')) || [];
        const idx = likedSongs.findIndex(s => s.song === song.song);
        if (idx === -1) {
            likedSongs.push(song);
            document.getElementById('Like').textContent = 'Liked!';
        } else {
            likedSongs.splice(idx, 1);
            document.getElementById('Like').textContent = 'Like';
        }
        localStorage.setItem('rift_likes', JSON.stringify(likedSongs));
        if (currentPage === 'likedsongs') renderLikedSongs();
    };

    document.querySelector('.durationbar').onclick = (e) => {
        if (!audio.duration) return;
        const rect = document.querySelector('.durationbar').getBoundingClientRect();
        audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
        savePlayerState();
    };

    document.getElementById('volume-slider').oninput = (e) => {
        audio.volume = e.target.value;
    };

    audio.addEventListener('timeupdate', () => {
        const fill = document.querySelector('.durationbar-fill');
        const currentEl = document.getElementById('current-time');
        if (audio.duration && fill) fill.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
        if (currentEl) currentEl.textContent = formatTime(audio.currentTime);
    });

    audio.addEventListener('loadedmetadata', () => {
        const totalEl = document.getElementById('total-time');
        if (totalEl) totalEl.textContent = formatTime(audio.duration);
    });

    audio.addEventListener('ended', () => setSong((currentIndex + 1) % songs.length));
}
async function loadPage(pageName) {
    currentPage = pageName;
    const view = document.getElementById('view');
    const player = document.getElementById('player');

    document.querySelectorAll('#Sidebar li').forEach(li => li.classList.remove('Active'));
    const active = Array.from(document.querySelectorAll('#Sidebar li')).find(li =>
        li.getAttribute('onclick')?.includes(`'${pageName}'`)
    );
    if (active) active.classList.add('Active');

    if (pageName === 'home') {
        player.style.display = 'flex';
        view.style.display = 'none';
        return;
    }

    player.style.display = 'none';
    view.style.display = 'block';

    if (pageName === 'library') {
        view.innerHTML = `
            <div class="search-container">
                <input type="text" id="song-search" placeholder="Search songs or artists..." oninput="filterSongs()">
            </div>
            <div id="LibraryList" class="song-list-container"></div>
        `;
        renderLibrary(songs);
        return;
    }

    if (pageName === 'likedsongs') {
        view.innerHTML = `<div id="LikedList" class="song-list-container"></div>`;
        renderLikedSongs();
        return;
    }

    if (pageName === 'playlist') {
        renderPlaylistPage();
        return;
    }
}
function renderPlaylistPage() {
    const view = document.getElementById('view');
    const playlists = getPlaylists();
    const names = Object.keys(playlists);

    view.innerHTML = `
        <div class="playlist-page">
            <div class="playlist-page-header">
                <h2>Your Playlists</h2>
                <button class="create-playlist-btn" onclick="openCreatePlaylist()">+ New Playlist</button>
            </div>
            ${names.length === 0
                ? `<p class="empty-msg">No playlists yet. Create one to get started.</p>`
                : `<div class="playlist-grid">
                    ${names.map(name => `
                        <div class="playlist-card" onclick="openPlaylist('${escapeName(name)}')">
                            <div class="playlist-card-art">
                                ${playlists[name].songs.length > 0
                                    ? `<img src="${playlists[name].songs[0].image}" alt="">`
                                    : `<div class="playlist-card-placeholder">♪</div>`
                                }
                            </div>
                            <div class="playlist-card-info">
                                <p class="playlist-card-name">${name}</p>
                                <p class="playlist-card-count">${playlists[name].songs.length} song${playlists[name].songs.length !== 1 ? 's' : ''}</p>
                            </div>
                            <button class="delete-playlist-btn" onclick="deletePlaylist(event, '${escapeName(name)}')">✕</button>
                        </div>
                    `).join('')}
                   </div>`
            }
        </div>
    `;
}

function openCreatePlaylist() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal">
            <h3>New Playlist</h3>
            <input type="text" id="playlist-name-input" placeholder="Playlist name..." maxlength="40">
            <span class="modal-error" id="modal-error"></span>
            <div class="modal-btns">
                <button class="modal-cancel" onclick="closeModal()">Cancel</button>
                <button class="modal-confirm" onclick="createPlaylist()">Create</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('open'), 10);
    setTimeout(() => document.getElementById('playlist-name-input')?.focus(), 50);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.getElementById('playlist-name-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') createPlaylist();
    });
}

function createPlaylist() {
    const input = document.getElementById('playlist-name-input');
    const name  = input.value.trim();
    const err   = document.getElementById('modal-error');
    if (!name) { err.textContent = 'Please enter a name.'; return; }
    const playlists = getPlaylists();
    if (playlists[name]) { err.textContent = 'That name is already taken.'; return; }
    playlists[name] = { songs: [] };
    savePlaylists(playlists);
    closeModal();
    renderPlaylistPage();
}

function deletePlaylist(e, name) {
    e.stopPropagation();
    const playlists = getPlaylists();
    delete playlists[name];
    savePlaylists(playlists);
    renderPlaylistPage();
}

function openPlaylist(name) {
    const view = document.getElementById('view');
    const playlists = getPlaylists();
    const playlist = playlists[name];
    if (!playlist) return;

    view.innerHTML = `
        <div class="playlist-page">
            <div class="playlist-page-header">
                <button class="back-btn" onclick="renderPlaylistPage()">← Back</button>
                <h2>${name}</h2>
                <button class="create-playlist-btn" onclick="openAddSongs('${escapeName(name)}')">+ Add Songs</button>
            </div>
            ${playlist.songs.length === 0
                ? `<p class="empty-msg">No songs yet. Hit "+ Add Songs" to fill it up.</p>`
                : `<div class="song-list-container">
                    ${playlist.songs.map((song, i) => `
                        <div class="library-item">
                            <img src="${song.image}" width="50" style="border-radius:5px; flex-shrink:0;">
                            <div style="flex-grow:1; margin-left:15px;">
                                <p class="song-title">${song.song}</p>
                                <p class="song-artist">${song.artist}</p>
                            </div>
                            <button class="play-btn" onclick="playSongFromPlaylist('${escapeName(name)}', ${i})">Play</button>
                            <button class="remove-btn" style="margin-left:8px" onclick="removeSongFromPlaylist('${escapeName(name)}', ${i})">✕</button>
                        </div>
                    `).join('')}
                   </div>`
            }
        </div>
    `;
}

function openAddSongs(playlistName) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal modal-wide">
            <h3>Add to "${playlistName}"</h3>
            <input type="text" id="add-song-search" placeholder="Search..." oninput="filterAddSongs('${escapeName(playlistName)}')">
            <div id="add-songs-list" class="add-songs-list"></div>
            <div class="modal-btns">
                <button class="modal-cancel" onclick="closeModal(); openPlaylist('${escapeName(playlistName)}')">Done</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('open'), 10);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) { closeModal(); openPlaylist(playlistName); }
    });
    renderAddSongsList(playlistName, songs);
}

function renderAddSongsList(playlistName, list) {
    const container = document.getElementById('add-songs-list');
    if (!container) return;
    const playlists = getPlaylists();
    const existing  = playlists[playlistName]?.songs.map(s => s.song) || [];

    container.innerHTML = list.map((song) => {
        const inPlaylist = existing.includes(song.song);
        const globalIdx  = songs.indexOf(song);
        return `
            <div class="add-song-item">
                <img src="${song.image}" width="40" style="border-radius:4px; flex-shrink:0;">
                <div style="flex-grow:1; margin-left:12px;">
                    <p style="font-size:0.9rem; font-weight:600">${song.song}</p>
                    <p style="font-size:0.75rem; color:var(--secondary-text-clr)">${song.artist}</p>
                </div>
                <button
                    class="${inPlaylist ? 'remove-btn' : 'play-btn'}"
                    onclick="toggleSongInPlaylist('${escapeName(playlistName)}', ${globalIdx}, this)">
                    ${inPlaylist ? 'Remove' : '+ Add'}
                </button>
            </div>
        `;
    }).join('');
}

function filterAddSongs(playlistName) {
    const query = document.getElementById('add-song-search')?.value.toLowerCase() || '';
    const filtered = songs.filter(s =>
        s.song.toLowerCase().includes(query) ||
        s.artist.toLowerCase().includes(query)
    );
    renderAddSongsList(playlistName, filtered);
}

function toggleSongInPlaylist(playlistName, songIndex, btn) {
    const playlists = getPlaylists();
    const playlist  = playlists[playlistName];
    if (!playlist) return;
    const song     = songs[songIndex];
    const existing = playlist.songs.findIndex(s => s.song === song.song);
    if (existing === -1) {
        playlist.songs.push(song);
        btn.textContent = 'Remove';
        btn.className = 'remove-btn';
    } else {
        playlist.songs.splice(existing, 1);
        btn.textContent = '+ Add';
        btn.className = 'play-btn';
    }
    savePlaylists(playlists);
}

function removeSongFromPlaylist(playlistName, songIndex) {
    const playlists = getPlaylists();
    playlists[playlistName].songs.splice(songIndex, 1);
    savePlaylists(playlists);
    openPlaylist(playlistName);
}

function playSongFromPlaylist(playlistName, songIndexInPlaylist) {
    const playlists = getPlaylists();
    const song = playlists[playlistName]?.songs[songIndexInPlaylist];
    if (!song) return;
    const globalIndex = songs.findIndex(s => s.song === song.song);
    if (globalIndex !== -1) { setSong(globalIndex); loadPage('home'); }
}
function renderLibrary(list) {
    const container = document.getElementById('LibraryList');
    if (!container) return;
    container.innerHTML = '';
    if (list.length === 0) {
        container.innerHTML = `<p style="padding:20px; color:var(--secondary-text-clr)">No results found.</p>`;
        return;
    }
    list.forEach((song) => {
        const index = songs.findIndex(s => s.song === song.song);
        const item = document.createElement('div');
        item.className = 'library-item';
        item.innerHTML = `
            <img src="${song.image}" width="50" style="border-radius:5px; flex-shrink:0;">
            <div style="flex-grow:1; margin-left:15px;">
                <p class="song-title">${song.song}</p>
                <p class="song-artist">${song.artist}</p>
            </div>
            <button class="play-btn" data-idx="${index}">Play</button>
        `;
        item.querySelector('.play-btn').onclick = () => { setSong(index); loadPage('home'); };
        container.appendChild(item);
    });
}
function renderLikedSongs() {
    const container = document.getElementById('LikedList');
    if (!container) return;
    const likedSongs = JSON.parse(localStorage.getItem('rift_likes')) || [];
    container.innerHTML = '';
    if (likedSongs.length === 0) {
        container.innerHTML = `<p style="padding:20px; color:var(--secondary-text-clr)">No liked songs yet.</p>`;
        return;
    }
    likedSongs.forEach((song, index) => {
        const item = document.createElement('div');
        item.className = 'library-item';
        item.innerHTML = `
            <img src="${song.image}" width="50" style="border-radius:5px; flex-shrink:0;">
            <div style="flex-grow:1; margin-left:15px;">
                <p class="song-title">${song.song}</p>
                <p class="song-artist">${song.artist}</p>
            </div>
            <button class="remove-btn" data-idx="${index}">Remove</button>
        `;
        item.querySelector('.remove-btn').onclick = () => {
            let liked = JSON.parse(localStorage.getItem('rift_likes')) || [];
            liked.splice(index, 1);
            localStorage.setItem('rift_likes', JSON.stringify(liked));
            const currentSong = songs[currentIndex];
            if (currentSong) {
                document.getElementById('Like').textContent = liked.some(s => s.song === currentSong.song) ? 'Liked!' : 'Like';
            }
            renderLikedSongs();
        };
        container.appendChild(item);
    });
}
function filterSongs() {
    const query = document.getElementById('song-search')?.value.toLowerCase() || '';
    renderLibrary(songs.filter(s =>
        s.song.toLowerCase().includes(query) ||
        s.artist.toLowerCase().includes(query)
    ));
}
function closeModal() {
    const modal = document.querySelector('.modal-overlay');
    if (!modal) return;
    modal.classList.remove('open');
    setTimeout(() => modal.remove(), 250);
}

function escapeName(name) {
    return name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function savePlayerState() {
    localStorage.setItem('rift_player_state', JSON.stringify({
        index: currentIndex,
        currentTime: audio.currentTime,
        isPlaying
    }));
}

function formatTime(secs) {
    if (isNaN(secs)) return '0:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s}`;
    return `${m}:${s}`;
}
function applySavedTheme() {
    const savedTheme = localStorage.getItem('rift-theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
}
function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('rift-theme', newTheme);
}
