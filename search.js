const audio = new Audio();
audio.preload = "none";
let allData = [];
let currentPlaylist = [];
let currentContext = { type: 'search', list: [] };
let currentTrack = null;
let uiTimeout;
let isEnded = false; 

const urlParams = new URLSearchParams(window.location.search);
const userQuery = urlParams.get('q') || '';

const searchView = document.getElementById('search-view');
const searchTitle = document.getElementById('search-title');
const searchInput = document.getElementById('search-input');
const playerView = document.getElementById('player-view');
const miniPlayer = document.getElementById('mini-player');
const playerUI = document.getElementById('player-ui');
const progressBar = document.getElementById('progress-bar');
const spinner = document.getElementById('player-spinner');
const skipBackBtn = document.getElementById('skip-back');
const skipForwardBtn = document.getElementById('skip-forward');
const mainPlayIcon = document.getElementById('main-play-icon');

if (userQuery) searchInput.value = userQuery;

window.addEventListener('popstate', (e) => {
    if (playerView.classList.contains('active')) {
        playerView.classList.remove('active'); 
        miniPlayer.classList.add('active');
    } 
});

function parseDuration(str) {
    if(!str) return 0;
    let parts = str.split(':'), seconds = 0, m = 1;
    while (parts.length > 0) { seconds += m * parseInt(parts.pop(), 10); m *= 60; }
    return seconds;
}

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
if(searchInput) searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && searchInput.value.trim() !== '') window.location.href = `search.html?q=${encodeURIComponent(searchInput.value.trim())}`;
});

function getLevenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            let cost = (b.charAt(i - 1) === a.charAt(j - 1)) ? 0 : 1;
            matrix[i][j] = Math.min(matrix[i - 1][j - 1] + cost, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
            if (i > 1 && j > 1 && b.charAt(i - 1) === a.charAt(j - 2) && b.charAt(i - 2) === a.charAt(j - 1)) {
                matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + cost);
            }
        }
    }
    return matrix[b.length][a.length];
}

function performSearch(query, data) {
    if (!query) return [];
    query = query.toLowerCase().trim();
    const queryWords = query.split(/\s+/).filter(w => w.length > 0);
    
    let scoredResults = data.map(item => {
        let score = 0;
        const itemKeywords = item.keywords ? item.keywords : "";
        const itemDisplayType = item.displaytype ? item.displaytype : "";
        const targetString = `${item.title} ${item.type} ${itemDisplayType} ${item.place} ${itemKeywords}`.toLowerCase();
        const targetWords = targetString.split(/[\s,]+/).filter(w => w.length > 0);

        if (targetString.includes(query)) score += 100;

        queryWords.forEach(qWord => {
            let bestWordScore = 0;
            targetWords.forEach(tWord => {
                if (qWord === tWord) bestWordScore = Math.max(bestWordScore, 50);
                else if (tWord.includes(qWord) && qWord.length >= 3) bestWordScore = Math.max(bestWordScore, 30);
                else if (qWord.length >= 4) {
                    let distFull = getLevenshteinDistance(qWord, tWord);
                    let tPrefix = tWord.substring(0, qWord.length);
                    let distPrefix = getLevenshteinDistance(qWord, tPrefix);
                    let maxEdits = qWord.length >= 6 ? 2 : 1;
                    if (distFull <= maxEdits || distPrefix <= maxEdits) bestWordScore = Math.max(bestWordScore, 20); 
                }
            });
            score += bestWordScore; 
        });
        return { item, score };
    });
    return scoredResults.filter(res => res.score > 0).sort((a, b) => b.score - a.score).map(res => res.item);
}

async function init() {
    try {
        const response = await fetch('data.json');
        allData = await response.json();
        
        allData.forEach(item => {
            item.durationRaw = parseDuration(item.duration);
            item.isLoaded = true;
        });
        
        let searchResults = performSearch(userQuery, allData);
        if (searchResults.length > 0) {
            searchTitle.innerHTML = `<div class="search-title-main">${searchResults.length} results found for <span>"${userQuery}"</span></div>`;
            renderGrid(searchResults);
        } else {
            searchTitle.innerHTML = `<div class="search-title-main">0 results found for <span>"${userQuery}"</span></div><div class="search-title-sub">Please check your spelling or try different keywords. Showing newest content instead:</div>`;
            renderGrid(Algo.sortHome(allData));
        }
    } catch (e) { console.error("Error loading JSON", e); }
}

function getCardHTML(item) {
    let progress = Tracker.getProgress(item.id);
    let percent = progress > 0 && item.durationRaw ? Math.min((progress / item.durationRaw) * 100, 100) : 0;
    let durText = item.duration || '00:00';
    
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

function renderGrid(data) {
    searchView.innerHTML = '';
    currentContext = { type: 'search', list: data }; 
    data.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'card';
        div.onclick = () => startPlaylist(data, index);
        div.innerHTML = getCardHTML(item);
        searchView.appendChild(div);
    });
}

function showReplayUI() { skipBackBtn.classList.add('hidden'); skipForwardBtn.classList.add('hidden'); mainPlayIcon.style.width = '85px'; }
function resetReplayUI() { skipBackBtn.classList.remove('hidden'); skipForwardBtn.classList.remove('hidden'); mainPlayIcon.style.width = '60px'; }
function startPlaylist(playlist, startIndex) { if (!playlist || !playlist[startIndex]) return; currentPlaylist = playlist; playTrack(currentPlaylist[startIndex]); }

function playTrack(track) {
    if (!currentTrack || currentTrack.id !== track.id) {
        currentTrack = track; audio.src = track.audiourl; audio.preload = "auto"; isEnded = false;
        const savedTime = Tracker.getProgress(track.id); if (savedTime > 0) audio.currentTime = savedTime;
        resetReplayUI(); 
        document.getElementById('header-title-text').innerText = track.title; document.getElementById('player-title').innerText = track.title; document.getElementById('player-place').innerText = track.place; document.getElementById('mini-title').innerText = track.title; document.getElementById('mini-thumb').src = track.thumbnail;
        const bgImg = document.getElementById('player-bg'); bgImg.classList.add('skeleton-block'); bgImg.src = track.videobg; bgImg.onload = () => bgImg.classList.remove('skeleton-block');
        playerUI.classList.remove('active'); renderNextList(); 
    }
    
    let playPromise = audio.play();
    if (playPromise !== undefined) playPromise.catch(error => console.log("Playback prevented:", error));
    syncIcons('pause'); openPlayer();
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
                <div class="next-subtitle">${track.place} • ${durText}</div>
            </div>
        `;
        nextContainer.appendChild(div);
    });
}

audio.addEventListener('ended', () => {
    isEnded = true; Tracker.markAsFinished(currentTrack.id); 
    let thumbProg = document.getElementById(`thumb-prog-${currentTrack.id}`); if (thumbProg) thumbProg.style.width = `0%`;
    syncIcons('replay'); showReplayUI(); playerUI.classList.add('active'); clearTimeout(uiTimeout);
});

let saveTimer = 0;
audio.ontimeupdate = () => {
    if (isNaN(audio.duration)) return;
    progressBar.value = (audio.currentTime / audio.duration) * 100;
    const currTimeStr = formatTime(audio.currentTime); document.getElementById('curr-time').innerText = currTimeStr; document.getElementById('total-time').innerText = formatTime(audio.duration); document.getElementById('mini-duration').innerText = currTimeStr;
    saveTimer++;
    if (saveTimer > 4) {
        Tracker.saveProgress(currentTrack.id, audio.currentTime); saveTimer = 0;
        let percent = (audio.currentTime / audio.duration) * 100; let thumbProg = document.getElementById(`thumb-prog-${currentTrack.id}`); if (thumbProg) thumbProg.style.width = `${percent}%`;
    }
};

function togglePlayerUI(event) {
    if (event.target.id === 'video-container' || event.target.id === 'player-bg' || event.target.id === 'player-ui') {
        if (playerUI.classList.contains('active')) { if(!isEnded) { playerUI.classList.remove('active'); clearTimeout(uiTimeout); } } else { playerUI.classList.add('active'); startUITimer(); }
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

init();