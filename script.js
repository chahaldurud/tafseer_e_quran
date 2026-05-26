const audio = new Audio();
audio.preload = "none"; // Saves data, only loads when you press play!
let allData = [];
let currentPlaylist = [];
let currentContext = { type: 'home', list: [] };
let currentTrack = null;
let uiTimeout;
let isEnded = false; 

const homeView = document.getElementById('home-view');
const listView = document.getElementById('list-view');
const playlistDetailView = document.getElementById('playlist-detail-view');
const playerView = document.getElementById('player-view');
const miniPlayer = document.getElementById('mini-player');
const progressBar = document.getElementById('progress-bar');
const playerUI = document.getElementById('player-ui');
const spinner = document.getElementById('player-spinner');
const skipBackBtn = document.getElementById('skip-back');
const skipForwardBtn = document.getElementById('skip-forward');
const mainPlayIcon = document.getElementById('main-play-icon');

// --- HARDWARE BACK BUTTON ---
window.addEventListener('popstate', (e) => {
    if (playerView.classList.contains('active')) {
        playerView.classList.remove('active'); 
        miniPlayer.classList.add('active');
    } else if (!playlistDetailView.classList.contains('hidden')) {
        playlistDetailView.classList.add('hidden'); 
        listView.classList.remove('hidden');
    } else if (homeView.classList.contains('hidden')) {
        const homeBtn = document.querySelector('.tab-btn:nth-child(1)');
        switchTab('HOME', homeBtn, true);
    }
});

// --- HELPER: Convert "05:30" to 330 seconds for the red progress bar ---
function parseDuration(str) {
    if(!str) return 0;
    let parts = str.split(':'), seconds = 0, m = 1;
    while (parts.length > 0) { seconds += m * parseInt(parts.pop(), 10); m *= 60; }
    return seconds;
}

// --- INIT ---
async function init() {
    try {
        const response = await fetch('data.json');
        allData = await response.json();
        
        // INSTANTLY prepare data using your JSON
        allData.forEach(item => {
            item.durationRaw = parseDuration(item.duration); 
            item.isLoaded = true; // Instantly loaded!
        });
        
        switchTab('HOME', document.querySelector('.tab-btn.active'));
    } catch (e) { console.error("Error loading JSON", e); }
}

// --- HTML GENERATOR ---
function getCardHTML(item) {
    let progress = Tracker.getProgress(item.id);
    let percent = progress > 0 && item.durationRaw ? Math.min((progress / item.durationRaw) * 100, 100) : 0;
    let durText = item.duration || '00:00'; // Reads instantly from JSON

    return `
        <div class="img-wrapper">
            <img src="${item.thumbnail}" loading="lazy" class="skeleton-block" onload="this.classList.remove('skeleton-block')">
            <span class="duration-badge">${durText}</span>
            <div id="thumb-prog-${item.id}" style="position:absolute; bottom:0; left:0; height:4px; background:var(--red); width: ${percent}%; transition: width 0.5s ease; z-index:3;"></div>
        </div>
        <div class="card-info">
            <div class="card-title">${item.title}</div>
            <div class="card-subtitle">${item.place} • ${item.date}</div>
        </div>
    `;
}

// --- TABS & VIEWS ---
function switchTab(tabName, btnElement, isBackEvent = false) {
    if (tabName !== 'HOME' && !isBackEvent) history.pushState({ layer: 'tab' }, '');

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    btnElement.classList.add('active');

    homeView.classList.add('hidden');
    listView.classList.add('hidden');
    playlistDetailView.classList.add('hidden');

    if (tabName === 'HOME') {
        homeView.classList.remove('hidden');
        renderHome(Algo.sortHome(allData));
    } else if (tabName === 'PLACE') {
        listView.classList.remove('hidden');
        renderGroupedList(Algo.sortPlace(allData), 'PLACE');
    } else if (tabName === 'TYPE') {
        listView.classList.remove('hidden');
        renderGroupedList(Algo.sortType(allData), 'TYPE');
    }
}

function renderHome(data) {
    homeView.innerHTML = '';
    data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'card';
        div.onclick = () => { currentContext = { type: 'home', list: [] }; startPlaylist([item], 0); };
        div.innerHTML = getCardHTML(item);
        homeView.appendChild(div);
    });
}

function renderGroupedList(playlists, propertyName) {
    listView.innerHTML = '';
    playlists.forEach(playlist => {
        const first = playlist.items[0];
        const div = document.createElement('div');
        div.className = 'list-item';
        div.onclick = () => openPlaylistView(propertyName, playlist.displayCategory, playlist.items);
        
        div.innerHTML = `
            <img class="list-thumb skeleton-block" src="${first.thumbnail}" loading="lazy" onload="this.classList.remove('skeleton-block')">
            <div class="list-content">
                <div class="list-title">${playlist.displayCategory}</div>
                <div class="list-subtitle">${playlist.items.length} Audios</div>
            </div>
            <img class="playlist-icon" src="icons/playlist.svg">
        `;
        listView.appendChild(div);
    });
}

function openPlaylistView(propertyName, category, groupItems) {
    history.pushState({ layer: 'playlist' }, ''); 
    listView.classList.add('hidden');
    playlistDetailView.classList.remove('hidden');
    document.getElementById('playlist-header-title').innerText = category;
    
    const container = document.getElementById('playlist-items');
    container.innerHTML = '';

    groupItems.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.onclick = () => { currentContext = { type: 'playlist', list: groupItems }; startPlaylist(groupItems, index); };
        
        let durText = item.duration || '00:00';
        div.innerHTML = `
            <img class="list-thumb skeleton-block" src="${item.thumbnail}" loading="lazy" onload="this.classList.remove('skeleton-block')">
            <div class="list-content">
                <div class="list-title">${item.title}</div>
                <div class="list-subtitle">${durText}</div>
            </div>
        `;
        container.appendChild(div);
    });
}

function closePlaylistView() { history.back(); }

// --- PLAYER ---
function showReplayUI() { skipBackBtn.classList.add('hidden'); skipForwardBtn.classList.add('hidden'); mainPlayIcon.style.width = '85px'; }
function resetReplayUI() { skipBackBtn.classList.remove('hidden'); skipForwardBtn.classList.remove('hidden'); mainPlayIcon.style.width = '60px'; }
function startPlaylist(playlist, startIndex) { playTrack(playlist[startIndex]); }

function playTrack(track) {
    if (!currentTrack || currentTrack.id !== track.id) {
        currentTrack = track; 
        audio.src = track.audiourl; 
        audio.preload = "auto"; // Now start loading the actual audio!
        isEnded = false;
        
        const savedTime = Tracker.getProgress(track.id);
        if (savedTime > 0) audio.currentTime = savedTime;

        resetReplayUI(); 
        document.getElementById('header-title-text').innerText = track.title;
        document.getElementById('player-title').innerText = track.title;
        document.getElementById('player-place').innerText = track.place;
        document.getElementById('mini-title').innerText = track.title;
        document.getElementById('mini-thumb').src = track.thumbnail;
        
        const bgImg = document.getElementById('player-bg');
        bgImg.classList.add('skeleton-block');
        bgImg.src = track.videobg;
        bgImg.onload = () => bgImg.classList.remove('skeleton-block');
        
        playerUI.classList.remove('active');
        renderNextList(); 
    }
    
    let playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => console.log("Playback prevented:", error));
    }
    syncIcons('pause'); 
    openPlayer();
}

function renderNextList() {
    const nextContainer = document.getElementById('next-list');
    nextContainer.innerHTML = '';
    const recommendations = Algo.getRecommendations(currentTrack, currentContext, allData);
    
    recommendations.forEach(track => {
        const div = document.createElement('div');
        div.className = 'next-item';
        div.onclick = () => { currentContext = { type: 'home', list: [] }; playTrack(track); };
        
        let durText = track.duration || '00:00';
        div.innerHTML = `
            <img class="next-thumb skeleton-block" src="${track.thumbnail}" loading="lazy" onload="this.classList.remove('skeleton-block')">
            <div class="next-info" style="width:100%; overflow:hidden;">
                <div class="next-title">${track.title}</div>
                <div class="next-subtitle">${track.place} • <span class="dur-badge-${track.id}">${durText}</span></div>
            </div>
        `;
        nextContainer.appendChild(div);
    });
}

// --- AUDIO EVENTS ---
audio.addEventListener('ended', () => {
    isEnded = true; Tracker.markAsFinished(currentTrack.id); 
    let thumbProg = document.getElementById(`thumb-prog-${currentTrack.id}`);
    if (thumbProg) thumbProg.style.width = `0%`;
    syncIcons('replay'); showReplayUI(); playerUI.classList.add('active'); clearTimeout(uiTimeout);
});

let saveTimer = 0;
audio.ontimeupdate = () => {
    if (isNaN(audio.duration)) return;
    progressBar.value = (audio.currentTime / audio.duration) * 100;
    
    const currTimeStr = formatTime(audio.currentTime);
    document.getElementById('curr-time').innerText = currTimeStr;
    document.getElementById('total-time').innerText = formatTime(audio.duration);
    document.getElementById('mini-duration').innerText = currTimeStr;

    saveTimer++;
    if (saveTimer > 4) {
        Tracker.saveProgress(currentTrack.id, audio.currentTime); saveTimer = 0;
        let percent = (audio.currentTime / audio.duration) * 100;
        let thumbProg = document.getElementById(`thumb-prog-${currentTrack.id}`);
        if (thumbProg) thumbProg.style.width = `${percent}%`;
    }
};

function togglePlayerUI(event) {
    if (event.target.id === 'video-container' || event.target.id === 'player-bg' || event.target.id === 'player-ui') {
        if (playerUI.classList.contains('active')) {
            if(!isEnded) { playerUI.classList.remove('active'); clearTimeout(uiTimeout); }
        } else { playerUI.classList.add('active'); startUITimer(); }
    }
}
function startUITimer() { clearTimeout(uiTimeout); if (!audio.paused && !isEnded) { uiTimeout = setTimeout(() => { playerUI.classList.remove('active'); }, 3000); } }

function togglePlay(event) {
    if(event) event.stopPropagation();
    if (isEnded) { audio.currentTime = 0; audio.play(); isEnded = false; resetReplayUI(); syncIcons('pause'); startUITimer();
    } else if (audio.paused) { audio.play(); syncIcons('pause'); startUITimer(); 
    } else { audio.pause(); syncIcons('play'); playerUI.classList.add('active'); clearTimeout(uiTimeout); Tracker.saveProgress(currentTrack.id, audio.currentTime); }
}

function skip(seconds, event) { if(event) event.stopPropagation(); audio.currentTime += seconds; isEnded = false; resetReplayUI(); if (!audio.paused) syncIcons('pause'); startUITimer(); }
function syncIcons(state) { let iconSrc = state === 'pause' ? 'icons/pause.svg' : state === 'play' ? 'icons/play.svg' : 'icons/replay.svg'; document.getElementById('main-play-icon').src = iconSrc; document.getElementById('mini-play-icon').src = iconSrc; }

audio.addEventListener('waiting', () => spinner.classList.remove('hidden'));
audio.addEventListener('playing', () => spinner.classList.add('hidden'));
audio.addEventListener('canplay', () => spinner.classList.add('hidden'));
progressBar.oninput = (e) => { if (isNaN(audio.duration)) return; audio.currentTime = (e.target.value / 100) * audio.duration; isEnded = false; resetReplayUI(); startUITimer(); };

function openPlayer() { history.pushState({ layer: 'player' }, ''); playerView.classList.add('active'); miniPlayer.classList.remove('active'); }
function closePlayer() { history.back(); }
function closeMiniPlayer() { audio.pause(); syncIcons('play'); miniPlayer.classList.remove('active'); if(currentTrack) Tracker.saveProgress(currentTrack.id, audio.currentTime); }

function formatTime(sec) { if (isNaN(sec)) return "00:00"; const m = Math.floor(sec / 60); const s = Math.floor(sec % 60); return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`; }

// --- SEARCH BAR ---
function toggleSearch(event) {
    const searchContainer = document.querySelector('.search-container');
    const searchInputEl = searchContainer.querySelector('input');
    const query = searchInputEl.value.trim();
    if (window.innerWidth <= 600 && !searchContainer.classList.contains('active')) {
        event.stopPropagation(); searchContainer.classList.add('active'); setTimeout(() => searchInputEl.focus(), 100); return;
    }
    if (query !== '') window.location.href = `search.html?q=${encodeURIComponent(query)}`;
    else searchInputEl.focus();
}
document.addEventListener('click', (e) => {
    const searchContainer = document.querySelector('.search-container');
    if (window.innerWidth <= 600 && searchContainer && searchContainer.classList.contains('active')) {
        if (!searchContainer.contains(e.target)) searchContainer.classList.remove('active');
    }
});
const searchInputEl = document.querySelector('.search-container input');
if(searchInputEl) searchInputEl.addEventListener('keypress', (e) => { if (e.key === 'Enter' && searchInputEl.value.trim() !== '') window.location.href = `search.html?q=${encodeURIComponent(searchInputEl.value.trim())}`; });

init();