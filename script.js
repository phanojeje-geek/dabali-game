// CONFIGURATION
const GRID_SIZE = 8;
const INGREDIENTS = [
    { name: 'Attiéké', emoji: '🍚', id: 'attieke' },
    { name: 'Poisson', emoji: '🐟', id: 'poisson' },
    { name: 'Piment', emoji: '🌶️', id: 'piment' },
    { name: 'Oignon', emoji: '🧅', id: 'oignon' },
    { name: 'Tomate', emoji: '🍅', id: 'tomate' },
    { name: 'Alloco', emoji: '🍌', id: 'alloco', image: 'assets/alloco.png' },
    { name: 'Cube Maggi', emoji: '🟨', id: 'maggi', image: 'assets/maggi.png' },
    { name: 'Boisson Fraîche', emoji: '🍾', id: 'huile', image: 'assets/bottle.png' }
];

const OBSTACLES = {
    CRATE: { name: 'Caisse', emoji: '📦', id: 'crate', destructible: true, immovable: true },
    SACHET: { name: 'Sachet Garba', emoji: '🛍️', id: 'sachet', destructible: true, immovable: true },
    FROZEN: { name: 'Bloc glacé', emoji: '🧊', id: 'frozen', destructible: true, immovable: true },
    ROCK: { name: 'Roche', emoji: '🪨', id: 'rock', destructible: false, immovable: true },
    FIRE: { name: 'Flamme', emoji: '🔥', id: 'fire', destructible: true, immovable: true }
};

const STORAGE_KEYS = {
    sound: 'dabali_sound',
    soundVolume: 'dabali_sound_volume',
    vibration: 'dabali_vibration',
    theme: 'dabali_theme',
    playerName: 'dabali_player_name',
    currentLevel: 'dabali_current_level',
    maxUnlockedLevel: 'dabali_max_unlocked_level',
    bestScores: 'dabali_best_scores',
    bestStars: 'dabali_best_stars',
    freeSuperCombos: 'dabali_free_super_combos',
    gameState: 'dabali_game_state_v1',
    music: 'dabali_music',
    musicVolume: 'dabali_music_volume',
    bonusLevels: 'dabali_bonus_levels',
    usedPromoCodes: 'dabali_used_promo_codes'
};

// GLOBAL GAME STATE (Declared at top to prevent ReferenceError / TDZ)
let grid = [];
let score = 0;
let moves = 20;
let level = 1;
let currentGoals = {};
let goalProgress = {};
let isProcessing = false;
let playerName = "Joueur";
let isSoundOn = true;
let soundVolume = 0.8;
let isMusicOn = true;
let musicVolume = 0.7;
let isVibrationOn = true;
let freeSuperCombos = 0;
let comboCount = 0;
let cachedTileSize = 40;
let cachedGap = 4;

let timerInterval = null;
let avatarEl = null;
let avatarState = 'neutral';
let avatarIdleTimeout = null;
let avatarLimbsEl = null;
let timeRemaining = 90; // 1m30s
let isPaused = false;
let hintTimeout = null;
let currentHint = null;

// TIME BONUS & HELPER STATE
let hasSpawnedTimeBonusThisLevel = false;
let timeBonusTimeout = null;
let timeBonusCountdownInterval = null;

// CLEANUP TRANSIENT UI & PREVENT STUCK OVERLAYS
function cleanupTransientUI() {
    const stuckSelectors = [
        '#nomove-msg',
        '.nomove-toast',
        '.chef-helper-toast',
        '.floating-score-pop',
        '.time-bonus-avatar-wrapper',
        '.time-bonus-bubble',
        '.hand-hint',
        '#super-combo-msg',
        '.garba-chaud-banner',
        '.woyo-banner'
    ];
    stuckSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
            if (el && el.parentNode) el.parentNode.removeChild(el);
        });
    });

    if (window.chefHelperInterval) {
        clearInterval(window.chefHelperInterval);
        window.chefHelperInterval = null;
    }
    if (window.timeBonusTimeout) {
        clearTimeout(window.timeBonusTimeout);
        window.timeBonusTimeout = null;
    }
    if (window.timeBonusCountdownInterval) {
        clearInterval(window.timeBonusCountdownInterval);
        window.timeBonusCountdownInterval = null;
    }
    if (hintTimeout) {
        clearTimeout(hintTimeout);
        hintTimeout = null;
    }
    clearHints();
}

// BOOSTERS LOGIC STATE
let activeBooster = null; // 'bomb', 'lightning', 'shuffle', or null
let swapSourceTile = null;
let selectedTile = null;

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[m]));
}

function spawnChefJokerHelper() {
    if (isProcessing || isPaused || moves <= 0) return;
    
    // Check if a joker already exists on the grid - don't duplicate
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const t = grid[r] && grid[r][c];
            if (t && (t.type.id === "joker" || t.type.special === "joker")) {
                return;
            }
        }
    }

    const normalTiles = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const t = grid[r] && grid[r][c];
            if (t && t.type && !isObstacleId(t.type.id) && !isSpecialTile(t)) {
                normalTiles.push(t);
            }
        }
    }
    if (normalTiles.length === 0) return;
    const targetTile = normalTiles[Math.floor(Math.random() * normalTiles.length)];
    
    // Remove previous helper toasts
    document.querySelectorAll('.chef-helper-toast').forEach(t => t.remove());

    const toast = document.createElement("div");
    toast.className = "chef-helper-toast";
    toast.style.pointerEvents = "none";
    toast.innerHTML = `<span style="font-size:1.8rem;">👨🏾‍🍳</span> <span>Cadeau du Chef : Joker Éclair ! ⚡</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 2400);

    if (typeof soundManager !== 'undefined' && soundManager.playPromoSuccess) {
        soundManager.playPromoSuccess();
    }
    
    targetTile.type = { id: "joker", name: "Joker Éclair", emoji: "⚡", special: "joker" };
    renderTileContent(targetTile.el, targetTile.type);
    targetTile.el.classList.add("pop-anim");
    
    if (targetTile.el) {
        const rct = targetTile.el.getBoundingClientRect();
        showFloatingScore(rct.left + rct.width / 2, rct.top - 15, "JOKER DU CHEF ! 👨🏾‍🍳⚡", "#FFD700");
    }
}

// BONUS DE TEMPS : AVATAR ANIMÉ DU CHEF GARBAMAN (+15s CHRONO)
function spawnTimeBonusAvatar() {
    if (isPaused || isProcessing || moves <= 0) return;
    if (document.getElementById('time-bonus-avatar')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'time-bonus-avatar';
    wrapper.className = 'time-bonus-avatar-wrapper';
    wrapper.innerHTML = `
        <div class="time-bonus-bubble" id="time-bonus-bubble">
            <div class="bonus-tag"><i class="fas fa-stopwatch"></i> BONUS DU CHEF !</div>
            <div class="bonus-cta">Touche-moi vite ! <strong>+15s</strong> ⚡</div>
            <div class="bonus-timer-bar">
                <div class="bonus-timer-fill" id="bonus-timer-fill"></div>
            </div>
        </div>
        <div class="time-bonus-mascot" id="time-bonus-mascot-btn" role="button" aria-label="Réclamer le bonus de temps">
            <div class="mascot-aura"></div>
            <img src="assets/splash_chef.png" alt="Chef Garbaman" class="mascot-img">
            <div class="mascot-badge">+15s ⏰</div>
        </div>
    `;

    document.body.appendChild(wrapper);

    if (typeof soundManager !== 'undefined' && soundManager.playAdStart) {
        soundManager.playAdStart();
    }

    let isClaimed = false;
    const mascotBtn = wrapper.querySelector('#time-bonus-mascot-btn');
    const bubble = wrapper.querySelector('#time-bonus-bubble');

    const handleClaim = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (isClaimed) return;
        isClaimed = true;

        if (window.timeBonusTimeout) clearTimeout(window.timeBonusTimeout);
        if (window.timeBonusCountdownInterval) clearInterval(window.timeBonusCountdownInterval);

        // Add +15 seconds
        timeRemaining += 15;
        updateTimerUI();

        // Flash timer bar
        if (timerEl && timerEl.parentElement) {
            timerEl.parentElement.classList.remove('time-bonus-flash');
            void timerEl.parentElement.offsetWidth; // Force reflow
            timerEl.parentElement.classList.add('time-bonus-flash');
            setTimeout(() => {
                if (timerEl && timerEl.parentElement) {
                    timerEl.parentElement.classList.remove('time-bonus-flash');
                }
            }, 1200);
        }

        // Audio & vibration
        if (typeof soundManager !== 'undefined' && soundManager.playBonusTime) {
            soundManager.playBonusTime();
        }
        vibrate([70, 40, 110]);

        // Arcade floating score
        const rect = mascotBtn.getBoundingClientRect();
        showFloatingScore(rect.left + rect.width / 2, rect.top - 20, "+15 SECONDES ! ⏰⚡", "#00FF7F");

        // Happy celebration on mascot
        wrapper.classList.add('avatar-claimed');
        bubble.innerHTML = `<div class="bonus-tag">🍲 CHEF CONTENT !</div><div class="bonus-cta"><strong>+15s ajoutées dé !</strong> 🎉</div>`;

        createBonusSparkles(rect.left + rect.width / 2, rect.top + rect.height / 2);

        setTimeout(() => {
            wrapper.classList.add('avatar-fly-out');
            setTimeout(() => {
                if (wrapper.parentNode) wrapper.remove();
            }, 450);
        }, 850);
    };

    mascotBtn.addEventListener('click', handleClaim);
    mascotBtn.addEventListener('touchstart', handleClaim, { passive: false });

    window.timeBonusTimeout = setTimeout(() => {
        if (isClaimed) return;
        isClaimed = true;
        bubble.innerHTML = `<div class="bonus-tag">👋🏾 TROP TARD DÉ !</div><div class="bonus-cta">À la prochaine ! 🍲</div>`;
        wrapper.classList.add('avatar-expired');
        setTimeout(() => {
            if (wrapper.parentNode) wrapper.remove();
        }, 500);
    }, 12000);
}

function createBonusSparkles(cx, cy) {
    for (let i = 0; i < 12; i++) {
        const spark = document.createElement('div');
        spark.className = 'spark-particle';
        const angle = (i / 12) * Math.PI * 2;
        const dist = 35 + Math.random() * 45;
        spark.style.setProperty('--tx', `${Math.cos(angle) * dist}px`);
        spark.style.setProperty('--ty', `${Math.sin(angle) * dist}px`);
        spark.style.left = `${cx}px`;
        spark.style.top = `${cy}px`;
        spark.style.background = i % 2 === 0 ? '#FFD700' : '#00FF7F';
        spark.style.pointerEvents = 'none';
        document.body.appendChild(spark);
        setTimeout(() => {
            if (spark.parentNode) spark.remove();
        }, 600);
    }
}

// ... (Existing code)

// Booster State Management
const BOOSTER_CONFIG = {
    bomb: { max: 3, current: 3 },
    lightning: { max: 3, current: 3 },
    shuffle: { max: 2, current: 2, cooldown: 0, lastUsed: 0 }
};

function initBoosterState() {
    // Reset boosters per level based on rules
    BOOSTER_CONFIG.bomb.current = 3;
    BOOSTER_CONFIG.lightning.current = 3;
    
    if (level >= 10) {
        BOOSTER_CONFIG.shuffle.max = 2;
        BOOSTER_CONFIG.shuffle.current = 2;
    } else {
        BOOSTER_CONFIG.shuffle.max = 1;
        BOOSTER_CONFIG.shuffle.current = 1;
    }
    BOOSTER_CONFIG.shuffle.cooldown = 0;
    updateBoostersUI();
}

function activateBooster(type) {
    if (moves <= 0 || isPaused) return;

    // Toggle off if already active
    if (activeBooster === type) {
        activeBooster = null;
        updateBoostersUI();
        return;
    }
    
    // Check availability
    if (BOOSTER_CONFIG[type].current <= 0) {
        showToast("Booster épuisé !");
        return;
    }

    // --- NEW LOGIC: Check for Long-Pressed Target ---
    const target = document.querySelector('.tile.selected-booster-target');
    
    if (target && (type === 'bomb' || type === 'lightning')) {
        const tile = getTileFromEl(target);
        if (tile) {
            // Apply immediately
            if (type === 'bomb') {
                bombBlast(tile);
                useBooster('bomb');
                target.classList.remove('selected-booster-target');
                activeBooster = null; // Reset active booster
                updateBoostersUI();
                return;
            }
            // lightning requires direction; fall through to activation message
        }
    }
    // --- END NEW LOGIC ---

    if (type === 'shuffle') {
        // ... (Existing shuffle logic)
        const now = Date.now();
        if (BOOSTER_CONFIG.shuffle.max > 1 && BOOSTER_CONFIG.shuffle.current < BOOSTER_CONFIG.shuffle.max) {
             if (now - BOOSTER_CONFIG.shuffle.lastUsed < 60000) {
                 const remaining = Math.ceil((60000 - (now - BOOSTER_CONFIG.shuffle.lastUsed))/1000);
                 showToast(`Attends ${remaining}s !`);
                 return;
             }
        }
        useBooster('shuffle');
        shuffleGrid();
        vibrate(50);
        return;
    }

    // Default activation (Legacy mode or if no tile selected)
    activeBooster = type;
    updateBoostersUI();
    vibrate(50);
    
    let msg = '';
    if (type === 'bomb') msg = '💣 Mode Bombe : Touche une case pour exploser en 3x3 !';
    if (type === 'lightning') msg = '⚡ Mode Foudre : Swipe horizontal pour la ligne, vertical pour la colonne !';
    showToast(msg);
}

function handleBoosterInput(tile) {
    if (!activeBooster) return false;

    if (activeBooster === 'bomb') {
        if (!tile) return false;
        bombBlast(tile);
        useBooster('bomb');
        activeBooster = null;
        updateBoostersUI();
        return true;
    }

    // lightning is applied in swipe handler (directional)

    return false;
}

function getBoosterCount(type) {
    return BOOSTER_CONFIG[type].current;
}

function useBooster(type) {
    if (BOOSTER_CONFIG[type].current > 0) {
        BOOSTER_CONFIG[type].current--;
        if (type === 'shuffle') {
            BOOSTER_CONFIG.shuffle.lastUsed = Date.now();
            if (BOOSTER_CONFIG.shuffle.current > 0 && BOOSTER_CONFIG.shuffle.max > 1) {
                // Start cooldown timer UI update loop?
                startShuffleCooldownTimer();
            }
        }
    }
    updateBoostersUI();
}

let shuffleTimerInterval = null;
function startShuffleCooldownTimer() {
    if (shuffleTimerInterval) clearInterval(shuffleTimerInterval);
    const btn = document.querySelector('.booster-item[title="Mélange"] .booster-count');
    
    shuffleTimerInterval = setInterval(() => {
        if (BOOSTER_CONFIG.shuffle.current === 0) {
            clearInterval(shuffleTimerInterval);
            updateBoostersUI();
            return;
        }
        const now = Date.now();
        const diff = now - BOOSTER_CONFIG.shuffle.lastUsed;
        if (diff >= 60000) {
            clearInterval(shuffleTimerInterval);
            updateBoostersUI();
        } else {
            if(btn) btn.innerText = Math.ceil((60000 - diff)/1000) + 's';
        }
    }, 1000);
}

function updateBoostersUI() {
    const boosters = document.querySelectorAll('.booster-item');
    boosters.forEach(b => {
        const title = b.getAttribute('title');
        let type = '';
        if (title === 'Bombe') type = 'bomb';
        else if (title === 'Mélange') type = 'shuffle';
        else if (title === 'Foudre') type = 'lightning';
        
        if (!type) return;
        
        const count = BOOSTER_CONFIG[type].current;
        const countEl = b.querySelector('.booster-count');
        
        // Update count text
        if (type === 'shuffle' && BOOSTER_CONFIG.shuffle.max > 1 && count > 0 && count < BOOSTER_CONFIG.shuffle.max) {
             const now = Date.now();
             if (now - BOOSTER_CONFIG.shuffle.lastUsed < 60000) {
                 // Timer is running via interval, don't overwrite
             } else {
                 countEl.innerText = count;
             }
        } else {
            countEl.innerText = count;
        }

        // Active state
        b.classList.remove('active');
        if (activeBooster === type) b.classList.add('active');
        
        // Disabled/Grayed state
        if (count <= 0) {
            b.classList.add('disabled');
            b.style.opacity = '0.5';
            b.style.pointerEvents = 'none'; // Prevent clicks
            b.style.filter = 'grayscale(100%)';
        } else {
            b.classList.remove('disabled');
            b.style.opacity = '1';
            b.style.pointerEvents = 'auto';
            b.style.filter = 'none';
            
            // Special check for shuffle cooldown
            if (type === 'shuffle' && BOOSTER_CONFIG.shuffle.max > 1 && count < BOOSTER_CONFIG.shuffle.max) {
                const now = Date.now();
                if (now - BOOSTER_CONFIG.shuffle.lastUsed < 60000) {
                     b.style.opacity = '0.7'; // Dimmed while cooling down
                }
            }
        }
    });
}

function bombBlast(centerTile) {
    if (!centerTile) return;
    const tiles = [];
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            const nr = centerTile.r + dr;
            const nc = centerTile.c + dc;
            if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
                const t = grid[nr][nc];
                if (t) tiles.push(t);
            }
        }
    }
    
    // Trigger cinematic explosion animation (Shockwave + Sparks + Screen Shake)
    createBombShockwave(centerTile);
    soundManager.playExplosion();
    vibrate([70, 40, 70]);
    processMatches(tiles);
}

function createBombShockwave(centerTile) {
    if (!centerTile || !centerTile.el) return;
    const rect = centerTile.el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    // 1. Fiery Shockwave Ring
    const wave = document.createElement('div');
    wave.className = 'bomb-shockwave';
    wave.style.left = `${cx}px`;
    wave.style.top = `${cy}px`;
    document.body.appendChild(wave);
    setTimeout(() => wave.remove(), 600);

    // 2. Bright Central Flash
    const flash = document.createElement('div');
    flash.className = 'bomb-center-flash';
    flash.style.left = `${cx}px`;
    flash.style.top = `${cy}px`;
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 350);

    // 3. Floating "BOOM !" Comic Pop
    const boomText = document.createElement('div');
    boomText.className = 'bomb-text-pop';
    boomText.innerText = 'BOOM ! 💥';
    boomText.style.left = `${cx}px`;
    boomText.style.top = `${cy - 20}px`;
    document.body.appendChild(boomText);
    setTimeout(() => boomText.remove(), 700);

    // 4. Burst Particles (24 gold and flame sparks)
    for (let i = 0; i < 20; i++) {
        const p = document.createElement('div');
        p.className = 'spark-particle';
        const angle = (i / 20) * Math.PI * 2 + (Math.random() * 0.2);
        const dist = 60 + Math.random() * 80;
        const tx = Math.cos(angle) * dist;
        const ty = Math.sin(angle) * dist;
        p.style.setProperty('--tx', `${tx}px`);
        p.style.setProperty('--ty', `${ty}px`);
        p.style.left = `${cx}px`;
        p.style.top = `${cy}px`;
        p.style.backgroundColor = ['#FF4500', '#FFD700', '#FF8C00', '#FFFFFF'][i % 4];
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 550);
    }

    triggerShake(500);
}

function lineClearRow(r) {
    showLightningBeam('row', r);
    showLightningBolt('row', r);
    const tiles = [];
    for (let c = 0; c < GRID_SIZE; c++) {
        const t = grid[r][c];
        if (t) tiles.push(t);
    }
    soundManager.playImpact();
    vibrate([40, 40]);
    processMatches(tiles);
}

function lineClearCol(c) {
    showLightningBeam('col', c);
    showLightningBolt('col', c);
    const tiles = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        const t = grid[r][c];
        if (t) tiles.push(t);
    }
    soundManager.playImpact();
    vibrate([40, 40]);
    processMatches(tiles);
}

function showLightningBeam(orientation, index) {
    if (!gridEl) return;
    const tileSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tile-size')) || 40;
    const gap = 4;
    const rect = gridEl.getBoundingClientRect();

    const beam = document.createElement('div');
    beam.style.position = 'fixed';
    beam.style.background = 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(173,216,230,0.9) 50%, rgba(255,255,255,0) 100%)';
    beam.style.boxShadow = '0 0 25px rgba(135,206,250,0.9), 0 0 8px rgba(255,255,255,0.9) inset';
    beam.style.pointerEvents = 'none';
    beam.style.zIndex = '9000';

    if (orientation === 'row') {
        const top = rect.top + 8 + (index * (tileSize + gap)) + tileSize / 2 - 9;
        beam.style.top = `${top}px`;
        beam.style.left = `${rect.left}px`;
        beam.style.width = `${rect.width}px`;
        beam.style.height = '18px';
    } else {
        const left = rect.left + 8 + (index * (tileSize + gap)) + tileSize / 2 - 9;
        beam.style.left = `${left}px`;
        beam.style.top = `${rect.top}px`;
        beam.style.width = '18px';
        beam.style.height = `${rect.height}px`;
    }

    document.body.appendChild(beam);
    beam.animate([
        { opacity: 0, transform: 'scale(0.8)' },
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(1.1)' }
    ], { duration: 450, easing: 'ease-out' }).onfinish = () => beam.remove();
}

function createCartoonShockwave(cx, cy) {
    const shock = document.createElement("div");
    shock.className = "cartoon-shockwave";
    shock.style.left = `${cx}px`;
    shock.style.top = `${cy}px`;
    shock.style.width = "74px";
    shock.style.height = "74px";
    document.body.appendChild(shock);
    setTimeout(() => shock.remove(), 430);

    // Spawning 8 cartoon burst sparks
    for (let i = 0; i < 8; i++) {
        const spark = document.createElement("div");
        spark.className = "cartoon-impact-spark";
        spark.style.left = `${cx}px`;
        spark.style.top = `${cy}px`;
        const angle = (i / 8) * 2 * Math.PI + (Math.random() - 0.5) * 0.4;
        const dist = 35 + Math.random() * 45;
        spark.style.setProperty("--tx", `${Math.cos(angle) * dist}px`);
        spark.style.setProperty("--ty", `${Math.sin(angle) * dist}px`);
        document.body.appendChild(spark);
        setTimeout(() => spark.remove(), 450);
    }
}

function showLightningBolt(orientation, index) {
    if (!gridEl) return;
    const tileSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tile-size')) || 40;
    const gap = 4;
    const rect = gridEl.getBoundingClientRect();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.style.position = 'fixed';
    svg.style.pointerEvents = 'none';
    svg.style.zIndex = '9985';
    let w, h, top, left;
    if (orientation === 'row') {
        w = rect.width;
        h = 56;
        top = rect.top + 8 + (index * (tileSize + gap)) + tileSize / 2 - h/2;
        left = rect.left;
    } else {
        w = 56;
        h = rect.height;
        top = rect.top;
        left = rect.left + 8 + (index * (tileSize + gap)) + tileSize / 2 - w/2;
    }
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.style.top = `${top}px`;
    svg.style.left = `${left}px`;

    const segments = 12;
    let mainPathStr = '';
    const midPoints = [];

    if (orientation === 'row') {
        const step = w / segments;
        for (let i = 0; i <= segments; i++) {
            const x = i * step;
            const y = (h / 2) + ((i % 2 === 0 ? 1 : -1) * (14 + (Math.random() - 0.5) * 10));
            midPoints.push({ x, y });
            mainPathStr += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
        }
    } else {
        const step = h / segments;
        for (let i = 0; i <= segments; i++) {
            const y = i * step;
            const x = (w / 2) + ((i % 2 === 0 ? 1 : -1) * (14 + (Math.random() - 0.5) * 10));
            midPoints.push({ x, y });
            mainPathStr += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
        }
    }

    // Outer plasma glow
    const glowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    glowPath.setAttribute('class', 'lightning-path-glow');
    glowPath.setAttribute('d', mainPathStr);
    svg.appendChild(glowPath);

    // Inner bright core
    const corePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    corePath.setAttribute('class', 'lightning-path-core');
    corePath.setAttribute('d', mainPathStr);
    svg.appendChild(corePath);

    // Dynamic secondary forks
    for (let f = 0; f < 3; f++) {
        const pIdx = Math.floor(Math.random() * (midPoints.length - 2)) + 1;
        const pt = midPoints[pIdx];
        const forkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        forkPath.setAttribute('class', 'lightning-path-core');
        const fdx = (Math.random() - 0.5) * 28;
        const fdy = (Math.random() - 0.5) * 28;
        forkPath.setAttribute('d', `M ${pt.x} ${pt.y} L ${pt.x + fdx} ${pt.y + fdy}`);
        svg.appendChild(forkPath);
    }

    document.body.appendChild(svg);
    triggerShake("heavy");

    // Spawn 3D cartoon shockwaves along the line
    for (let step = 0; step < 4; step++) {
        const targetX = orientation === 'row' ? (left + (step + 0.5) * (w / 4)) : (left + w / 2);
        const targetY = orientation === 'row' ? (top + h / 2) : (top + (step + 0.5) * (h / 4));
        createCartoonShockwave(targetX, targetY);
    }

    const anim = svg.animate([
        { opacity: 0.0, transform: 'scaleY(0.7)' },
        { opacity: 1.0, transform: 'scaleY(1.2)' },
        { opacity: 0.0, transform: 'scaleY(0.8)' }
    ], { duration: 420, easing: 'ease-out' });
    anim.onfinish = () => svg.remove();
}
function crossBlast(centerTile) {
    if (!centerTile) return;
    
    // 1. Visual Effect (Beam)
    const container = document.getElementById('game-container');
    const rect = centerTile.el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Horizontal Beam
    const hBeam = document.createElement('div');
    hBeam.style.position = 'fixed';
    hBeam.style.top = (rect.top + 5) + 'px';
    hBeam.style.left = '0';
    hBeam.style.width = '100%';
    hBeam.style.height = (rect.height - 10) + 'px';
    hBeam.style.background = 'rgba(255, 255, 255, 0.8)';
    hBeam.style.boxShadow = '0 0 20px white';
    hBeam.style.zIndex = '9000';
    hBeam.style.pointerEvents = 'none';
    document.body.appendChild(hBeam);
    
    // Vertical Beam
    const vBeam = document.createElement('div');
    vBeam.style.position = 'fixed';
    vBeam.style.top = '0';
    vBeam.style.left = (rect.left + 5) + 'px';
    vBeam.style.width = (rect.width - 10) + 'px';
    vBeam.style.height = '100%';
    vBeam.style.background = 'rgba(255, 255, 255, 0.8)';
    vBeam.style.boxShadow = '0 0 20px white';
    vBeam.style.zIndex = '9000';
    vBeam.style.pointerEvents = 'none';
    document.body.appendChild(vBeam);
    
    // Animate Beams
    const anim = [
        { opacity: 0, transform: 'scale(0.5)' },
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(1.2)' }
    ];
    hBeam.animate(anim, { duration: 300 }).onfinish = () => hBeam.remove();
    vBeam.animate(anim, { duration: 300 }).onfinish = () => vBeam.remove();
    
    // Sound
    soundManager.playImpact(); // Or a specific blast sound
    
    // 2. Destroy Tiles
    let tilesToDestroy = [];
    
    // Row
    for (let c = 0; c < GRID_SIZE; c++) {
        const tile = grid[centerTile.r][c];
        if (tile) {
             tilesToDestroy.push(tile);
             createMiniExplosion(tile);
        }
    }
    
    // Column
    for (let r = 0; r < GRID_SIZE; r++) {
        const tile = grid[r][centerTile.c];
        if (tile && !tilesToDestroy.includes(tile)) {
             tilesToDestroy.push(tile);
             createMiniExplosion(tile);
        }
    }
    
    score += tilesToDestroy.length * 20;
    useBooster('swap');
    
    // 3. Resolve
    updateUI();
    processMatches(tilesToDestroy).then(() => {
        resolveMatchesLoop();
    });
}

function createMiniExplosion(tile) {
    if(!tile || !tile.el) return;
    const rect = tile.el.getBoundingClientRect();
    const p = document.createElement('div');
    p.style.position = 'fixed';
    p.style.left = (rect.left + rect.width/2) + 'px';
    p.style.top = (rect.top + rect.height/2) + 'px';
    p.style.width = '20px';
    p.style.height = '20px';
    p.style.background = 'orange';
    p.style.borderRadius = '50%';
    p.style.zIndex = '9999';
    document.body.appendChild(p);
    p.animate([
        { transform: 'scale(0)', opacity: 1 },
        { transform: 'scale(2)', opacity: 0 }
    ], { duration: 300 }).onfinish = () => p.remove();
}

function destroyTile(tile) {
    if (!tile) return;
    
    // Create explosion effect
    const rect = tile.el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Particle effect
    for (let i = 0; i < 8; i++) {
        const p = document.createElement('div');
        p.style.position = 'fixed';
        p.style.left = centerX + 'px';
        p.style.top = centerY + 'px';
        p.style.width = '10px';
        p.style.height = '10px';
        p.style.background = 'gold';
        p.style.borderRadius = '50%';
        p.style.pointerEvents = 'none';
        p.style.zIndex = '9999';
        document.body.appendChild(p);
        
        const angle = Math.random() * Math.PI * 2;
        const dist = 30 + Math.random() * 30;
        const tx = Math.cos(angle) * dist;
        const ty = Math.sin(angle) * dist;
        
        p.animate([
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            { transform: `translate(${tx}px, ${ty}px) scale(0)`, opacity: 0 }
        ], { duration: 400, easing: 'ease-out' }).onfinish = () => p.remove();
    }
    
    // Destroy logic
    // We treat it as a match of 1 for the purpose of removing it
    score += 50; // Bonus points for hammering
    updateUI();
    
    soundManager.playImpact();
    processMatches([tile]).then(() => {
        resolveMatchesLoop();
    });
}

function shuffleGrid() {
    // Collect all current tiles
    let allTiles = [];
    for(let r=0; r<GRID_SIZE; r++) {
        for(let c=0; c<GRID_SIZE; c++) {
            if(grid[r][c] && !isObstacleId(grid[r][c].type.id)) {
                allTiles.push(grid[r][c].type);
            }
        }
    }
    
    // Shuffle types
    for (let i = allTiles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allTiles[i], allTiles[j]] = [allTiles[j], allTiles[i]];
    }
    
    // Reassign
    let idx = 0;
    for(let r=0; r<GRID_SIZE; r++) {
        for(let c=0; c<GRID_SIZE; c++) {
            if(grid[r][c] && !isObstacleId(grid[r][c].type.id)) {
                grid[r][c].type = allTiles[idx++];
                renderTileContent(grid[r][c].el, grid[r][c].type);
                // Animation
                grid[r][c].el.animate([
                    { transform: 'scale(0) rotate(180deg)' },
                    { transform: 'scale(1) rotate(0deg)' }
                ], { duration: 400 });
            }
        }
    }
    
    soundManager.playPromoSuccess(); // Use as shuffle sound
    resolveMatchesLoop(); // Check if shuffle created matches
}

function showToast(msg) {
    const t = document.createElement('div');
    t.innerText = msg;
    t.style.position = 'fixed';
    t.style.top = '20%';
    t.style.left = '50%';
    t.style.transform = 'translate(-50%, -50%)';
    t.style.background = 'rgba(0,0,0,0.8)';
    t.style.color = '#fff';
    t.style.padding = '10px 20px';
    t.style.borderRadius = '20px';
    t.style.zIndex = '5000';
    t.style.pointerEvents = 'none';
    document.body.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transition = 'opacity 0.5s';
        setTimeout(() => t.remove(), 500);
    }, 2000);
}

// PERSISTENCE & JUICY EFFECTS

function saveGameState() {
    if (moves <= 0 || timeRemaining <= 0) {
        localStorage.removeItem(STORAGE_KEYS.gameState);
        return;
    }

    const gridState = grid.map(row => row.map(tile => {
        if (!tile) return null; // Handle holes
        return {
            type: tile.type.id,
            isObstacle: isObstacleId(tile.type.id)
        };
    }));

    const state = {
        level,
        score,
        moves,
        timeRemaining,
        currentGoals,
        goalProgress,
        gridState
    };

    localStorage.setItem(STORAGE_KEYS.gameState, JSON.stringify(state));
}

function loadGameState() {
    const raw = localStorage.getItem(STORAGE_KEYS.gameState);
    if (!raw) return false;

    try {
        const state = JSON.parse(raw);
        if (state.level !== level) return false; // Basic validation

        score = state.score;
        moves = state.moves;
        timeRemaining = state.timeRemaining;
        currentGoals = state.currentGoals;
        goalProgress = state.goalProgress;
        
        // Restore Grid
        gridEl.innerHTML = '';
        grid = [];
        for (let r = 0; r < GRID_SIZE; r++) {
            let row = [];
            for (let c = 0; c < GRID_SIZE; c++) {
                const tileData = state.gridState[r][c];
                
                if (!tileData) {
                    // Restore hole
                    const emptyEl = document.createElement('div');
                    emptyEl.className = 'tile-empty';
                    gridEl.appendChild(emptyEl);
                    row.push(null);
                    continue;
                }

                let type;
                if (tileData.isObstacle) {
                     // Find obstacle def
                     for(let k in OBSTACLES) {
                         if(OBSTACLES[k].id === tileData.type) type = OBSTACLES[k];
                     }
                } else {
                     type = INGREDIENTS.find(i => i.id === tileData.type);
                }
                
                if (!type) type = INGREDIENTS[0]; // Fallback

                const el = document.createElement('div');
                el.className = 'tile';
                renderTileContent(el, type);
                el.dataset.r = r;
                el.dataset.c = c;
                
                // Position tile in grid (Fix Capture 4: restore coordinates so tiles don't collapse at 0,0)
                const tileSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tile-size')) || 40;
                const gap = 4;
                el.style.position = 'absolute';
                el.style.width = `${tileSize}px`;
                el.style.height = `${tileSize}px`;
                el.style.top = `${r * (tileSize + gap)}px`;
                el.style.left = `${c * (tileSize + gap)}px`;
                el.style.opacity = '1';
                
                // Re-attach events
                el.addEventListener('mousedown', handleInputStart);
                el.addEventListener('touchstart', handleInputStart, {passive: false});

                if (tileData.isObstacle) el.classList.add('obstacle');

                row.push({ r, c, type, el });
                gridEl.appendChild(el);
            }
            grid.push(row);
        }
        
        updateUI();
        renderGoals();
        updateTimerUI();
        startTimer(); // Resume timer
        return true;
    } catch (e) {
        console.error("Failed to load game state", e);
        return false;
    }
}

function clearSavedGame() {
    localStorage.removeItem(STORAGE_KEYS.gameState);
}

// JUICY EFFECTS & SPECIAL CANDY UTILS
function isSpecialTile(tile) {
    if (!tile || !tile.type) return false;
    return !!tile.type.special || tile.type.id === "color_bomb";
}
function isStripedTile(tile) {
    if (!tile || !tile.type) return false;
    return tile.type.special === "striped_h" || tile.type.special === "striped_v";
}
function isWrappedTile(tile) {
    if (!tile || !tile.type) return false;
    return tile.type.special === "wrapped";
}
function isColorBombTile(tile) {
    if (!tile || !tile.type) return false;
    return tile.type.id === "color_bomb" || tile.type.special === "color_bomb";
}

function triggerShake(intensity = "medium") {
    const shakeClass = intensity === "light" ? "shake-light" :
                       intensity === "heavy" ? "shake-heavy" :
                       intensity === "mega" ? "shake-mega" : "shake-medium";
    const duration = intensity === "light" ? 200 :
                     intensity === "heavy" ? 450 :
                     intensity === "mega" ? 650 : 320;
    document.body.classList.remove("shake-light", "shake-medium", "shake-heavy", "shake-mega", "shake-anim");
    void document.body.offsetWidth;
    document.body.classList.add(shakeClass);
    setTimeout(() => {
        document.body.classList.remove(shakeClass);
    }, duration);
    if (intensity === "light") vibrate(30);
    else if (intensity === "heavy") vibrate([60, 40, 80]);
    else if (intensity === "mega") vibrate([100, 50, 100, 50, 150]);
    else vibrate(50);
}

function showFloatingScore(x, y, text, color = "#FFD700") {
    const el = document.createElement("div");
    el.className = "floating-score-pop";
    el.innerText = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.pointerEvents = "none";
    if (color) el.style.color = color;
    document.body.appendChild(el);
    setTimeout(() => {
        if (el.parentNode) el.remove();
    }, 850);
}

function showFloatingText(x, y, text, color = "#FFD700") {
    showFloatingScore(x, y, text, color);
}

function showLaserBeam(orientation, index, size = 1) {
    if (!gridEl) return;
    const tileSize = cachedTileSize || 40;
    const gap = cachedGap || 4;
    const rect = gridEl.getBoundingClientRect();

    const beam = document.createElement("div");
    beam.className = "laser-beam-full";

    if (orientation === "row") {
        const top = rect.top + 8 + (index * (tileSize + gap)) + (tileSize / 2) - ((size * tileSize) / 2);
        beam.style.top = `${top}px`;
        beam.style.left = `${rect.left - 20}px`;
        beam.style.width = `${rect.width + 40}px`;
        beam.style.height = `${size * tileSize + 8}px`;
        beam.style.background = "linear-gradient(90deg, rgba(255,255,255,0) 0%, #FFFFFF 20%, #00FFFF 50%, #FF8C00 80%, rgba(255,255,255,0) 100%)";
    } else {
        const left = rect.left + 8 + (index * (tileSize + gap)) + (tileSize / 2) - ((size * tileSize) / 2);
        beam.style.left = `${left}px`;
        beam.style.top = `${rect.top - 20}px`;
        beam.style.width = `${size * tileSize + 8}px`;
        beam.style.height = `${rect.height + 40}px`;
        beam.style.background = "linear-gradient(180deg, rgba(255,255,255,0) 0%, #FFFFFF 20%, #00FFFF 50%, #FF8C00 80%, rgba(255,255,255,0) 100%)";
    }

    document.body.appendChild(beam);
    setTimeout(() => beam.remove(), 380);
}

function showLightningArcs(sourceX, sourceY, targetPoints) {
    if (!targetPoints || targetPoints.length === 0) return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "lightning-bolt-svg");
    svg.style.position = "fixed";
    svg.style.top = "0";
    svg.style.left = "0";
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.pointerEvents = "none";
    svg.style.zIndex = "9985";
    
    targetPoints.forEach(pt => {
        const dx = pt.x - sourceX;
        const dy = pt.y - sourceY;
        const dist = Math.hypot(dx, dy) || 1;
        const steps = Math.max(4, Math.floor(dist / 32));
        
        let dMain = `M ${sourceX} ${sourceY}`;
        const midPoints = [];
        for (let i = 1; i < steps; i++) {
            const ratio = i / steps;
            const perpX = -dy / dist;
            const perpY = dx / dist;
            const jitter = (Math.random() - 0.5) * 36;
            const mx = sourceX + dx * ratio + perpX * jitter;
            const my = sourceY + dy * ratio + perpY * jitter;
            midPoints.push({ x: mx, y: my });
            dMain += ` L ${mx} ${my}`;
        }
        dMain += ` L ${pt.x} ${pt.y}`;

        // Glow Path (plasma cyan)
        const glow = document.createElementNS("http://www.w3.org/2000/svg", "path");
        glow.setAttribute("class", "lightning-path-glow");
        glow.setAttribute("d", dMain);
        svg.appendChild(glow);

        // Core Path (pure white)
        const core = document.createElementNS("http://www.w3.org/2000/svg", "path");
        core.setAttribute("class", "lightning-path-core");
        core.setAttribute("d", dMain);
        svg.appendChild(core);

        // Dynamic forked branch
        if (midPoints.length >= 2) {
            const forkIdx = Math.floor(Math.random() * midPoints.length);
            const fpt = midPoints[forkIdx];
            const branchLen = 22 + Math.random() * 22;
            const branchAngle = Math.atan2(dy, dx) + (Math.random() > 0.5 ? 0.75 : -0.75);
            const bx = fpt.x + Math.cos(branchAngle) * branchLen;
            const by = fpt.y + Math.sin(branchAngle) * branchLen;
            const branch = document.createElementNS("http://www.w3.org/2000/svg", "path");
            branch.setAttribute("class", "lightning-path-core");
            branch.setAttribute("d", `M ${fpt.x} ${fpt.y} L ${bx} ${by}`);
            svg.appendChild(branch);
        }

        // Spawn 3D Cartoon Shockwave & Sparks at target
        createCartoonShockwave(pt.x, pt.y);
    });
    
    document.body.appendChild(svg);
    triggerShake("heavy");
    if (typeof soundManager !== 'undefined' && soundManager.playThunderImpact) {
        soundManager.playThunderImpact();
    }
    setTimeout(() => svg.remove(), 450);
}

function createWrappedExplosion(tile) {
    if (!tile || !tile.el) return;
    const rect = tile.el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const wave = document.createElement("div");
    wave.className = "bomb-shockwave";
    wave.style.borderColor = "#FFD700";
    wave.style.left = `${cx}px`;
    wave.style.top = `${cy}px`;
    document.body.appendChild(wave);
    setTimeout(() => wave.remove(), 550);

    const flash = document.createElement("div");
    flash.className = "bomb-center-flash";
    flash.style.background = "radial-gradient(circle, #FFFFFF 0%, #FFD700 45%, #FF8C00 70%, transparent 100%)";
    flash.style.left = `${cx}px`;
    flash.style.top = `${cy}px`;
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 350);

    showFloatingScore(cx, cy - 25, "MARMITE ROYALE ! 🍲💥", "#FFD700");

    for (let i = 0; i < 16; i++) {
        const p = document.createElement("div");
        p.className = "spark-particle";
        const angle = (i / 16) * Math.PI * 2 + (Math.random() * 0.2);
        const dist = 50 + Math.random() * 60;
        p.style.setProperty("--tx", `${Math.cos(angle) * dist}px`);
        p.style.setProperty("--ty", `${Math.sin(angle) * dist}px`);
        p.style.left = `${cx}px`;
        p.style.top = `${cy}px`;
        p.style.backgroundColor = ["#FFD700", "#FF4500", "#FFA500", "#FFFFFF"][i % 4];
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 500);
    }
}

function showWouhEffect() {
    const el = document.createElement('div');
    el.innerText = "WOUH !";
    el.style.position = 'fixed';
    el.style.top = '50%';
    el.style.left = '50%';
    el.style.transform = 'translate(-50%, -50%) scale(0)';
    el.style.fontSize = '4rem';
    el.style.fontWeight = 'bold';
    el.style.color = '#fff';
    el.style.textShadow = '0 0 20px #FF4500';
    el.style.zIndex = '3000';
    el.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    
    document.body.appendChild(el);
    
    requestAnimationFrame(() => {
        el.style.transform = 'translate(-50%, -50%) scale(1.5)';
    });
    
    setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 300);
    }, 800);
    
    triggerShake();
    soundManager.playBonDabali();
}

function getParticleColor(typeId) {
    switch(typeId) {
        case 'attieke': return '#F5F5DC';
        case 'poisson': return '#87CEEB';
        case 'piment': return '#FF4500';
        case 'oignon': return '#DDA0DD';
        case 'tomate': return '#FF6347';
        case 'maggi': return '#FFD700';
        case 'alloco': return '#FFB703';
        case 'huile': return '#52B788';
        case 'crate': return '#8B4513';
        case 'frozen': return '#E0FFFF';
        case 'rock': return '#696969';
        case 'fire': return '#FF4500';
        default: return '#FFFFFF';
    }
}

function spawnMatchParticles(x, y, color) {
    const count = 3;
    for(let i=0; i<count; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.backgroundColor = color;
        p.style.left = x + 'px';
        p.style.top = y + 'px';
        
        const angle = Math.random() * Math.PI * 2;
        const velocity = Math.random() * 40 + 15;
        
        p.style.setProperty('--tx', Math.cos(angle) * velocity + 'px');
        p.style.setProperty('--ty', Math.sin(angle) * velocity + 'px');
        
        document.body.appendChild(p);
        
        setTimeout(() => p.remove(), 320);
    }
}


const LEVELS = [
    { id: 1, moves: 25, goals: { attieke: 8, poisson: 8 }, 
      layout: [
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1]
      ]
    },
    { id: 2, moves: 25, goals: { attieke: 10, poisson: 10, piment: 10 },
      layout: [
        [0,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [0,1,1,1,1,1,1,0]
      ]
    },
    { id: 3, moves: 26, goals: { attieke: 12, poisson: 12, huile: 8 }, obstacles: { count: 3 },
      layout: [
        [1,1,1,0,0,1,1,1],
        [1,1,1,0,0,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,0,0,1,1,1],
        [1,1,1,0,0,1,1,1]
      ]
    },
    { id: 4, moves: 30, goals: { attieke: 15, poisson: 15, piment: 15, tomate: 10 }, obstacles: { count: 5 },
      layout: [
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,0,0,1,1,0,0,1],
        [1,0,0,1,1,0,0,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1]
      ]
    },
    { id: 5, moves: 35, goals: { attieke: 20, poisson: 20, piment: 20, oignon: 15, huile: 15 }, obstacles: { count: 6 },
      layout: [
        [0,0,1,1,1,1,0,0],
        [0,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [0,1,1,1,1,1,1,0],
        [0,0,1,1,1,1,0,0]
      ]
    },

    { id: 6, moves: 30, goals: { maggi: 15, huile: 15, tomate: 15 }, obstacles: { count: 8 },
      layout: [
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,0,0,0,0,1,1],
        [1,1,0,1,1,0,1,1],
        [1,1,0,1,1,0,1,1],
        [1,1,0,0,0,0,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1]
      ]
    },
    { id: 7, moves: 30, goals: { attieke: 25, poisson: 25 }, obstacles: { count: 10 },
      layout: [
        [0,0,0,1,1,0,0,0],
        [0,0,1,1,1,1,0,0],
        [0,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [0,1,1,1,1,1,1,0],
        [0,0,1,1,1,1,0,0],
        [0,0,0,1,1,0,0,0]
      ]
    },
    { id: 8, moves: 35, goals: { piment: 30, oignon: 30, maggi: 10 }, obstacles: { count: 12 },
      layout: [
        [1,1,1,1,1,1,1,1],
        [1,0,1,1,1,1,0,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,0,0,1,1,1],
        [1,1,1,0,0,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,0,1,1,1,1,0,1],
        [1,1,1,1,1,1,1,1]
      ]
    },
    { id: 9, moves: 35, goals: { attieke: 20, poisson: 20, huile: 20, tomate: 20 }, obstacles: { count: 10 },
      layout: [
        [1,1,0,1,1,0,1,1],
        [1,1,0,1,1,0,1,1],
        [0,0,0,0,0,0,0,0],
        [1,1,0,1,1,0,1,1],
        [1,1,0,1,1,0,1,1],
        [0,0,0,0,0,0,0,0],
        [1,1,0,1,1,0,1,1],
        [1,1,0,1,1,0,1,1]
      ]
    },
    { id: 10, moves: 40, goals: { maggi: 25, piment: 25, oignon: 25 }, obstacles: { count: 14 },
      layout: [
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,0,1,1,0,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,0,1,1,0,1,1],
        [1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1]
      ]
    },

    { id: 11, moves: 30, goals: { attieke: 50 }, obstacles: { count: 15 } },
    { id: 12, moves: 35, goals: { poisson: 30, huile: 30 }, obstacles: { count: 16 } },
    { id: 13, moves: 40, goals: { tomate: 20, oignon: 20, piment: 20, maggi: 20 }, obstacles: { count: 18 } },
    { id: 14, moves: 25, goals: { attieke: 15, poisson: 15 }, obstacles: { count: 20 } },
    { id: 15, moves: 45, goals: { huile: 40, maggi: 40 }, obstacles: { count: 15 } },

    { id: 16, moves: 35, goals: { attieke: 30, poisson: 30, piment: 30 }, obstacles: { count: 20 } },
    { id: 17, moves: 40, goals: { tomate: 50 }, obstacles: { count: 22 } },
    { id: 18, moves: 30, goals: { maggi: 10, huile: 10, piment: 10, oignon: 10, tomate: 10, attieke: 10, poisson: 10 }, obstacles: { count: 10 } },
    { id: 19, moves: 50, goals: { attieke: 40, poisson: 40, huile: 40 }, obstacles: { count: 24 } },
    { id: 20, moves: 60, goals: { attieke: 100, poisson: 100 }, obstacles: { count: 5 } },

    { id: 21, moves: 30, goals: { attieke: 25, poisson: 25, maggi: 15 }, obstacles: { count: 10 } },
    { id: 22, moves: 32, goals: { piment: 30, huile: 20, tomate: 20 }, obstacles: { count: 12 } },
    { id: 23, moves: 34, goals: { attieke: 30, poisson: 20, oignon: 20 }, obstacles: { count: 14 } },
    { id: 24, moves: 36, goals: { tomate: 30, maggi: 20, huile: 20 }, obstacles: { count: 14 } },
    { id: 25, moves: 38, goals: { attieke: 40, poisson: 40, piment: 25 }, obstacles: { count: 16 } },
    { id: 26, moves: 32, goals: { oignon: 30, tomate: 30 }, obstacles: { count: 18 } },
    { id: 27, moves: 35, goals: { attieke: 35, poisson: 35, huile: 25 }, obstacles: { count: 18 } },
    { id: 28, moves: 37, goals: { maggi: 30, piment: 30, oignon: 20 }, obstacles: { count: 20 } },
    { id: 29, moves: 40, goals: { attieke: 45, poisson: 45 }, obstacles: { count: 20 } },
    { id: 30, moves: 42, goals: { huile: 35, maggi: 35, tomate: 30 }, obstacles: { count: 22 } },

    { id: 31, moves: 34, goals: { attieke: 40, poisson: 30, piment: 30 }, obstacles: { count: 22 } },
    { id: 32, moves: 36, goals: { tomate: 35, oignon: 35 }, obstacles: { count: 22 } },
    { id: 33, moves: 38, goals: { maggi: 30, huile: 30, piment: 30 }, obstacles: { count: 24 } },
    { id: 34, moves: 40, goals: { attieke: 50, poisson: 50 }, obstacles: { count: 24 } },
    { id: 35, moves: 42, goals: { attieke: 40, poisson: 40, oignon: 30, tomate: 30 }, obstacles: { count: 26 } },
    { id: 36, moves: 44, goals: { maggi: 40, huile: 40 }, obstacles: { count: 26 } },
    { id: 37, moves: 34, goals: { piment: 45, tomate: 35 }, obstacles: { count: 28 } },
    { id: 38, moves: 36, goals: { attieke: 45, poisson: 45, maggi: 25 }, obstacles: { count: 28 } },
    { id: 39, moves: 38, goals: { huile: 40, oignon: 40 }, obstacles: { count: 30 } },
    { id: 40, moves: 40, goals: { attieke: 60, poisson: 60 }, obstacles: { count: 30 } },

    { id: 41, moves: 36, goals: { attieke: 50, poisson: 50, piment: 40 }, obstacles: { count: 30 } },
    { id: 42, moves: 38, goals: { tomate: 50, oignon: 50 }, obstacles: { count: 30 } },
    { id: 43, moves: 40, goals: { maggi: 45, huile: 45 }, obstacles: { count: 32 } },
    { id: 44, moves: 42, goals: { attieke: 55, poisson: 55, tomate: 40 }, obstacles: { count: 32 } },
    { id: 45, moves: 44, goals: { piment: 50, oignon: 50, maggi: 35 }, obstacles: { count: 34 } },
    { id: 46, moves: 46, goals: { attieke: 60, poisson: 60, huile: 40 }, obstacles: { count: 34 } },
    { id: 47, moves: 38, goals: { tomate: 55, maggi: 45 }, obstacles: { count: 36 } },
    { id: 48, moves: 40, goals: { attieke: 65, poisson: 65 }, obstacles: { count: 36 } },
    { id: 49, moves: 42, goals: { huile: 55, oignon: 55, piment: 45 }, obstacles: { count: 36 } },
    { id: 50, moves: 45, goals: { attieke: 70, poisson: 70, maggi: 50 }, obstacles: { count: 38 } },

    { id: 51, moves: 40, goals: { attieke: 80, poisson: 80 }, obstacles: { count: 38 } },
    { id: 52, moves: 42, goals: { piment: 70, tomate: 70 }, obstacles: { count: 38 } },
    { id: 53, moves: 44, goals: { maggi: 60, huile: 60, oignon: 50 }, obstacles: { count: 40 } },
    { id: 54, moves: 46, goals: { attieke: 75, poisson: 75, piment: 60 }, obstacles: { count: 40 } },
    { id: 55, moves: 48, goals: { tomate: 70, oignon: 70, maggi: 55 }, obstacles: { count: 40 } },
    { id: 56, moves: 50, goals: { attieke: 90, poisson: 90 }, obstacles: { count: 40 } },
    { id: 57, moves: 42, goals: { huile: 65, piment: 65 }, obstacles: { count: 42 } },
    { id: 58, moves: 44, goals: { attieke: 80, poisson: 80, tomate: 60 }, obstacles: { count: 42 } },
    { id: 59, moves: 46, goals: { maggi: 70, oignon: 70 }, obstacles: { count: 42 } },
    { id: 60, moves: 50, goals: { attieke: 100, poisson: 100, huile: 80 }, obstacles: { count: 44 } },

    { id: 61, moves: 42, goals: { attieke: 90, poisson: 90, piment: 70 }, obstacles: { count: 44 } },
    { id: 62, moves: 44, goals: { tomate: 80, oignon: 80, maggi: 60 }, obstacles: { count: 44 } },
    { id: 63, moves: 46, goals: { huile: 75, piment: 75 }, obstacles: { count: 46 } },
    { id: 64, moves: 48, goals: { attieke: 95, poisson: 95, tomate: 70 }, obstacles: { count: 46 } },
    { id: 65, moves: 50, goals: { maggi: 80, huile: 80, oignon: 70 }, obstacles: { count: 46 } },
    { id: 66, moves: 52, goals: { attieke: 110, poisson: 110 }, obstacles: { count: 48 } },
    { id: 67, moves: 44, goals: { piment: 85, tomate: 85 }, obstacles: { count: 48 } },
    { id: 68, moves: 46, goals: { attieke: 100, poisson: 100, maggi: 80 }, obstacles: { count: 48 } },
    { id: 69, moves: 48, goals: { huile: 90, oignon: 90 }, obstacles: { count: 50 } },
    { id: 70, moves: 52, goals: { attieke: 120, poisson: 120, piment: 90 }, obstacles: { count: 50 } },

    { id: 71, moves: 46, goals: { attieke: 110, poisson: 110, tomate: 90 }, obstacles: { count: 50 } },
    { id: 72, moves: 48, goals: { maggi: 90, huile: 90, oignon: 80 }, obstacles: { count: 52 } },
    { id: 73, moves: 50, goals: { attieke: 115, poisson: 115, piment: 95 }, obstacles: { count: 52 } },
    { id: 74, moves: 52, goals: { tomate: 100, oignon: 100, maggi: 85 }, obstacles: { count: 52 } },
    { id: 75, moves: 54, goals: { huile: 100, piment: 100 }, obstacles: { count: 54 } },
    { id: 76, moves: 56, goals: { attieke: 130, poisson: 130 }, obstacles: { count: 54 } },
    { id: 77, moves: 48, goals: { tomate: 110, maggi: 95 }, obstacles: { count: 54 } },
    { id: 78, moves: 50, goals: { attieke: 125, poisson: 125, huile: 100 }, obstacles: { count: 56 } },
    { id: 79, moves: 52, goals: { piment: 110, oignon: 110 }, obstacles: { count: 56 } },
    { id: 80, moves: 56, goals: { attieke: 140, poisson: 140, maggi: 110 }, obstacles: { count: 56 } },

    { id: 81, moves: 50, goals: { attieke: 130, poisson: 130, piment: 110 }, obstacles: { count: 58 } },
    { id: 82, moves: 52, goals: { tomate: 120, oignon: 120, maggi: 100 }, obstacles: { count: 58 } },
    { id: 83, moves: 54, goals: { huile: 110, piment: 120 }, obstacles: { count: 58 } },
    { id: 84, moves: 56, goals: { attieke: 145, poisson: 145, tomate: 120 }, obstacles: { count: 60 } },
    { id: 85, moves: 58, goals: { maggi: 120, huile: 120, oignon: 110 }, obstacles: { count: 60 } },
    { id: 86, moves: 60, goals: { attieke: 150, poisson: 150, piment: 130 }, obstacles: { count: 60 } },
    { id: 87, moves: 52, goals: { tomate: 130, maggi: 115 }, obstacles: { count: 62 } },
    { id: 88, moves: 54, goals: { attieke: 155, poisson: 155, huile: 130 }, obstacles: { count: 62 } },
    { id: 89, moves: 56, goals: { piment: 135, oignon: 130 }, obstacles: { count: 62 } },
    { id: 90, moves: 60, goals: { attieke: 160, poisson: 160, maggi: 130 }, obstacles: { count: 64 } },

    { id: 91, moves: 55, goals: { attieke: 160, poisson: 160, piment: 140 }, obstacles: { count: 64 } },
    { id: 92, moves: 57, goals: { tomate: 140, oignon: 140, maggi: 130 }, obstacles: { count: 64 } },
    { id: 93, moves: 59, goals: { huile: 130, piment: 145 }, obstacles: { count: 66 } },
    { id: 94, moves: 61, goals: { attieke: 170, poisson: 170, tomate: 140 }, obstacles: { count: 66 } },
    { id: 95, moves: 63, goals: { maggi: 140, huile: 140, oignon: 135 }, obstacles: { count: 66 } },
    { id: 96, moves: 65, goals: { attieke: 180, poisson: 180, piment: 150 }, obstacles: { count: 68 } },
    { id: 97, moves: 60, goals: { tomate: 150, maggi: 140 }, obstacles: { count: 68 } },
    { id: 98, moves: 62, goals: { attieke: 190, poisson: 190, huile: 150 }, obstacles: { count: 68 } },
    { id: 99, moves: 64, goals: { piment: 160, oignon: 150 }, obstacles: { count: 70 } },
    { id: 100, moves: 70, goals: { attieke: 200, poisson: 200, maggi: 160, huile: 160 }, obstacles: { count: 70 } }
];

const RECIPES = [
    ['attieke', 'poisson', 'piment'],
    ['maggi', 'huile', 'piment']
];

// LES 30 QUARTIERS EMBLÉMATIQUES D'ABIDJAN (CARTE D'AVENTURE DABALI)
const QUARTIERS_ABIDJAN = [
    { id: 1, name: "Deux Plateaux", commune: "Cocody", landmark: "Rue des Jardins & Vallon", color: "#FF7043" },
    { id: 2, name: "Angré", commune: "Cocody", landmark: "Château d'eau & 8e Tranche", color: "#FFA726" },
    { id: 3, name: "Riviera 3", commune: "Cocody", landmark: "Lycée Français & Cap Nord", color: "#FFCA28" },
    { id: 4, name: "Palmeraie", commune: "Cocody", landmark: "Rond-point Palmeraie", color: "#66BB6A" },
    { id: 5, name: "Anono", commune: "Cocody", landmark: "Village Ebrié & Bord de lagune", color: "#26A69A" },
    { id: 6, name: "Maroc", commune: "Yopougon", landmark: "Carrefour Américain & Maquis", color: "#42A5F5" },
    { id: 7, name: "Niangon", commune: "Yopougon", landmark: "Niangon Sud & Église", color: "#5C6BC0" },
    { id: 8, name: "Toits Rouges", commune: "Yopougon", landmark: "Quartier chaleureux", color: "#EC407A" },
    { id: 9, name: "Siporex", commune: "Yopougon", landmark: "Grand Carrefour Yopougon", color: "#AB47BC" },
    { id: 10, name: "Selmer", commune: "Yopougon", landmark: "Cœur historique de Yop", color: "#EF5350" },
    { id: 11, name: "Zone 4", commune: "Marcory", landmark: "Rue du 7 Décembre & Gastronomie", color: "#FFA726" },
    { id: 12, name: "Biétry", commune: "Marcory", landmark: "Lagune & Restaurants", color: "#29B6F6" },
    { id: 13, name: "Anoumabo", commune: "Marcory", landmark: "Berceau du Magic System & FEMUA", color: "#26A69A" },
    { id: 14, name: "Arras", commune: "Treichville", landmark: "Avenue Reine Pokou", color: "#FF7043" },
    { id: 15, name: "Belleville", commune: "Treichville", landmark: "Rue 12 & Maquis mythiques", color: "#FFCA28" },
    { id: 16, name: "Vridi", commune: "Port-Bouët", landmark: "Canal & Plages de Vridi", color: "#26C6DA" },
    { id: 17, name: "Gonzagueville", commune: "Port-Bouët", landmark: "Route de Grand-Bassam", color: "#78909C" },
    { id: 18, name: "Adjouffou", commune: "Port-Bouët", landmark: "Zone aéroportuaire & Cités", color: "#8D6E63" },
    { id: 19, name: "Sogefiha", commune: "Koumassi", landmark: "Cités conviviales & Garbadrome", color: "#FFA726" },
    { id: 20, name: "Avocatier", commune: "Abobo", landmark: "Grand Marché Avocatier", color: "#66BB6A" },
    { id: 21, name: "Gendarmerie", commune: "Abobo", landmark: "Camp d'Abobo & Allées", color: "#42A5F5" },
    { id: 22, name: "PK 18", commune: "Abobo", landmark: "Route d'Anyama & Carrefours", color: "#7E57C2" },
    { id: 23, name: "Mirador", commune: "Adjamé", landmark: "Hauts d'Adjamé & Échanges", color: "#EC407A" },
    { id: 24, name: "220 Logements", commune: "Adjamé", landmark: "Cité célèbre d'Adjamé", color: "#FF7043" },
    { id: 25, name: "Williamsville", commune: "Adjamé", landmark: "Macaci & Grande Mosquée", color: "#FFA726" },
    { id: 26, name: "Plateau Centre", commune: "Plateau", landmark: "Tours & Pont Alassane Ouattara", color: "#29B6F6" },
    { id: 27, name: "Agban", commune: "Attécoubé", landmark: "Camp militaire Agban", color: "#5C6BC0" },
    { id: 28, name: "Boribana", commune: "Attécoubé", landmark: "Bord de Lagune Ébrié", color: "#26A69A" },
    { id: 29, name: "Feh Kessé", commune: "Bingerville", landmark: "Collines verdoyantes", color: "#9CCC65" },
    { id: 30, name: "Ananeraie", commune: "Yopougon", landmark: "Terminus 40 & Cités calmes", color: "#FFD54F" }
];

function getLevelQuartier(levelId) {
    const idx = (levelId - 1) % QUARTIERS_ABIDJAN.length;
    return QUARTIERS_ABIDJAN[idx];
}

function getLevelGroupName(levelId) {
    const q = getLevelQuartier(levelId);
    return `${q.name} (${q.commune})`;
}

function renderAmbient(themeClass) {
    const layer = document.getElementById('ambient-layer');
    if (!layer) return;
    layer.innerHTML = '';
    const back = document.createElement('div');
    const mid = document.createElement('div');
    const front = document.createElement('div');
    back.className = 'ambient-back';
    mid.className = 'ambient-mid';
    front.className = 'ambient-front';
    layer.appendChild(back);
    layer.appendChild(mid);
    layer.appendChild(front);
    if (themeClass === 'theme-garba') {
        const leaves = document.createElement('div');
        leaves.className = 'ambient-leaves';
        mid.appendChild(leaves);
    } else if (themeClass === 'theme-yopougon') {
        const wave1 = document.createElement('div');
        const wave2 = document.createElement('div');
        wave1.className = 'ambient-wave';
        wave2.className = 'ambient-wave wave2';
        mid.appendChild(wave1);
        mid.appendChild(wave2);
    } else if (themeClass === 'theme-cocody') {
        const skyline = document.createElement('div');
        skyline.className = 'ambient-skyline';
        back.appendChild(skyline);
        for (let i = 0; i < 8; i++) {
            const light = document.createElement('div');
            light.className = 'ambient-light';
            light.style.left = Math.random() * 100 + '%';
            light.style.top = (Math.random() * 40 + 10) + 'px';
            light.style.animationDelay = (Math.random() * 2) + 's';
            front.appendChild(light);
        }
    } else if (themeClass === 'theme-treichville') {
        const market = document.createElement('div');
        market.className = 'ambient-market';
        mid.appendChild(market);
    } else {
        const dots = document.createElement('div');
        dots.className = 'ambient-dots';
        front.appendChild(dots);
    }
}
function applyThemeForLevel(levelId) {
    const themes = ['theme-garba','theme-yopougon','theme-cocody','theme-treichville','theme-marche'];
    const idx = Math.floor((levelId - 1) / 2) % themes.length;
    const themeClass = themes[idx];
    document.body.classList.remove('theme-garba','theme-yopougon','theme-cocody','theme-treichville','theme-marche');
    document.body.classList.add(themeClass);
    renderAmbient(themeClass);
}

// AMBIENT SOUND SYSTEM
let ambientOscillators = [];
let ambientGain = null;

const ambientSoundManager = {
    stop: () => {
        ambientOscillators.forEach(osc => {
            try { osc.stop(); } catch(e){}
        });
        ambientOscillators = [];
        if (ambientGain) {
            try { ambientGain.disconnect(); } catch(e){}
            ambientGain = null;
        }
    },
    
    play: (theme) => {
        if (!isMusicOn) return;
        ambientSoundManager.stop();
        
        if (!ensureAudioContextReady()) return;
        
        ambientGain = soundCtx.createGain();
        ambientGain.gain.value = 0.05; // Very low volume background
        ambientGain.connect(soundCtx.destination);

        if (theme === 'garba') {
            // Nature/Wind (Pink noise approx)
            const bufferSize = soundCtx.sampleRate * 2;
            const buffer = soundCtx.createBuffer(1, bufferSize, soundCtx.sampleRate);
            const data = buffer.getChannelData(0);
            let lastOut = 0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                data[i] = (lastOut + (0.02 * white)) / 1.02;
                lastOut = data[i];
                data[i] *= 3.5; 
            }
            
            const noise = soundCtx.createBufferSource();
            noise.buffer = buffer;
            noise.loop = true;
            noise.connect(ambientGain);
            noise.start();
            ambientOscillators.push(noise);
        } else if (theme === 'yopougon') {
            // Water/Waves (Low frequency noise)
            const osc = soundCtx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = 0.5; // LFO
            
            const gain = soundCtx.createGain();
            gain.gain.value = 0.1;
            
            // Create noise
            const bufferSize = soundCtx.sampleRate * 2;
            const buffer = soundCtx.createBuffer(1, bufferSize, soundCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = soundCtx.createBufferSource();
            noise.buffer = buffer;
            noise.loop = true;
            
            // Filter noise
            const filter = soundCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 400;
            
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(ambientGain);
            
            // Modulate filter freq with LFO
            osc.connect(filter.frequency);
            
            noise.start();
            osc.start();
            ambientOscillators.push(noise, osc);
        } else if (theme === 'cocody') {
            // City drone
            const osc1 = soundCtx.createOscillator();
            osc1.type = 'triangle';
            osc1.frequency.value = 50;
            const osc2 = soundCtx.createOscillator();
            osc2.type = 'sine';
            osc2.frequency.value = 52; // Beat freq
            
            osc1.connect(ambientGain);
            osc2.connect(ambientGain);
            osc1.start();
            osc2.start();
            ambientOscillators.push(osc1, osc2);
        } else if (theme === 'treichville') {
            // Party/Street vibe (Beat)
            const osc = soundCtx.createOscillator();
            osc.type = 'square';
            osc.frequency.value = 80;
            
            const gain = soundCtx.createGain();
            gain.gain.value = 0.05;
            
            // Low pass filter for muffled club sound
            const filter = soundCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 150;
            
            // LFO for beat pulsing
            const lfo = soundCtx.createOscillator();
            lfo.type = 'sine';
            lfo.frequency.value = 2; // 120 BPM approx
            
            const lfoGain = soundCtx.createGain();
            lfoGain.gain.value = 50;
            
            osc.connect(filter);
            lfo.connect(lfoGain);
            lfoGain.connect(filter.frequency);
            filter.connect(gain);
            gain.connect(ambientGain);
            
            osc.start();
            lfo.start();
            ambientOscillators.push(osc, lfo);
        } else if (theme === 'marche') {
            // Busy Market (Crowd noise + high pitched chatter)
            const bufferSize = soundCtx.sampleRate * 2;
            const buffer = soundCtx.createBuffer(1, bufferSize, soundCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * 0.5;
            }
            const noise = soundCtx.createBufferSource();
            noise.buffer = buffer;
            noise.loop = true;
            
            // Bandpass to focus on "speech" frequencies
            const filter = soundCtx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 1000;
            filter.Q.value = 1;
            
            noise.connect(filter);
            filter.connect(ambientGain);
            noise.start();
            ambientOscillators.push(noise);
        }
    }
};

// AMBIENT VISUAL MANAGER
const ambientManager = {
    currentTheme: null,
    
    update: (levelId) => {
        let theme = 'garba';
        if (levelId <= 10) theme = 'garba';
        else if (levelId <= 20) theme = 'yopougon';
        else if (levelId <= 40) theme = 'cocody';
        else if (levelId <= 60) theme = 'treichville';
        else theme = 'marche';

        // Always update visual if theme changed OR first load
        if (ambientManager.currentTheme !== theme) {
            ambientManager.currentTheme = theme;
            ambientManager.render(theme);
            ambientSoundManager.play(theme);
        }
    },

    render: (theme) => {
        const layer = document.getElementById('ambient-layer');
        if(!layer) return;
        layer.innerHTML = ''; // Clear

        if (theme === 'garba') {
            // Nature/Wood theme
            const leftPillar = document.createElement('div');
            leftPillar.className = 'ambient-element wood-pillar left';
            layer.appendChild(leftPillar);
            
            const rightPillar = document.createElement('div');
            rightPillar.className = 'ambient-element wood-pillar right';
            layer.appendChild(rightPillar);

            const leaves = document.createElement('div');
            leaves.className = 'ambient-element leaves-top';
            layer.appendChild(leaves);
        } else if (theme === 'yopougon') {
            // Water theme
            const overlay = document.createElement('div');
            overlay.className = 'ambient-element water-overlay';
            
            const wave1 = document.createElement('div');
            wave1.className = 'wave';
            overlay.appendChild(wave1);
            
            const wave2 = document.createElement('div');
            wave2.className = 'wave';
            overlay.appendChild(wave2);
            
            layer.appendChild(overlay);
        } else if (theme === 'cocody') {
            // City theme
            const skyline = document.createElement('div');
            skyline.className = 'ambient-element city-skyline';
            layer.appendChild(skyline);
            
            // Twinkling lights
            for(let i=0; i<8; i++) {
                const light = document.createElement('div');
                light.className = 'city-light';
                light.style.left = Math.random() * 100 + '%';
                light.style.top = (Math.random() * 40 + 10) + 'px';
                light.style.animationDelay = Math.random() * 3 + 's';
                layer.appendChild(light);
            }
        } else if (theme === 'treichville') {
            // Street/Party theme
            const s1 = document.createElement('div');
            s1.className = 'treichville-speaker left';
            s1.innerHTML = '<div class="speaker-tweeter"></div><div class="speaker-cone"></div>';
            layer.appendChild(s1);
            
            const s2 = document.createElement('div');
            s2.className = 'treichville-speaker right';
            s2.innerHTML = '<div class="speaker-tweeter"></div><div class="speaker-cone"></div>';
            layer.appendChild(s2);
        } else if (theme === 'marche') {
            // Market theme
            const u1 = document.createElement('div');
            u1.className = 'market-umbrella u1';
            layer.appendChild(u1);
            
            const u2 = document.createElement('div');
            u2.className = 'market-umbrella u2';
            layer.appendChild(u2);
            
            // Floating fruits
            const fruits = ['🍌', '🍍', '🥭', '🌶️'];
            for(let i=0; i<5; i++) {
                const f = document.createElement('div');
                f.className = 'market-fruit';
                f.innerText = fruits[Math.floor(Math.random() * fruits.length)];
                f.style.left = (Math.random() * 90 + 5) + '%';
                f.style.top = (Math.random() * 60 + 20) + '%';
                f.style.animationDelay = Math.random() * 2 + 's';
                f.style.fontSize = (Math.random() * 20 + 20) + 'px';
                layer.appendChild(f);
            }
        }
    }
};

// SOUND SYSTEM
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
const soundCtx = AudioContextClass ? new AudioContextClass() : null;

function ensureAudioContextReady() {
    if (!soundCtx) return false;
    if (soundCtx.state === "suspended") {
        if (typeof navigator !== 'undefined' && navigator.userActivation && !navigator.userActivation.hasBeenActive) {
            return false;
        }
        try {
            soundCtx.resume().catch(() => {});
        } catch(e) {
            return false;
        }
    }
    return true;
}

// African Background Music System (7-track playlist avec fondu et enchaînement continu)
const MUSIC_TRACKS = [
    'assets/audio/music/track1_dabali_game.mp3',
    'assets/audio/music/track2_amapiano.mp3',
    'assets/audio/music/track3_on_bouge.mp3',
    'assets/audio/music/track4_fais_ton_malin.mp3',
    'assets/audio/music/track5_rap_gang.mp3',
    'assets/audio/music/track6_african_drums.mp3',
    'assets/audio/music/track7_mes_abonnes.mp3'
];

const ambientSynth = {
    tracks: [...MUSIC_TRACKS],
    currentIndex: 0,
    audio: null,
    isPlaying: false,
    baseVolume: 0.28,

    init: function() {
        for (let i = this.tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
        }
    },

    startLoop: function() {
        if (!isMusicOn) return;
        if (this.isPlaying && this.audio && !this.audio.paused) return;
        this.playTrack(this.currentIndex);
    },

    playTrack: function(index) {
        if (!isMusicOn) return;
        this.currentIndex = index % this.tracks.length;
        const src = this.tracks[this.currentIndex];

        if (this.audio) {
            try {
                this.audio.pause();
                this.audio.currentTime = 0;
            } catch(e) {}
        }

        try {
            this.audio = new Audio(src);
            const currentVol = (typeof musicVolume === 'number') ? musicVolume : 1.0;
            this.audio.volume = Math.max(0, Math.min(1, this.baseVolume * currentVol));
            this.audio.preload = 'auto';

            this.audio.onended = () => {
                this.playTrack(this.currentIndex + 1);
            };

            this.audio.onerror = (err) => {
                console.warn("Musique fond erreur, morceau suivant...", err);
                setTimeout(() => this.playTrack(this.currentIndex + 1), 1200);
            };

            this.audio.play().then(() => {
                this.isPlaying = true;
            }).catch(e => {
                console.log("Attente clic pour démarrage audio:", e);
                this.isPlaying = false;
            });
        } catch(err) {
            console.error("Erreur lecteur musique fond:", err);
        }
    },

    updateVolume: function() {
        if (this.audio) {
            const currentVol = (typeof musicVolume === 'number') ? musicVolume : 1.0;
            this.audio.volume = Math.max(0, Math.min(1, this.baseVolume * currentVol));
        }
    },

    stop: function() {
        this.isPlaying = false;
        if (this.audio) {
            try {
                this.audio.pause();
            } catch(e) {}
        }
    }
};
ambientSynth.init();

const PENTATONIC_SCALE = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66, 1318.51, 1567.98];

const soundManager = {
    playTone: (freq, type, duration) => {
        if (!isSoundOn || soundVolume <= 0) return;
        if (!ensureAudioContextReady()) return;
        const osc = soundCtx.createOscillator();
        const gain = soundCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, soundCtx.currentTime);
        const effectiveGain = 0.12 * soundVolume;
        gain.gain.setValueAtTime(effectiveGain, soundCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, soundCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(soundCtx.destination);
        osc.start();
        osc.stop(soundCtx.currentTime + duration);
    },
    playClick: () => soundManager.playTone(400, "sine", 0.1),
    playMatch: (comboMultiplier = 1) => {
        if (!isSoundOn || soundVolume <= 0) return;
        const noteIdx = Math.min(Math.max(0, (comboMultiplier || 1) - 1), PENTATONIC_SCALE.length - 1);
        const freq = PENTATONIC_SCALE[noteIdx];
        soundManager.playTone(freq, "sine", 0.12);
        setTimeout(() => soundManager.playTone(freq * 1.5, "triangle", 0.18), 65);
    },
    playLaserShoot: () => {
        if (!isSoundOn || soundVolume <= 0) return;
        if (!ensureAudioContextReady()) return;
        const osc = soundCtx.createOscillator();
        const gain = soundCtx.createGain();
        osc.type = "sawtooth";
        const now = soundCtx.currentTime;
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.25);
        gain.gain.setValueAtTime(0.18 * soundVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(soundCtx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
    },
    playWrappedBomb: () => {
        if (!isSoundOn || soundVolume <= 0) return;
        if (!ensureAudioContextReady()) return;
        const osc = soundCtx.createOscillator();
        const gain = soundCtx.createGain();
        osc.type = "sine";
        const now = soundCtx.currentTime;
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.35);
        gain.gain.setValueAtTime(0.24 * soundVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(soundCtx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
        soundManager.playExplosion();
    },
    playLightningZap: () => {
        if (!isSoundOn || soundVolume <= 0) return;
        if (!ensureAudioContextReady()) return;
        const osc = soundCtx.createOscillator();
        const gain = soundCtx.createGain();
        osc.type = "sawtooth";
        const now = soundCtx.currentTime;
        osc.frequency.setValueAtTime(1800, now);
        osc.frequency.linearRampToValueAtTime(600, now + 0.16);
        gain.gain.setValueAtTime(0.16 * soundVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.connect(gain);
        gain.connect(soundCtx.destination);
        osc.start(now);
        osc.stop(now + 0.16);
    },
    playThunderImpact: () => {
        if (!isSoundOn || soundVolume <= 0) return;
        if (!ensureAudioContextReady()) return;
        const osc = soundCtx.createOscillator();
        const gain = soundCtx.createGain();
        osc.type = "sawtooth";
        const now = soundCtx.currentTime;
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.4);
        gain.gain.setValueAtTime(0.22 * soundVolume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain);
        gain.connect(soundCtx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
        soundManager.playExplosion();
    },
    playFishSizzle: () => {
        if (!isSoundOn || soundVolume <= 0) return;
        const notes = [659.25, 783.99, 1046.50, 1318.51];
        notes.forEach((f, i) => {
            setTimeout(() => soundManager.playTone(f, "sine", 0.08), i * 50);
        });
    },
    playColorBombMega: () => {
        if (!isSoundOn || soundVolume <= 0) return;
        const chord = [523.25, 659.25, 783.99, 1046.50];
        chord.forEach((f, i) => {
            setTimeout(() => soundManager.playTone(f, "triangle", 0.35), i * 75);
        });
    },
    playBonDabali: () => {
        soundManager.playTone(400, "square", 0.1);
        setTimeout(() => soundManager.playTone(600, "square", 0.1), 100);
        setTimeout(() => soundManager.playTone(800, "square", 0.1), 200);
        setTimeout(() => soundManager.playTone(1000, "square", 0.4), 300);
    },
    playWin: () => {
        [300, 400, 500, 600, 800].forEach((f, i) => setTimeout(() => soundManager.playTone(f, "triangle", 0.2), i * 100));
    },
    playError: () => {
        soundManager.playTone(220, "sawtooth", 0.12);
        setTimeout(() => soundManager.playTone(160, "sawtooth", 0.18), 100);
    },
    playAdStart: () => {
        soundManager.playTone(700, "sine", 0.08);
        setTimeout(() => soundManager.playTone(900, "sine", 0.1), 80);
    },
    playAdEnd: () => {
        soundManager.playTone(480, "triangle", 0.1);
        setTimeout(() => soundManager.playTone(720, "triangle", 0.14), 100);
    },
    playPromoSuccess: () => {
        soundManager.playTone(550, "square", 0.1);
        setTimeout(() => soundManager.playTone(750, "square", 0.14), 90);
        setTimeout(() => soundManager.playTone(950, "square", 0.16), 180);
    },
    playBonusTime: () => {
        if (!isSoundOn || soundVolume <= 0) return;
        const freqs = [440, 554, 659, 880, 1108];
        freqs.forEach((f, i) => {
            setTimeout(() => soundManager.playTone(f, "triangle", 0.16), i * 70);
        });
    },
    playExplosion: () => {
        if (!isSoundOn || soundVolume <= 0) return;
        if (!ensureAudioContextReady()) return;
        const bufferSize = Math.floor(soundCtx.sampleRate * 0.4);
        const buffer = soundCtx.createBuffer(1, bufferSize, soundCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize) * 0.5;
        }
        const source = soundCtx.createBufferSource();
        source.buffer = buffer;
        const gain = soundCtx.createGain();
        gain.gain.setValueAtTime(0.18 * soundVolume, soundCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, soundCtx.currentTime + 0.4);
        source.connect(gain);
        gain.connect(soundCtx.destination);
        source.start();
        soundManager.playTone(80, "sine", 0.3);
    },
    playImpact: () => {
        soundManager.playTone(150, "square", 0.1);
    }
};

function vibrate(pattern) {
    if (!isVibrationOn || !navigator || !navigator.vibrate) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    try {
        navigator.vibrate(pattern);
    } catch(e) {}
}

function updateFreeSuperDisplay() {
    const badge = document.getElementById('free-super-badge');
    if (!badge) return;
    badge.innerText = String(freeSuperCombos);
    badge.style.display = freeSuperCombos > 0 ? 'inline-flex' : 'none';
}

function redeemPromoCode() {
    if (!promoCodeInput || !promoMessageEl) return;
    const raw = promoCodeInput.value.trim().toUpperCase();
    if (!raw) {
        promoMessageEl.innerText = 'Code invalide.';
        soundManager.playError();
        vibrate([120, 60, 120]);
        return;
    }
    const config = PROMO_CODES[raw];
    if (!config) {
        promoMessageEl.innerText = 'Code inconnu.';
        soundManager.playError();
        vibrate([120, 60, 120]);
        return;
    }

    // Check used codes
    const rawUsed = localStorage.getItem(STORAGE_KEYS.usedPromoCodes);
    const usedCodes = rawUsed ? JSON.parse(rawUsed) : [];
    if (usedCodes.includes(raw)) {
        promoMessageEl.innerText = 'Ce code a déjà été utilisé !';
        soundManager.playError();
        vibrate([120, 60, 120]);
        return;
    }

    if (config.type === 'unlock_level') {
        const currentMaxRaw = parseInt(localStorage.getItem(STORAGE_KEYS.maxUnlockedLevel), 10);
        const maxUnlocked = Number.isFinite(currentMaxRaw) ? currentMaxRaw : 1;
        
        // Retrieve already unlocked bonus levels
        const rawBonus = localStorage.getItem(STORAGE_KEYS.bonusLevels);
        const bonusLevels = rawBonus ? JSON.parse(rawBonus) : [];
        
        // Check if user already has a pending bonus level (unlocked via promo but not reached naturally)
        const pendingBonus = bonusLevels.find(id => id > maxUnlocked);
        if (pendingBonus) {
            promoMessageEl.innerText = `Tu as déjà le niveau ${pendingBonus} débloqué ! Joue-le pour en débloquer d'autres.`;
            soundManager.playError();
            return;
        }
        
        // Find candidates: levels > maxUnlocked AND not already in bonusLevels
        const candidates = LEVELS.filter(l => l.id > maxUnlocked && !bonusLevels.includes(l.id));
        
        if (candidates.length === 0) {
            promoMessageEl.innerText = 'Tous les niveaux sont déjà débloqués !';
            soundManager.playError();
            return;
        }
        
        // Pick one random level
        const randomLevel = candidates[Math.floor(Math.random() * candidates.length)];
        
        // Unlock it
        bonusLevels.push(randomLevel.id);
        localStorage.setItem(STORAGE_KEYS.bonusLevels, JSON.stringify(bonusLevels));
        
        // Mark code as used
        usedCodes.push(raw);
        localStorage.setItem(STORAGE_KEYS.usedPromoCodes, JSON.stringify(usedCodes));
        
        config.message = `Niveau ${randomLevel.id} débloqué !`;
    }
    if (config.type === 'free_super') {
        freeSuperCombos += config.count;
        localStorage.setItem(STORAGE_KEYS.freeSuperCombos, String(freeSuperCombos));
        updateFreeSuperDisplay();
        
        // Mark code as used
        usedCodes.push(raw);
        localStorage.setItem(STORAGE_KEYS.usedPromoCodes, JSON.stringify(usedCodes));
    }
    soundManager.playPromoSuccess();
    vibrate([80, 40, 80, 40, 120]);
    promoMessageEl.innerText = config.message;
}

function setAvatarMood(state) {
    if (typeof avatarEl === 'undefined' || !avatarEl) return;
    avatarState = state;
    avatarEl.className = '';
    avatarEl.classList.add('avatar-face');
    if (state === 'happy') avatarEl.textContent = '😄';
    else if (state === 'angry') avatarEl.textContent = '😠';
    else if (state === 'bored') avatarEl.textContent = '😒';
    else avatarEl.textContent = '😋';
    if (state === 'happy') avatarEl.classList.add('avatar-happy');
    if (state === 'angry') {
        avatarEl.classList.add('avatar-angry');
        spawnAvatarThrow();
    }
    if (state === 'bored') avatarEl.classList.add('avatar-bored');
    if (typeof avatarLimbsEl !== 'undefined' && avatarLimbsEl) {
        avatarLimbsEl.style.transform = state === 'happy' ? 'translateY(-4px)' : state === 'angry' ? 'rotate(-3deg)' : '';
    }
    if (typeof avatarIdleTimeout !== 'undefined' && avatarIdleTimeout) clearTimeout(avatarIdleTimeout);
    avatarIdleTimeout = setTimeout(() => {
        setAvatarMood('neutral');
    }, 4000);
}

function spawnAvatarThrow() {
    const container = document.getElementById('avatar-container');
    if (!container) return;
    const ing = INGREDIENTS[Math.floor(Math.random() * INGREDIENTS.length)];
    const el = document.createElement('div');
    el.className = 'thrown-ingredient';
    el.textContent = ing.emoji || '🍲';
    el.style.position = 'absolute';
    el.style.left = '50%';
    el.style.bottom = '40px';
    el.style.transform = 'translateX(-50%)';
    el.style.fontSize = '22px';
    el.style.transition = 'transform 500ms ease-out, opacity 500ms ease-out';
    el.style.opacity = '1';
    container.appendChild(el);
    requestAnimationFrame(() => {
        el.style.transform = 'translate(-140px, -60px)';
        el.style.opacity = '0';
    });
    setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
    }, 520);
}

function spawnComboStars() {
    const effectContainer = document.getElementById('combo-effect');
    if (!effectContainer) return;
    effectContainer.innerHTML = '';
    effectContainer.classList.remove('hidden');
    const ring = document.createElement('div');
    ring.className = 'combo-ring';
    effectContainer.appendChild(ring);
    for (let i = 0; i < 18; i++) {
        const star = document.createElement('div');
        star.className = 'combo-star';
        star.style.left = Math.random() * 100 + '%';
        star.style.bottom = Math.random() * 40 + '%';
        effectContainer.appendChild(star);
    }
    setTimeout(() => {
        effectContainer.classList.add('hidden');
        effectContainer.innerHTML = '';
    }, 800);
}

// Configuration dynamique en ligne (gérée depuis le Dashboard Admin)
window.gameConfig = {
    ads: [],
    customLevels: [],
    announcement: null
};

async function fetchDynamicGameConfig() {
    try {
        const res = await fetch('/api/game-config');
        if (res.ok) {
            const data = await res.json();
            if (data) {
                window.gameConfig = data;
                applyDynamicConfig(data);
            }
        }
    } catch(e) {
        console.log("Mode hors-ligne ou config par défaut");
    }
}

function applyDynamicConfig(config) {
    if (config.customLevels && Array.isArray(config.customLevels)) {
        config.customLevels.forEach(customLvl => {
            const existingIdx = LEVELS.findIndex(l => l.id === customLvl.id);
            if (existingIdx >= 0) {
                LEVELS[existingIdx] = { ...LEVELS[existingIdx], ...customLvl };
            } else {
                LEVELS.push(customLvl);
            }
        });
    }

    if (config.announcement && config.announcement.enabled && config.announcement.text) {
        showAnnouncementBanner(config.announcement);
    }
}

function showAnnouncementBanner(announcement) {
    if (document.getElementById('flash-announcement-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'flash-announcement-banner';
    banner.style.cssText = "position:fixed; top:15px; left:50%; transform:translateX(-50%); background:linear-gradient(135deg, rgba(245, 158, 11, 0.95), rgba(180, 83, 9, 0.95)); border:1.5px solid #FFD700; border-radius:20px; padding:8px 18px; color:#FFF; font-size:0.85rem; font-weight:700; z-index:99999; display:flex; align-items:center; gap:10px; box-shadow:0 10px 25px rgba(0,0,0,0.4); max-width:90%;";
    banner.innerHTML = `
        <span style="background:#FFF; color:#B45309; padding:2px 8px; border-radius:10px; font-size:0.75rem; font-weight:800;">${announcement.badge || 'INFO'}</span>
        <span>${announcement.text}</span>
        <button style="background:transparent; border:none; color:#FFF; font-size:1.1rem; cursor:pointer; padding:0 4px;" onclick="this.parentElement.remove()">&times;</button>
    `;
    document.body.appendChild(banner);
    setTimeout(() => {
        if (banner.parentElement) {
            banner.style.opacity = '0';
            banner.style.transition = 'opacity 0.5s';
            setTimeout(() => banner.remove(), 500);
        }
    }, 8000);
}

function shouldShowAdAfterLevel(completedLevel, previousMax, newMax) {
    if (!window.gameConfig || !window.gameConfig.ads) return false;
    const activeAds = window.gameConfig.ads.filter(a => a.enabled);
    if (activeAds.length === 0) return false;
    
    // Fréquence configurée dans l'admin (par défaut tous les 3 niveaux)
    const freq = activeAds[0].frequency || 3;
    return completedLevel > 0 && completedLevel % freq === 0;
}

function showAdForLevel(completedLevel) {
    if (!window.gameConfig || !window.gameConfig.ads) {
        nextLevel();
        return;
    }
    const activeAds = window.gameConfig.ads.filter(a => a.enabled);
    if (activeAds.length === 0 || !adModalOverlay || !adPartnerNameEl || !adCodeHintEl || !adCountdownEl || !adContinueBtn) {
        nextLevel();
        return;
    }

    const ad = activeAds[Math.floor(Math.random() * activeAds.length)];
    adPartnerNameEl.innerText = `${ad.partner}`;
    adCodeHintEl.innerHTML = `
        <div style="font-size:0.95rem; margin-bottom:10px; color:#FFF8DC; line-height:1.4;">${ad.text}</div>
        ${ad.code ? `<div style="color:#FFD700; font-weight:bold; margin-bottom:12px;">Code Promo : <strong style="font-size:1.1rem;">${ad.code}</strong></div>` : ''}
        ${ad.link ? `<a href="${ad.link}" target="_blank" class="modal-btn" style="background:#25D366; color:#FFF; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:10px 18px; border-radius:14px; margin-bottom:12px; font-weight:bold; box-shadow:0 4px 12px rgba(37,211,102,0.4);"><i class="fab fa-whatsapp"></i> Visiter le Partenaire</a>` : ''}
    `;

    let remaining = 6;
    adCountdownEl.innerText = String(remaining);
    adContinueBtn.disabled = true;
    soundManager.playAdStart();
    vibrate([60, 40, 60]);
    adModalOverlay.classList.remove('hidden');
    adModalOverlay.classList.add('active');

    const interval = setInterval(() => {
        remaining -= 1;
        adCountdownEl.innerText = String(remaining);
        if (remaining <= 0) {
            clearInterval(interval);
            adContinueBtn.disabled = false;
        }
    }, 1000);

    adContinueBtn.onclick = () => {
        clearInterval(interval);
        adModalOverlay.classList.remove('active');
        setTimeout(() => {
            adModalOverlay.classList.add('hidden');
        }, 300);
        soundManager.playAdEnd();
        vibrate([40, 40, 120]);
        nextLevel();
    };
}

// DOM Elements (assigned in initGame)
let gridEl, scoreEl, movesEl, comboMsg, modalOverlay, modalBtn, footerGoalsEl, timerEl;
let nameModalOverlay, playerNameInput, startGameBtn, tutorialOverlay, tutorialOkBtn;
let levelGroupEl, promoModalOverlay, promoCodeInput, promoSubmitBtn, promoMessageEl;
let adModalOverlay, adPartnerNameEl, adCodeHintEl, adCountdownEl, adContinueBtn, adCopyBtn;
let levelSelectOverlay, levelGridEl, levelSelectCloseBtn, gameBoardEl, gameContainerEl, headerEl;
let btnMenu, drawerMenu, drawerOverlay, closeDrawerBtn, openLevelMapBtn, promoCodeBtn;
let darkModeToggle, soundToggle, musicToggle, vibrationToggle;
let splashScreen, startBtn, progress;

function updateTileSize() {
    try {
        if (!gameBoardEl || !gameContainerEl) return;
        
        // Ensure container has dimensions
        if (gameContainerEl.clientWidth === 0 || gameContainerEl.clientHeight === 0) {
            // Retry shortly if not ready
            setTimeout(updateTileSize, 100);
            return;
        }
        
        const headerHeight = headerEl ? headerEl.offsetHeight : 60;
        const footerHeight = footerGoalsEl ? footerGoalsEl.offsetHeight : 100;
        
        const containerWidth = gameContainerEl.clientWidth || window.innerWidth;
        // Use a safer height calculation
        const containerHeight = (window.innerHeight - headerHeight - footerHeight - 40) || 400; // Increased margin
        
        const availableWidth = Math.max(280, containerWidth - 30); // More padding
        const availableHeight = Math.max(280, containerHeight);
        
        const gridGap = 4; // Fixed gap
        const totalGaps = gridGap * (GRID_SIZE - 1);
        
        // Calculate max square size that fits
        const base = Math.min(availableWidth, availableHeight);
        const raw = Math.floor((base - totalGaps) / GRID_SIZE);
        const clamped = Math.max(30, Math.min(60, raw)); // Reduced max size to 60px to prevent overflow
        
        if (!isNaN(clamped)) {
            cachedTileSize = clamped;
            cachedGap = gridGap;
            document.documentElement.style.setProperty('--tile-size', `${clamped}px`);
            
            // Set Grid Height explicitely for Absolute Positioning
            if (gridEl) {
                const totalSize = (clamped * GRID_SIZE) + totalGaps;
                gridEl.style.height = `${totalSize}px`;
                gridEl.style.width = `${totalSize}px`;
                gridEl.style.position = 'relative'; 
                gridEl.style.margin = '0 auto'; // Center horizontally
            }
            
            // Update all tiles positions immediately
            const tiles = document.querySelectorAll('.tile');
            tiles.forEach(t => {
                const r = parseInt(t.dataset.r);
                const c = parseInt(t.dataset.c);
                if (!isNaN(r) && !isNaN(c)) {
                    t.style.position = 'absolute';
                    t.style.width = `${clamped}px`;
                    t.style.height = `${clamped}px`;
                    t.style.top = `${r * (clamped + gridGap)}px`;
                    t.style.left = `${c * (clamped + gridGap)}px`;
                    t.style.opacity = '1'; // Force visible
                }
            });
        }
    } catch (e) {
        console.error("Error in updateTileSize:", e);
    }
}

// INIT
function initGame() {
    console.log("Dabali Game v1.11 - Init Started");
    fetchDynamicGameConfig();
    
    // 1. Assign DOM Elements
    gridEl = document.getElementById('grid');
    scoreEl = document.getElementById('score-display');
    movesEl = document.getElementById('moves-display');
    comboMsg = document.getElementById('combo-message');
    modalOverlay = document.getElementById('modal-overlay');
    modalBtn = document.getElementById('modal-btn');
    footerGoalsEl = document.getElementById('footer-goals');
    timerEl = document.getElementById('timer-display');
    nameModalOverlay = document.getElementById('name-modal-overlay');
    playerNameInput = document.getElementById('player-name-input');
    startGameBtn = document.getElementById('start-game-btn');
    tutorialOverlay = document.getElementById('tutorial-overlay');
    tutorialOkBtn = document.getElementById('tutorial-ok-btn');
    levelGroupEl = document.getElementById('level-group-display');
    promoModalOverlay = document.getElementById('promo-modal-overlay');
    promoCodeInput = document.getElementById('promo-code-input');
    promoSubmitBtn = document.getElementById('promo-submit-btn');
    promoMessageEl = document.getElementById('promo-message');
    adModalOverlay = document.getElementById('ad-modal-overlay');
    adPartnerNameEl = document.getElementById('ad-partner-name');
    adCodeHintEl = document.getElementById('ad-code-hint');
    adCountdownEl = document.getElementById('ad-countdown');
    adContinueBtn = document.getElementById('ad-continue-btn');
    adCopyBtn = document.getElementById('ad-copy-btn');
    levelSelectOverlay = document.getElementById('level-select-overlay');
    levelGridEl = document.getElementById('level-grid');
    levelSelectCloseBtn = document.getElementById('level-select-close');
    gameBoardEl = document.getElementById('game-board');
    gameContainerEl = document.getElementById('game-container');
    headerEl = document.getElementById('header');
    btnMenu = document.getElementById('menu-btn');
    drawerMenu = document.getElementById('drawer-menu');
    drawerOverlay = document.getElementById('drawer-overlay');
    closeDrawerBtn = document.getElementById('close-drawer');
    openLevelMapBtn = document.getElementById('open-level-map');
    promoCodeBtn = document.getElementById('promo-code-btn');
    darkModeToggle = document.getElementById('dark-mode-toggle');
    soundToggle = document.getElementById('sound-toggle');
    musicToggle = document.getElementById('music-toggle');
    vibrationToggle = document.getElementById('vibration-toggle');
    splashScreen = document.getElementById('splash-screen');
    startBtn = document.getElementById('start-btn');
    progress = document.getElementById('splash-progress');

    try {
        // 2. Splash Logic handled in DOMContentLoaded
        if (!gridEl) {
            console.error("FATAL: #grid element not found in DOM!");
        }
        
        updateTileSize();
        window.addEventListener('resize', updateTileSize);
        window.addEventListener('orientationchange', updateTileSize);
    } catch (e) {
        console.error("Error during basic init:", e);
    }

    try {
        const savedTheme = localStorage.getItem(STORAGE_KEYS.theme);
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-mode');
            if (darkModeToggle) darkModeToggle.checked = true;
        }

        const savedSound = localStorage.getItem(STORAGE_KEYS.sound);
        if (savedSound) {
            isSoundOn = savedSound === 'on';
            if (soundToggle) soundToggle.checked = isSoundOn;
        }

        const savedVibration = localStorage.getItem(STORAGE_KEYS.vibration);
        if (savedVibration) {
            isVibrationOn = savedVibration === 'on';
            if (vibrationToggle) vibrationToggle.checked = isVibrationOn;
        }

        const savedName = localStorage.getItem(STORAGE_KEYS.playerName);
        if (savedName) {
            playerName = savedName;
            if (playerNameInput) playerNameInput.value = savedName;
        }

        // Name Modal Logic
        if (startGameBtn) {
            startGameBtn.addEventListener('click', () => {
                const name = playerNameInput ? playerNameInput.value.trim() : '';
                if (name) {
                    playerName = name;
                    localStorage.setItem(STORAGE_KEYS.playerName, playerName);
                }
                if (nameModalOverlay) {
                    nameModalOverlay.classList.remove('active');
                    setTimeout(() => {
                        nameModalOverlay.classList.add('hidden');
                    }, 300);
                }
                soundManager.playWin(); // Welcome sound
                proceedAfterSplash();
            });
        }

        // Menu Logic
        if (btnMenu) btnMenu.addEventListener('click', openDrawer);
        if (closeDrawerBtn) closeDrawerBtn.addEventListener('click', closeDrawer);
        if (drawerOverlay) drawerOverlay.addEventListener('click', closeDrawer);
        if (openLevelMapBtn) {
            openLevelMapBtn.addEventListener('click', () => {
                closeDrawer();
                openLevelSelect();
            });
        }
        
        // Dark Mode
        if (darkModeToggle) {
            darkModeToggle.addEventListener('change', () => {
                document.body.classList.toggle('dark-mode');
                localStorage.setItem(
                    STORAGE_KEYS.theme,
                    document.body.classList.contains('dark-mode') ? 'dark' : 'light'
                );
            });
        }

        const soundVolEl = document.getElementById('sound-volume');
        const musicVolEl = document.getElementById('music-volume');

        const savedSoundVol = parseFloat(localStorage.getItem(STORAGE_KEYS.soundVolume));
        if (Number.isFinite(savedSoundVol)) {
            soundVolume = Math.max(0, Math.min(1, savedSoundVol));
            if (soundVolEl) soundVolEl.value = Math.round(soundVolume * 100);
        }

        const savedMusicVol = parseFloat(localStorage.getItem(STORAGE_KEYS.musicVolume));
        if (Number.isFinite(savedMusicVol)) {
            musicVolume = Math.max(0, Math.min(1, savedMusicVol));
            if (musicVolEl) musicVolEl.value = Math.round(musicVolume * 100);
        }

        if (soundVolEl) {
            soundVolEl.addEventListener('input', (e) => {
                soundVolume = parseInt(e.target.value, 10) / 100;
                localStorage.setItem(STORAGE_KEYS.soundVolume, String(soundVolume));
            });
        }

        if (musicVolEl) {
            musicVolEl.addEventListener('input', (e) => {
                musicVolume = parseInt(e.target.value, 10) / 100;
                localStorage.setItem(STORAGE_KEYS.musicVolume, String(musicVolume));
                ambientSynth.updateVolume();
            });
        }

        if (soundToggle) {
            soundToggle.addEventListener('change', () => {
                isSoundOn = soundToggle.checked;
                localStorage.setItem(STORAGE_KEYS.sound, isSoundOn ? 'on' : 'off');
            });
        }

        if (musicToggle) {
            const savedMusic = localStorage.getItem(STORAGE_KEYS.music);
            if (savedMusic) {
                isMusicOn = savedMusic === 'on';
            } else {
                isMusicOn = true;
            }
            musicToggle.checked = isMusicOn;
            
            musicToggle.addEventListener('change', () => {
                isMusicOn = musicToggle.checked;
                localStorage.setItem(STORAGE_KEYS.music, isMusicOn ? 'on' : 'off');
                if (isMusicOn) {
                    ambientSynth.startLoop();
                } else {
                    ambientSynth.stop();
                }
            });
        }

        if (vibrationToggle) {
            vibrationToggle.addEventListener('change', () => {
                isVibrationOn = vibrationToggle.checked;
                localStorage.setItem(STORAGE_KEYS.vibration, isVibrationOn ? 'on' : 'off');
            });
        }

        const savedFreeSuper = parseInt(localStorage.getItem(STORAGE_KEYS.freeSuperCombos), 10);
        if (Number.isFinite(savedFreeSuper) && savedFreeSuper > 0) {
            freeSuperCombos = savedFreeSuper;
        }

        const pauseBtn = document.getElementById('pause-btn');
        if (pauseBtn) pauseBtn.addEventListener('click', togglePause);

        const quitBtn = document.getElementById('quit-btn');
        if (quitBtn) quitBtn.addEventListener('click', quitGame);

        // Booster Listeners
        const boosterItems = document.querySelectorAll('.booster-item');
        boosterItems.forEach(b => {
            b.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent grid click
                const title = b.getAttribute('title');
                if (title === 'Bombe') activateBooster('bomb');
                else if (title === 'Mélange') activateBooster('shuffle');
                else if (title === 'Foudre') activateBooster('lightning');
            });
        });

        // Event delegation fallback in case boosters are rendered later
        const boostersContainer = document.querySelector('.boosters-container');
        if (boostersContainer) {
            boostersContainer.addEventListener('click', (e) => {
                const item = e.target.closest('.booster-item');
                if (!item) return;
                e.stopPropagation();
                const title = item.getAttribute('title');
                if (title === 'Bombe') activateBooster('bomb');
                else if (title === 'Mélange') activateBooster('shuffle');
                else if (title === 'Foudre') activateBooster('lightning');
            });
        }

        if (promoCodeBtn && promoModalOverlay && promoCodeInput && promoSubmitBtn) {
            promoCodeBtn.addEventListener('click', () => {
                promoMessageEl.innerText = '';
                promoCodeInput.value = '';
                promoModalOverlay.classList.remove('hidden');
                promoModalOverlay.classList.add('active');
                promoCodeInput.focus();
            });
            promoSubmitBtn.addEventListener('click', () => {
                redeemPromoCode();
            });
            promoCodeInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    redeemPromoCode();
                }
            });
        }

        if (levelSelectCloseBtn) {
            levelSelectCloseBtn.addEventListener('click', () => {
                if (levelSelectOverlay) {
                    levelSelectOverlay.classList.remove('active');
                    setTimeout(() => {
                        levelSelectOverlay.classList.add('hidden');
                    }, 300);
                }
            });
        }

        // Hint system
        // Board Hint (if visible at start)
        const boardTip = document.getElementById('board-tip');
        if (boardTip) {
            boardTip.style.pointerEvents = 'none'; // Make sure it doesn't block clicks
            setTimeout(() => {
                boardTip.style.opacity = '0';
                setTimeout(() => boardTip.remove(), 500);
            }, 5000);
        }

        if (tutorialOkBtn) {
            tutorialOkBtn.addEventListener('click', () => {
                if (tutorialOverlay) {
                    tutorialOverlay.classList.remove('active');
                    setTimeout(() => {
                        tutorialOverlay.classList.add('hidden');
                    }, 300);
                }
                openLevelSelect();
            });
        }
    } catch (e) {
        console.error("FATAL ERROR in initGame:", e);
    }
}

function openLevelSelect() {
    clearHint();
    if (isMusicOn) ambientSynth.startLoop();
    if (!levelSelectOverlay) return;
    levelSelectOverlay.classList.remove('hidden');
    levelSelectOverlay.classList.add('active');
    renderAbidjanMap();
}

function renderAbidjanMap() {
    const gridContainer = document.getElementById('level-grid');
    const svgPath = document.getElementById('map-path-svg');
    const starsCountEl = document.getElementById('map-stars-count');
    if (!gridContainer) return;
    
    gridContainer.innerHTML = '';
    if (svgPath) svgPath.innerHTML = '';
    
    const maxUnlockedRaw = parseInt(localStorage.getItem(STORAGE_KEYS.maxUnlockedLevel), 10);
    const maxUnlocked = Number.isFinite(maxUnlockedRaw) ? maxUnlockedRaw : 1;
    
    const rawStars = localStorage.getItem(STORAGE_KEYS.bestStars);
    const starsMap = rawStars ? JSON.parse(rawStars) : {};
    
    let totalStarsEarned = 0;
    for (let lvlId in starsMap) {
        totalStarsEarned += (starsMap[lvlId] || 0);
    }
    if (starsCountEl) {
        starsCountEl.innerText = `${totalStarsEarned}/${QUARTIERS_ABIDJAN.length * 3}`;
    }
    
    const nodeSpacingY = 94;
    const startY = 70;
    const totalHeight = startY + (QUARTIERS_ABIDJAN.length * nodeSpacingY) + 100;
    gridContainer.style.height = `${totalHeight}px`;
    if (svgPath) svgPath.style.height = `${totalHeight}px`;
    
    const points = [];
    
    QUARTIERS_ABIDJAN.forEach((q, idx) => {
        const lvlNum = q.id;
        // Winding S-curve: x varies smoothly between 22% and 78%
        const pctX = 50 + 28 * Math.sin(idx * 0.92);
        const posY = startY + (idx * nodeSpacingY);
        
        points.push({ x: pctX, y: posY, id: lvlNum });
        
        const isUnlocked = lvlNum <= maxUnlocked;
        const isCurrent = lvlNum === level;
        const stars = starsMap[String(lvlNum)] || 0;
        
        const nodeEl = document.createElement('div');
        nodeEl.className = `map-node ${isUnlocked ? 'unlocked' : 'locked'} ${isCurrent ? 'current' : ''}`;
        nodeEl.style.left = `${pctX}%`;
        nodeEl.style.top = `${posY}px`;
        
        let starsHtml = '';
        for (let s = 1; s <= 3; s++) {
            starsHtml += `<i class="fas fa-star ${s <= stars ? '' : 'star-empty'}"></i>`;
        }
        
        nodeEl.innerHTML = `
            <div class="map-node-btn">
                ${isUnlocked ? lvlNum : '<i class="fas fa-lock" style="font-size:0.9rem;"></i>'}
            </div>
            <div class="map-node-badge" style="border-left: 3px solid ${q.color}">
                ${q.name}
            </div>
            <div class="map-node-stars">
                ${starsHtml}
            </div>
        `;
        
        nodeEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isUnlocked) {
                openLevelPreview(lvlNum, q, stars);
            } else {
                soundManager.playError();
                vibrate([100, 50, 100]);
                const prevName = QUARTIERS_ABIDJAN[lvlNum - 2] ? QUARTIERS_ABIDJAN[lvlNum - 2].name : 'précédent';
                showToast(`Termine d'abord ${prevName} chef ! 🔒`);
            }
        });
        
        gridContainer.appendChild(nodeEl);
    });
    
    // Draw Winding SVG Path
    if (svgPath && points.length > 1) {
        const svgWidth = gridContainer.clientWidth || window.innerWidth || 360;
        let d = `M ${(points[0].x / 100) * svgWidth} ${points[0].y}`;
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            const x1 = (p1.x / 100) * svgWidth;
            const y1 = p1.y;
            const x2 = (p2.x / 100) * svgWidth;
            const y2 = p2.y;
            const midY = (y1 + y2) / 2;
            d += ` C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
        }
        
        svgPath.innerHTML = `
            <defs>
                <linearGradient id="roadGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="#FFE066" />
                    <stop offset="50%" stop-color="#FF9F1C" />
                    <stop offset="100%" stop-color="#E71D36" />
                </linearGradient>
            </defs>
            <path d="${d}" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="14" stroke-linecap="round" />
            <path d="${d}" fill="none" stroke="url(#roadGrad)" stroke-width="6" stroke-linecap="round" stroke-dasharray="10 8" />
        `;
    }
    
    // Auto-scroll to current node
    setTimeout(() => {
        const scrollArea = document.getElementById('abidjan-map-scroll');
        const currentNode = gridContainer.querySelector('.map-node.current');
        if (scrollArea && currentNode) {
            const nodeTop = currentNode.offsetTop;
            scrollArea.scrollTop = Math.max(0, nodeTop - (scrollArea.clientHeight / 2));
        }
    }, 150);
}

function openLevelPreview(lvlNum, quartier, stars) {
    const modal = document.getElementById('level-preview-modal');
    if (!modal) return;
    
    const cfg = LEVELS.find(l => l.id === lvlNum) || LEVELS[0];
    
    const communeEl = document.getElementById('preview-commune');
    const titleEl = document.getElementById('preview-title');
    const landmarkEl = document.getElementById('preview-landmark');
    const movesEl = document.getElementById('preview-moves');
    const bestScoreEl = document.getElementById('preview-best-score');
    
    if (communeEl) communeEl.innerText = quartier.commune;
    if (titleEl) titleEl.innerText = `${lvlNum}. ${quartier.name}`;
    if (landmarkEl) landmarkEl.innerText = quartier.landmark;
    if (movesEl) movesEl.innerText = cfg.moves;
    
    const rawScores = localStorage.getItem(STORAGE_KEYS.bestScores);
    const scoresMap = rawScores ? JSON.parse(rawScores) : {};
    if (bestScoreEl) bestScoreEl.innerText = scoresMap[String(lvlNum)] || 0;
    
    const starsContainer = document.getElementById('preview-stars');
    if (starsContainer) {
        starsContainer.innerHTML = '';
        for (let s = 1; s <= 3; s++) {
            const star = document.createElement('i');
            star.className = `fas fa-star ${s <= stars ? 'gold' : 'star-empty'}`;
            star.style.color = s <= stars ? '#FFD700' : '#DDD';
            star.style.margin = '0 3px';
            starsContainer.appendChild(star);
        }
    }
    
    const goalsList = document.getElementById('preview-goals-list');
    if (goalsList) {
        goalsList.innerHTML = '';
        for (let gid in cfg.goals) {
            const ing = INGREDIENTS.find(i => i.id === gid);
            if (ing) {
                const item = document.createElement('div');
                item.className = 'preview-goal-item';
                item.innerHTML = `<span>${ing.emoji}</span> <span>${cfg.goals[gid]}</span>`;
                goalsList.appendChild(item);
            }
        }
    }
    
    const playBtn = document.getElementById('preview-play-btn');
    if (playBtn) {
        playBtn.onclick = () => {
            modal.classList.add('hidden');
            if (levelSelectOverlay) {
                levelSelectOverlay.classList.remove('active');
                levelSelectOverlay.classList.add('hidden');
            }
            startLevel(lvlNum);
        };
    }
    
    const closeBtn = document.getElementById('preview-close-btn');
    if (closeBtn) {
        closeBtn.onclick = () => modal.classList.add('hidden');
    }
    
    modal.classList.remove('hidden');
}

function openDrawer() {
    clearHint(); // Fix Capture 1: kill hand hint and cancel timer
    drawerMenu.classList.add('open');
    drawerOverlay.classList.remove('hidden');
}

function closeDrawer() {
    drawerMenu.classList.remove('open');
    drawerOverlay.classList.add('hidden');
}

function togglePause() {
    isPaused = !isPaused;
    const pauseBtn = document.getElementById('pause-btn');
    
    if (isPaused) {
        clearHints();
        clearInterval(timerInterval);
        const activeBonus = document.getElementById('time-bonus-avatar');
        if (activeBonus) activeBonus.remove();
        if (window.timeBonusTimeout) clearTimeout(window.timeBonusTimeout);
        isProcessing = true; // Block game
        if (pauseBtn) pauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        
        // Remove existing overlay if any
        const oldOverlay = document.getElementById('pause-overlay');
        if (oldOverlay) oldOverlay.remove();

        // Show Overlay with Quick Settings & Close Cross
        const overlay = document.createElement('div');
        overlay.id = 'pause-overlay';
        overlay.innerHTML = `
            <div class="pause-card">
                <button id="pause-close-btn" class="pause-close-btn" type="button" aria-label="Fermer la pause">
                    <i class="fas fa-times"></i>
                </button>
                <div class="pause-title">PAUSE</div>
                <p style="font-size:0.95rem; color:#FFE6A7; margin:0 0 14px;">Partie en pause</p>

                <div class="pause-quick-controls">
                    <div class="pause-control-row">
                        <span><i class="fas fa-volume-up"></i> Son</span>
                        <input type="range" id="pause-sound-volume" class="volume-slider" style="width: 130px;" min="0" max="100" value="${Math.round(soundVolume * 100)}">
                    </div>
                    <div class="pause-control-row">
                        <span><i class="fas fa-music"></i> Musique</span>
                        <input type="range" id="pause-music-volume" class="volume-slider" style="width: 130px;" min="0" max="100" value="${Math.round(musicVolume * 100)}">
                    </div>
                    <div class="pause-control-row">
                        <span><i class="fas fa-mobile-alt"></i> Vibreur</span>
                        <label class="switch" style="transform: scale(0.85); transform-origin: right center;">
                            <input type="checkbox" id="pause-vibration-toggle" ${isVibrationOn ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                    </div>
                </div>

                <div style="display:flex; flex-direction:column; gap:10px; align-items:center;">
                    <button id="resume-btn" class="modal-btn" style="background: linear-gradient(135deg, #00B074, #008156); color:white; font-size:1.15rem; font-weight:800; padding:12px 28px; border-radius:30px; border:2px solid rgba(255,255,255,0.7); box-shadow:0 6px 0 #00593B; margin:0; width:100%;">
                        <i class="fas fa-play"></i> Reprendre
                    </button>
                    <button id="pause-settings-btn" class="modal-btn" style="background: linear-gradient(135deg, #E67E22, #D35400); color:white; font-size:1rem; font-weight:800; padding:11px 20px; border-radius:24px; border:1px solid rgba(255,255,255,0.6); margin:0; width:100%; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 4px 12px rgba(211,84,0,0.35);">
                        <i class="fas fa-cog"></i> Tous les Paramètres
                    </button>
                    <button id="menu-btn-pause" class="modal-btn" style="background: rgba(255, 255, 255, 0.15); color:white; font-size:0.95rem; padding:10px 20px; border-radius:24px; border:1px solid rgba(255,255,255,0.4); margin:0; width:100%;">
                        <i class="fas fa-home"></i> Menu Principal
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Bind quick controls in pause modal
        const pauseSoundVol = document.getElementById('pause-sound-volume');
        if (pauseSoundVol) {
            pauseSoundVol.addEventListener('input', (e) => {
                soundVolume = parseInt(e.target.value, 10) / 100;
                localStorage.setItem(STORAGE_KEYS.soundVolume, String(soundVolume));
                const drawerSoundVol = document.getElementById('sound-volume');
                if (drawerSoundVol) drawerSoundVol.value = e.target.value;
            });
        }

        const pauseMusicVol = document.getElementById('pause-music-volume');
        if (pauseMusicVol) {
            pauseMusicVol.addEventListener('input', (e) => {
                musicVolume = parseInt(e.target.value, 10) / 100;
                localStorage.setItem(STORAGE_KEYS.musicVolume, String(musicVolume));
                ambientSynth.updateVolume();
                const drawerMusicVol = document.getElementById('music-volume');
                if (drawerMusicVol) drawerMusicVol.value = e.target.value;
            });
        }

        const pauseVibToggle = document.getElementById('pause-vibration-toggle');
        if (pauseVibToggle) {
            pauseVibToggle.addEventListener('change', () => {
                isVibrationOn = pauseVibToggle.checked;
                localStorage.setItem(STORAGE_KEYS.vibration, isVibrationOn ? 'on' : 'off');
                const drawerVibToggle = document.getElementById('vibration-toggle');
                if (drawerVibToggle) drawerVibToggle.checked = isVibrationOn;
                if (isVibrationOn) vibrate(40);
            });
        }

        // Close cross on pause modal: hides modal while leaving game paused
        const pauseCloseBtn = document.getElementById('pause-close-btn');
        if (pauseCloseBtn) {
            pauseCloseBtn.addEventListener('click', () => {
                const ov = document.getElementById('pause-overlay');
                if (ov) ov.remove();
                // Game remains paused: timer is stopped, pause button shows play icon
                isPaused = true;
                isProcessing = true;
                if (pauseBtn) {
                    pauseBtn.innerHTML = '<i class="fas fa-play"></i>';
                }
            });
        }

        // Direct Settings button in pause modal: opens drawer menu over pause overlay
        const pauseSettingsBtn = document.getElementById('pause-settings-btn');
        if (pauseSettingsBtn) {
            pauseSettingsBtn.addEventListener('click', () => {
                openDrawer();
            });
        }

        document.getElementById('resume-btn').addEventListener('click', togglePause);
        document.getElementById('menu-btn-pause').addEventListener('click', () => {
            if (confirm("Retourner au menu ? La partie sera sauvegardée.")) {
                 window.location.reload();
            }
        });
    } else {
        startTimer();
        isProcessing = false;
        if (pauseBtn) pauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
        
        const overlay = document.getElementById('pause-overlay');
        if (overlay) overlay.remove();
    }
}

function quitGame() {
    if (confirm("Veux-tu vraiment quitter la partie ?")) {
        window.location.reload();
    }
}

function startLevel(lvl, resume = false) {
    console.log(`[DEBUG] startLevel called with lvl=${lvl}, resume=${resume}`);
    try {
        cleanupTransientUI();
        hasSpawnedTimeBonusThisLevel = false;

        if (resume && loadGameState()) {
            console.log("[DEBUG] Resuming game state...");
            applyThemeForLevel(level);
            modalOverlay.classList.add('hidden');
            // Resume timer
            startTimer();
            return;
        }

        console.log("[DEBUG] Starting new level logic...");
        clearSavedGame();

        // Loop back to level 1 if max reached (or handle end game)
        if (!LEVELS || LEVELS.length === 0) {
            throw new Error("LEVELS array is empty or undefined!");
        }
        const levelConfig = LEVELS.find(l => l.id === lvl) || LEVELS[0]; 
        console.log("[DEBUG] Level config found:", levelConfig);
        
        level = levelConfig.id;
        applyThemeForLevel(level);
        localStorage.setItem(STORAGE_KEYS.currentLevel, String(level));
        score = 0;
        // Dynamic difficulty scaling
        // Base moves reduced slightly with progression
        const baseMoves = levelConfig.moves;
        const movesPenalty = Math.floor((level - 1) / 5); // -1 move every 5 levels
        moves = Math.max(10, baseMoves - movesPenalty);
        isProcessing = false; // Reset processing flag
        isPaused = false; // Reset pause flag
        
        // Timer Init
        clearInterval(timerInterval);
        timeRemaining = 90; // 90 seconds
        startTimer();
        // setAvatarMood('neutral'); // Removed

        // Init Goals
        if (!levelConfig.goals) {
            console.warn("[DEBUG] No goals defined for this level, using empty object");
            currentGoals = {};
        } else {
            // Scale goals +10% every 5 levels
            const scale = 1 + (Math.floor((level - 1) / 5) * 0.1);
            currentGoals = {};
            for (let k in levelConfig.goals) {
                const v = levelConfig.goals[k];
                currentGoals[k] = Math.max(5, Math.round(v * scale));
            }
        }
        goalProgress = {};
        for (let k in currentGoals) goalProgress[k] = 0;

        console.log("[DEBUG] Updating UI...");
        checkDailyReward();
        renderGoals(); // Initial Render
        
        // Timer d'Intervention du Chef Garbaman (Toutes les 15s)
        if (window.chefHelperInterval) clearInterval(window.chefHelperInterval);
        window.lastPlayerActionTime = Date.now();
        window.chefHelperInterval = setInterval(() => {
            if (isPaused || isProcessing || moves <= 0) return;
            const now = Date.now();
            if (now - (window.lastPlayerActionTime || now) >= 14000) {
                window.lastPlayerActionTime = now;
                spawnChefJokerHelper();
            }
        }, 2000);
        updateUI();
        if (modalOverlay) modalOverlay.classList.add('hidden');
        updateTileSize();
        
        // Create Grid
        console.log("[DEBUG] Creating grid...");
        // Increase obstacles with progression
        const baseObstacles = levelConfig.obstacles ? levelConfig.obstacles.count : 0;
        const extraObstacles = Math.floor(level / 4); // +1 every 4 levels
        const obstacleCount = baseObstacles + extraObstacles;
        createGrid(obstacleCount);
        resetHintTimer();
        
        saveGameState(); // Initial save
        console.log("[DEBUG] startLevel finished successfully");
    } catch (e) {
        console.error("FATAL ERROR in startLevel:", e);
        alert("Une erreur est survenue lors du démarrage du niveau: " + e.message);
    }
}

function startTimer() {
    clearInterval(timerInterval);
    updateTimerUI();
    timerInterval = setInterval(() => {
        if (isPaused) return;
        timeRemaining--;
        updateTimerUI();
        
        // Spawn Chef Time Bonus Avatar when time is running down (<= 45s left)
        if (timeRemaining <= 45 && !hasSpawnedTimeBonusThisLevel && moves > 0 && !isProcessing) {
            hasSpawnedTimeBonusThisLevel = true;
            spawnTimeBonusAvatar();
        }
        
        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            handleGameOver();
        }
    }, 1000);
}

function resetHintTimer() {
    clearTimeout(hintTimeout);
    clearHints();
    
    if (moves > 0 && !isPaused && !isProcessing) {
        hintTimeout = setTimeout(showHint, 10000);
    }

    if (moves > 0 && !isPaused && !isProcessing) {
        setTimeout(() => {
            if (!isPaused && !isProcessing) {
                setAvatarMood('bored');
            }
        }, 8000);
    }
}

function clearHints() {
    clearTimeout(hintTimeout);
    if (currentHint) {
        currentHint.forEach(el => {
            if (el && el.classList) {
                el.classList.remove('hint-source-tile', 'hint-target-tile', 'hint-dest-tile', 'hint-anim');
            }
            if (el && el.classList && (el.classList.contains('hand-hint') || el.classList.contains('hint-directional-arrow'))) {
                el.remove();
            }
        });
        currentHint = null;
    }
    // Remove any stray hints in DOM
    document.querySelectorAll('.hand-hint, .hint-directional-arrow').forEach(h => h.remove());
    document.querySelectorAll('.hint-source-tile, .hint-target-tile, .hint-dest-tile, .hint-anim').forEach(el => {
        el.classList.remove('hint-source-tile', 'hint-target-tile', 'hint-dest-tile', 'hint-anim');
    });
}
const clearHint = clearHints;

function isHoleTile(r, c) {
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
    if (currentLayout && currentLayout[r] && currentLayout[r][c] === 0) return true;
    const tile = grid[r] && grid[r][c];
    if (!tile) return true;
    if (tile.type && (tile.type.id === 'hole' || tile.type.id === 'crate')) return true;
    return false;
}

function calculateVoidScore(from, to) {
    let score = 0;
    const dr = to.r - from.r;
    const dc = to.c - from.c;

    // Check what is beyond 'to' in swipe direction:
    const beyondR = to.r + dr;
    const beyondC = to.c + dc;
    if (isHoleTile(beyondR, beyondC)) {
        // Swiping directly towards an internal hole! Strong penalty!
        score -= 16;
    }

    // Check what is behind 'from':
    const behindR = from.r - dr;
    const behindC = from.c - dc;
    if (isHoleTile(behindR, behindC)) {
        // Swiping AWAY from an internal hole! High reward!
        score += 12;
    }

    // Check adjacent holes around 'to':
    const neighbors = [
        { r: to.r - 1, c: to.c },
        { r: to.r + 1, c: to.c },
        { r: to.r, c: to.c - 1 },
        { r: to.r, c: to.c + 1 }
    ];
    let adjacentHoles = 0;
    neighbors.forEach(n => {
        if (!(n.r === from.r && n.c === from.c) && isHoleTile(n.r, n.c)) {
            adjacentHoles++;
        }
    });
    score -= (adjacentHoles * 4);

    return score;
}

async function showHint() {
    clearHints();
    if (moves <= 0 || isPaused || isProcessing) return;

    const candidateMoves = [];

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const t1 = grid[r][c];
            if (!t1 || isObstacleId(t1.type.id)) continue;

            const neighbors = [
                { r: r, c: c + 1 }, // Right
                { r: r + 1, c: c }  // Down
            ];

            for (const n of neighbors) {
                if (n.r >= GRID_SIZE || n.c >= GRID_SIZE) continue;
                const t2 = grid[n.r][n.c];
                if (!t2 || isObstacleId(t2.type.id)) continue;

                // CRITICAL: NEVER SWAP IDENTICAL TILES!
                if (t1.type.id === t2.type.id) continue;

                // Virtual swap
                const type1 = t1.type;
                const type2 = t2.type;
                t1.type = type2;
                t2.type = type1;

                const match1 = getRunPositionsAt(r, c);
                const match2 = getRunPositionsAt(n.r, n.c);

                // Revert swap immediately
                t1.type = type1;
                t2.type = type2;

                const hasMatch1 = match1.length >= 3;
                const hasMatch2 = match2.length >= 3;

                if (hasMatch1 || hasMatch2) {
                    let moveInfo;
                    if (hasMatch1 && hasMatch2) {
                        // Both directions match! Compare anti-void safety:
                        const scoreA = calculateVoidScore({ r: n.r, c: n.c }, { r: r, c: c });
                        const scoreB = calculateVoidScore({ r: r, c: c }, { r: n.r, c: n.c });
                        if (scoreA >= scoreB) {
                            moveInfo = {
                                from: { r: n.r, c: n.c },
                                to: { r: r, c: c },
                                matchedPositions: [...match1, ...match2],
                                matchedType: type2.id,
                                voidScore: scoreA
                            };
                        } else {
                            moveInfo = {
                                from: { r: r, c: c },
                                to: { r: n.r, c: n.c },
                                matchedPositions: [...match1, ...match2],
                                matchedType: type1.id,
                                voidScore: scoreB
                            };
                        }
                    } else if (hasMatch1) {
                        // t2 moved to (r, c)
                        moveInfo = {
                            from: { r: n.r, c: n.c },
                            to: { r: r, c: c },
                            matchedPositions: match1,
                            matchedType: type2.id,
                            voidScore: calculateVoidScore({ r: n.r, c: n.c }, { r: r, c: c })
                        };
                    } else {
                        // t1 moved to (n.r, n.c)
                        moveInfo = {
                            from: { r: r, c: c },
                            to: { r: n.r, c: n.c },
                            matchedPositions: match2,
                            matchedType: type1.id,
                            voidScore: calculateVoidScore({ r: r, c: c }, { r: n.r, c: n.c })
                        };
                    }

                    // Score candidate: prioritize current level goals AND anti-void safety!
                    const isGoal = currentGoals && currentGoals[moveInfo.matchedType] && 
                                   (goalProgress[moveInfo.matchedType] || 0) < currentGoals[moveInfo.matchedType];
                    moveInfo.priority = (isGoal ? 12 : 0) + (moveInfo.matchedPositions.length * 2) + (moveInfo.voidScore || 0);
                    candidateMoves.push(moveInfo);
                }
            }
        }
    }

    if (candidateMoves.length === 0) {
        handleNoMovesAvailable();
        return;
    }

    // Pick highest priority move (prioritizes level goals and moves away from holes!)
    candidateMoves.sort((a, b) => b.priority - a.priority);
    const bestMove = candidateMoves[0];

    applySmartHint(bestMove);
}

function checkSwapForMatch(r1, c1, r2, c2) {
    const t1 = grid[r1][c1];
    const t2 = grid[r2][c2];
    if (!t1 || !t2 || isObstacleId(t1.type.id) || isObstacleId(t2.type.id)) return false;
    
    // Any swap involving Color Bomb is ALWAYS a valid move!
    if (isColorBombTile(t1) || isColorBombTile(t2)) return true;
    
    // Any swap between two Special Tiles is ALWAYS a valid move!
    if (isSpecialTile(t1) && isSpecialTile(t2)) return true;
    
    if (t1.type.id === t2.type.id) return false;

    const type1 = t1.type;
    const type2 = t2.type;
    t1.type = type2;
    t2.type = type1;
    
    const hasMatch = checkMatchAt(r1, c1) || checkMatchAt(r2, c2);
    
    t1.type = type1;
    t2.type = type2;
    return hasMatch;
}

function checkMatchAt(r, c) {
    const tile = grid[r][c];
    if (!tile) return false;
    if (isObstacleId(tile.type.id)) return false;
    const typeId = tile.type.id;
    
    // Horiz
    let hCount = 1;
    let i = c - 1; while(i>=0 && grid[r][i] && !isObstacleId(grid[r][i].type.id) && grid[r][i].type.id === typeId) { hCount++; i--; }
    i = c + 1; while(i<GRID_SIZE && grid[r][i] && !isObstacleId(grid[r][i].type.id) && grid[r][i].type.id === typeId) { hCount++; i++; }
    if (hCount >= 3) return true;
    
    // Vert
    let vCount = 1;
    i = r - 1; while(i>=0 && grid[i][c] && !isObstacleId(grid[i][c].type.id) && grid[i][c].type.id === typeId) { vCount++; i--; }
    i = r + 1; while(i<GRID_SIZE && grid[i][c] && !isObstacleId(grid[i][c].type.id) && grid[i][c].type.id === typeId) { vCount++; i++; }
    if (vCount >= 3) return true;
    
    return false;
}

function getRunPositionsAt(r, c) {
    const tile = grid[r][c];
    if (!tile || isObstacleId(tile.type.id)) return [];
    const typeId = tile.type.id;
    let positions = [];
    // Horizontal
    let h = [{ r, c }];
    let i = c - 1;
    while (i >= 0 && grid[r][i] && !isObstacleId(grid[r][i].type.id) && grid[r][i].type.id === typeId) { h.push({ r, c: i }); i--; }
    i = c + 1;
    while (i < GRID_SIZE && grid[r][i] && !isObstacleId(grid[r][i].type.id) && grid[r][i].type.id === typeId) { h.push({ r, c: i }); i++; }
    if (h.length >= 3) positions = positions.concat(h);
    // Vertical
    let v = [{ r, c }];
    i = r - 1;
    while (i >= 0 && grid[i][c] && !isObstacleId(grid[i][c].type.id) && grid[i][c].type.id === typeId) { v.push({ r: i, c }); i--; }
    i = r + 1;
    while (i < GRID_SIZE && grid[i][c] && !isObstacleId(grid[i][c].type.id) && grid[i][c].type.id === typeId) { v.push({ r: i, c }); i++; }
    if (v.length >= 3) positions = positions.concat(v);
    // Dedup
    const seen = new Set();
    return positions.filter(p => {
        const key = `${p.r},${p.c}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function applySmartHint(move) {
    const fromTile = grid[move.from.r][move.from.c];
    const toTile = grid[move.to.r][move.to.c];
    if (!fromTile || !toTile || !fromTile.el || !toTile.el) return;

    const fromEl = fromTile.el;
    const toEl = toTile.el;

    // Highlight source mover tile with glowing cyan border
    fromEl.classList.add('hint-source-tile');

    // Highlight destination tile with distinct green target box
    toEl.classList.add('hint-dest-tile');

    // Highlight target matching tiles with glowing gold
    const highlightedElements = [fromEl, toEl];
    move.matchedPositions.forEach(p => {
        const t = grid[p.r] && grid[p.r][p.c];
        if (t && t.el) {
            t.el.classList.add('hint-target-tile');
            highlightedElements.push(t.el);
        }
    });

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();

    const dx = toRect.left - fromRect.left;
    const dy = toRect.top - fromRect.top;

    // Calculate rotation angle so the 3D hand finger points in the direction of swipe:
    // Base glove points UP (0deg).
    let angle = 0;
    if (Math.abs(dx) > Math.abs(dy)) {
        angle = dx > 0 ? 90 : 270;
    } else {
        angle = dy > 0 ? 180 : 0;
    }

    const fromCenterX = fromRect.left + fromRect.width / 2;
    const fromCenterY = fromRect.top + fromRect.height / 2;

    // Create 3D cartoon pointer hand
    const hand = document.createElement('div');
    hand.className = 'hand-hint';

    // Position finger (at 15, 15) exactly at center of fromEl
    hand.style.left = (fromCenterX - 15) + 'px';
    hand.style.top = (fromCenterY - 15) + 'px';
    hand.style.setProperty('--dx', `${dx}px`);
    hand.style.setProperty('--dy', `${dy}px`);
    hand.style.setProperty('--hand-rot', `${angle}deg`);

    // SVG of crisp 3D glove with glowing cyan ripple
    hand.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="54" height="54">
            <defs>
                <radialGradient id="touchGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stop-color="#00E5FF" stop-opacity="0.95"/>
                    <stop offset="50%" stop-color="#00E5FF" stop-opacity="0.4"/>
                    <stop offset="100%" stop-color="#00E5FF" stop-opacity="0"/>
                </radialGradient>
                <linearGradient id="gloveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#FFFFFF"/>
                    <stop offset="55%" stop-color="#EDF2F7"/>
                    <stop offset="100%" stop-color="#CBD5E1"/>
                </linearGradient>
                <linearGradient id="cuffGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#FF9E00"/>
                    <stop offset="100%" stop-color="#D97706"/>
                </linearGradient>
            </defs>
            <!-- Glowing touch point at fingertip -->
            <circle cx="15" cy="15" r="14" fill="url(#touchGlow)"/>
            <circle cx="15" cy="15" r="4.5" fill="#00E5FF"/>
            
            <!-- Cartoon 3D Hand Pointer -->
            <g transform="translate(6, 6)">
                <!-- Drop shadow -->
                <path d="M 9 9 C 9 4, 15 4, 15 9 L 15 24 L 21 22 C 25 21, 28 24, 27 28 L 24 38 C 23 43, 17 47, 11 46 C 5 45, 3 40, 3 35 L 3 24 C 3 20, 9 20, 9 24 Z" fill="rgba(0,0,0,0.28)" transform="translate(2, 3)"/>
                <!-- White Glove Body -->
                <path d="M 9 7 C 9 3, 15 3, 15 7 L 15 23 C 17 21, 20 21, 22 23 C 25 25, 25 28, 23 30 L 21 32 C 23 33, 24 36, 22 38 C 20 41, 15 44, 11 44 C 6 44, 3 40, 3 35 L 3 25 C 3 21, 8 21, 9 24 Z" fill="url(#gloveGrad)" stroke="#1E293B" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>
                <!-- Finger fold lines -->
                <path d="M 13 25 C 15 24, 18 25, 19 27" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" fill="none"/>
                <path d="M 12 32 C 14 31, 17 32, 18 34" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" fill="none"/>
                <!-- Orange Ivorian Cuff -->
                <rect x="3" y="40" width="14" height="6" rx="3" fill="url(#cuffGrad)" stroke="#78350F" stroke-width="1.6"/>
            </g>
        </svg>
    `;

    // Create luminous directional chevron arrow
    const arrow = document.createElement('div');
    arrow.className = 'hint-directional-arrow';
    arrow.style.left = (fromCenterX - 18) + 'px';
    arrow.style.top = (fromCenterY - 18) + 'px';
    arrow.style.setProperty('--dx', `${dx}px`);
    arrow.style.setProperty('--dy', `${dy}px`);
    arrow.style.setProperty('--arrow-rot', `${angle}deg`);
    arrow.innerHTML = `
        <svg viewBox="0 0 36 36" width="36" height="36">
            <defs>
                <filter id="arrowNeonGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#00FFFF"/>
                </filter>
            </defs>
            <path d="M 18 6 L 28 18 L 22 18 L 22 30 L 14 30 L 14 18 L 8 18 Z" 
                  fill="#00FFFF" stroke="#FFFFFF" stroke-width="2" filter="url(#arrowNeonGlow)"/>
        </svg>
    `;

    document.body.appendChild(arrow);
    document.body.appendChild(hand);

    highlightedElements.push(arrow, hand);
    currentHint = highlightedElements;
}

function updateTimerUI() {
    if (!timerEl) return;
    const m = Math.floor(timeRemaining / 60);
    const s = timeRemaining % 60;
    timerEl.innerText = `${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`;
    
    if (timeRemaining < 10) {
        timerEl.parentElement.style.backgroundColor = 'red';
        timerEl.parentElement.style.animation = 'pulse 0.5s infinite';
    } else {
        timerEl.parentElement.style.backgroundColor = 'black';
        timerEl.parentElement.style.animation = '';
    }
}

function handleGameOver() {
    isProcessing = true;
    cleanupTransientUI();
    setTimeout(() => {
        vibrate([200, 120, 200, 120, 260]);
        document.getElementById('modal-title').innerText = "YAKO !";
        document.getElementById('modal-message').innerHTML = `<b>${escapeHtml(playerName)}</b>, le temps est écoulé !<br>Score : ${score}`;
        document.getElementById('modal-btn').innerText = "Recommencer";
        
        modalBtn.onclick = () => {
            startLevel(level);
        };
        modalOverlay.classList.remove('hidden');
        modalOverlay.classList.add('active');
    }, 500);
}

function hasAnyPossibleMove() {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const t1 = grid[r] && grid[r][c];
            if (!t1 || isObstacleId(t1.type.id)) continue;
            // Any special or joker tile is an actionable move
            if (isSpecialTile(t1) || isColorBombTile(t1) || t1.type.id === "joker" || t1.type.special === "joker") {
                return true;
            }
            if (c + 1 < GRID_SIZE && checkSwapForMatch(r, c, r, c + 1)) return true;
            if (r + 1 < GRID_SIZE && checkSwapForMatch(r, c, r + 1, c)) return true;
        }
    }
    return false;
}

function handleNoMovesAvailable() {
    if (isProcessing || isPaused) return;
    vibrate([100, 80, 100]);
    
    // Remove any previous nomove messages
    document.querySelectorAll('#nomove-msg, .nomove-toast').forEach(el => el.remove());

    const msg = document.createElement('div');
    msg.id = 'nomove-msg';
    msg.className = 'nomove-toast';
    msg.innerHTML = `${escapeHtml(playerName)}, y'a plus de coups là...<br><strong>On mélange le Dabali ! 🍲</strong>`;
    msg.style.position = 'fixed';
    msg.style.top = '50%';
    msg.style.left = '50%';
    msg.style.transform = 'translate(-50%, -50%)';
    msg.style.background = 'linear-gradient(135deg, rgba(25, 20, 15, 0.95), rgba(10, 10, 10, 0.95))';
    msg.style.border = '2px solid #FFD700';
    msg.style.boxShadow = '0 10px 30px rgba(0,0,0,0.8), 0 0 25px rgba(255, 140, 0, 0.6)';
    msg.style.color = '#FFFFFF';
    msg.style.padding = '15px 22px';
    msg.style.borderRadius = '18px';
    msg.style.zIndex = '9999';
    msg.style.textAlign = 'center';
    msg.style.pointerEvents = 'none';
    msg.style.fontFamily = "'Arial Black', Impact, sans-serif";
    msg.style.fontSize = '1.15rem';
    document.body.appendChild(msg);

    try {
        reshuffleGrid();
    } catch (e) {
        console.error("Erreur reshuffleGrid:", e);
    } finally {
        setTimeout(() => {
            if (msg.parentNode) msg.remove();
            resetHintTimer();
        }, 1600);
    }
}

function reshuffleGrid() {
    const validCells = [];
    const types = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const tile = grid[r] && grid[r][c];
            if (tile && tile.type && !isObstacleId(tile.type.id)) {
                validCells.push(tile);
                types.push(tile.type);
            }
        }
    }
    if (validCells.length < 3) return;

    let attempts = 0;
    let foundValid = false;
    while (attempts < 10 && !foundValid) {
        attempts++;
        for (let i = types.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = types[i];
            types[i] = types[j];
            types[j] = tmp;
        }
        for (let i = 0; i < validCells.length; i++) {
            validCells[i].type = types[i];
        }
        foundValid = hasAnyPossibleMove();
    }

    // Guarantee at least one valid match if random shuffle was deadlocked
    if (!foundValid && validCells.length >= 3) {
        const goalTypes = Object.keys(currentGoals).filter(k => (goalProgress[k] || 0) < currentGoals[k]);
        const chosenId = goalTypes.length > 0 ? goalTypes[0] : 'attieke';
        const baseItem = INGREDIENTS.find(it => it.id === chosenId) || INGREDIENTS[0];
        
        let paired = false;
        for (let i = 0; i < validCells.length && !paired; i++) {
            const t1 = validCells[i];
            for (let j = i + 1; j < validCells.length && !paired; j++) {
                const t2 = validCells[j];
                const dist = Math.abs(t1.r - t2.r) + Math.abs(t1.c - t2.c);
                if (dist === 1) {
                    t1.type = { ...baseItem };
                    t2.type = { ...baseItem };
                    paired = true;
                }
            }
        }
    }

    for (let i = 0; i < validCells.length; i++) {
        const tile = validCells[i];
        if (tile && tile.el) {
            renderTileContent(tile.el, tile.type);
            tile.el.classList.add("pop-anim");
        }
    }
}

function createGrid(obstacleCount = 0) {
    console.log(`[DEBUG] createGrid: obstacleCount=${obstacleCount}, GRID_SIZE=${GRID_SIZE}`);
    if (!gridEl) {
        console.error("createGrid: gridEl not found!");
        return;
    }
    gridEl.innerHTML = '';
    grid = [];
    
    const levelConfig = LEVELS.find(l => l.id === level) || LEVELS[0];
    const layout = levelConfig.layout;

    try {
        for (let r = 0; r < GRID_SIZE; r++) {
            let row = [];
            for (let c = 0; c < GRID_SIZE; c++) {
                // If layout exists and is 0, skip creating a tile
                if (layout && layout[r] && layout[r][c] === 0) {
                    const emptyEl = document.createElement('div');
                    emptyEl.className = 'tile-empty';
                    gridEl.appendChild(emptyEl);
                    // Create a Hole object instead of null to prevent gravity from filling it
                    row.push({
                        r: r,
                        c: c,
                        type: { id: 'hole', name: 'Hole' },
                        el: emptyEl
                    });
                    continue;
                }

                let tile;
                let attempts = 0;
                do {
                    tile = createRandomTile(r, c);
                    attempts++;
                    if (attempts > 100) {
                         console.error("Infinite loop in createGrid generation");
                         break;
                    }
                } while (causesMatch(r, c, tile.type.id, row) && attempts < 50);
                
                row.push(tile);
                gridEl.appendChild(tile.el);
                
                // Initial positioning (will be refined by updateTileSize)
                // We rely on updateTileSize being called after or during init
            }
            grid.push(row);
        }
        console.log(`[DEBUG] Grid created successfully. Tiles in gridEl: ${gridEl.childElementCount}`);
        
        // Force update size and positions
        setTimeout(() => updateTileSize(), 50);

        // 2. Place Obstacles
        let placed = 0;
        let safety = 0;
        while (placed < obstacleCount && safety < 1000) {
            safety++;
            const r = Math.floor(Math.random() * GRID_SIZE);
            const c = Math.floor(Math.random() * GRID_SIZE);
            // Check if grid[r][c] is not null and not already an obstacle
            if (grid[r] && grid[r][c] && !isObstacleId(grid[r][c].type.id)) {
                const obstacleType = getRandomObstacleForLevel(level);
                grid[r][c].type = obstacleType;
                renderTileContent(grid[r][c].el, grid[r][c].type);
                grid[r][c].el.classList.add('obstacle');
                placed++;
            }
        }
    } catch (e) {
        console.error("FATAL ERROR in createGrid:", e);
        throw e;
    }
}

function renderGoals() {
    footerGoalsEl.innerHTML = '';
    const goalCount = Object.keys(currentGoals).length;
    if (goalCount >= 4) {
        footerGoalsEl.classList.add('compact-goals');
    } else {
        footerGoalsEl.classList.remove('compact-goals');
    }

    for (let id in currentGoals) {
        const target = currentGoals[id];
        const current = goalProgress[id];
        const ing = INGREDIENTS.find(i => i.id === id);
        
        if (!ing) continue;

        const el = document.createElement('div');
        el.className = 'goal-item';
        el.id = `goal-item-${id}`;
        
        const iconSize = goalCount >= 4 ? 24 : 30;
        const iconContent = ing.image ? 
            `<img src="${ing.image}" style="width:${iconSize}px; height:${iconSize}px; object-fit:contain;">` : 
            ing.emoji;

        el.innerHTML = `
            <div class="goal-icon">${iconContent}</div>
            <div class="goal-count" id="goal-count-${id}">${current}/${target}</div>
        `;
        
        // Initial check
        if (current >= target) {
            el.classList.add('completed');
        }
        
        footerGoalsEl.appendChild(el);
    }
}

function createRandomTile(r, c) {
    // Équilibrage intelligent : Tous les ingrédients demandés en objectifs DOIVENT être dans le pool !
    let availablePool = [];
    const currentLvlCfg = (typeof LEVELS !== 'undefined' && typeof level !== 'undefined') ? 
        (LEVELS.find(l => l.id === level) || LEVELS[0]) : null;

    if (currentLvlCfg && currentLvlCfg.goals) {
        const goalIds = Object.keys(currentLvlCfg.goals);
        const goalIngs = INGREDIENTS.filter(i => goalIds.includes(i.id));
        const nonGoalIngs = INGREDIENTS.filter(i => !goalIds.includes(i.id));
        
        // Taille de pool adaptée : Niv 1 = 5, Niv 2-3 = 6, supérieurs = 6-7
        const targetPoolSize = (typeof level !== 'undefined' && level === 1) ? 5 : 
                               (typeof level !== 'undefined' && level <= 3) ? 6 : 7;
        availablePool = [...goalIngs];
        for (const ing of nonGoalIngs) {
            if (availablePool.length >= targetPoolSize) break;
            availablePool.push(ing);
        }
    } else {
        const poolSize = (typeof level !== 'undefined' && level === 1) ? 5 :
                         (typeof level !== 'undefined' && level <= 3) ? 6 : INGREDIENTS.length;
        availablePool = INGREDIENTS.slice(0, poolSize);
    }

    const type = availablePool[Math.floor(Math.random() * availablePool.length)];
    const el = document.createElement('div');
    el.className = 'tile';
    renderTileContent(el, type);
    el.dataset.r = r;
    el.dataset.c = c;

    // Initial absolute positioning to avoid stacking at (0,0)
    const tileSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tile-size')) || 40;
    const gap = 4;
    el.style.position = 'absolute';
    el.style.width = `${tileSize}px`;
    el.style.height = `${tileSize}px`;
    el.style.top = `${r * (tileSize + gap)}px`;
    el.style.left = `${c * (tileSize + gap)}px`;
    el.style.opacity = '1';
    
    // Events
    el.addEventListener('mousedown', handleInputStart);
    el.addEventListener('touchstart', handleInputStart, {passive: false});
    
    return { r, c, type, el };
}

function renderTileContent(el, type) {
    if (!el || !type) return;
    el.classList.remove(
        "tile-attieke",
        "tile-poisson",
        "tile-piment",
        "tile-oignon",
        "tile-tomate",
        "tile-alloco",
        "tile-sachet",
        "tile-joker",
        "tile-maggi",
        "tile-huile",
        "tile-color-bomb",
        "tile-special-striped-h",
        "tile-special-striped-v",
        "tile-special-wrapped"
    );
    if (type.id === "color_bomb" || type.special === "color_bomb") {
        el.classList.add("tile-color-bomb");
        el.innerHTML = `<span style="font-size:1.55rem; pointer-events:none; filter:drop-shadow(0 0 5px gold);">🌟</span>`;
        el.style.fontSize = "";
        return;
    }
    if (type.id === "joker" || type.special === "joker") {
        el.classList.add("tile-joker");
        el.innerHTML = `<span style="font-size:1.6rem; pointer-events:none; filter:drop-shadow(0 0 6px #00FFFF);">⚡🌟</span>`;
        el.style.fontSize = "";
        return;
    }
    if (type.image) {
        el.innerHTML = `<img src="${type.image}" alt="${type.name}" style="width:80%; height:80%; object-fit:contain; pointer-events:none;">`;
        el.style.fontSize = "";
    } else {
        el.innerText = type.emoji || "";
        el.innerHTML = type.emoji || "";
        el.style.fontSize = "";
    }
    if (type.id) {
        el.classList.add(`tile-${type.id}`);
    }
    if (type.special === "striped_h") {
        el.classList.add("tile-special-striped-h");
    } else if (type.special === "striped_v") {
        el.classList.add("tile-special-striped-v");
    } else if (type.special === "wrapped") {
        el.classList.add("tile-special-wrapped");
    }
}


// CELESTIAL STRIKES & FLYING BRAISED FISH
async function triggerCelestialStrike(sourceTile, meteorCount = 4) {
    if (!gridEl) return;
    
    const orb = document.createElement("div");
    orb.className = "celestial-orb-ascend";
    let startX = window.innerWidth / 2;
    let startY = window.innerHeight / 2;
    if (sourceTile && sourceTile.el) {
        const rect = sourceTile.el.getBoundingClientRect();
        startX = rect.left + rect.width / 2;
        startY = rect.top + rect.height / 2;
    }
    orb.style.left = `${startX}px`;
    orb.style.top = `${startY}px`;
    document.body.appendChild(orb);
    setTimeout(() => orb.remove(), 550);
    
    soundManager.playLaserShoot();
    
    await new Promise(r => setTimeout(r, 260));
    const flash = document.createElement("div");
    flash.className = "sky-thunder-flash";
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 450);
    soundManager.playThunderImpact();
    
    const candidates = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const t = grid[r][c];
            if (t && t.type.id !== "hole") candidates.push(t);
        }
    }
    if (candidates.length === 0) return;
    
    candidates.sort((a, b) => {
        const aObs = isObstacleId(a.type.id) ? 2 : 0;
        const bObs = isObstacleId(b.type.id) ? 2 : 0;
        const aGoal = (currentGoals[a.type.id] && goalProgress[a.type.id] < currentGoals[a.type.id]) ? 1 : 0;
        const bGoal = (currentGoals[b.type.id] && goalProgress[b.type.id] < currentGoals[b.type.id]) ? 1 : 0;
        return (bObs + bGoal) - (aObs + aGoal) + (Math.random() - 0.5);
    });
    
    const targets = candidates.slice(0, Math.min(meteorCount, candidates.length));
    
    targets.forEach((target, idx) => {
        setTimeout(() => {
            if (!target || !target.el) return;
            const rect = target.el.getBoundingClientRect();
            const tx = rect.left + rect.width / 2;
            const ty = rect.top + rect.height / 2;
            
            const meteor = document.createElement("div");
            meteor.className = "celestial-meteor-fall";
            meteor.style.left = `${tx - 4}px`;
            meteor.style.top = "0px";
            meteor.style.height = `${ty}px`;
            document.body.appendChild(meteor);
            setTimeout(() => meteor.remove(), 380);
            
            setTimeout(() => {
                const imp = document.createElement("div");
                imp.className = "celestial-impact-flash";
                imp.style.left = `${tx}px`;
                imp.style.top = `${ty}px`;
                document.body.appendChild(imp);
                setTimeout(() => imp.remove(), 400);
                
                showFloatingScore(tx, ty - 20, "+800 FRAPPE CÉLESTE ! ⚡", "#00FFFF");
                soundManager.playThunderImpact();
                triggerShake("heavy");
            }, 120);
        }, idx * 110);
    });
    
    await new Promise(r => setTimeout(r, targets.length * 110 + 260));
    score += targets.length * 200;
    await processMatches(targets);
}

async function spawnFlyingFish(sourceTile, fishCount = 3) {
    if (!gridEl) return;
    
    let originX = window.innerWidth / 2;
    let originY = window.innerHeight / 2;
    if (sourceTile && sourceTile.el) {
        const rct = sourceTile.el.getBoundingClientRect();
        originX = rct.left + rct.width / 2;
        originY = rct.top + rct.height / 2;
    }
    
    const pool = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const t = grid[r][c];
            if (t && t.type.id !== "hole" && t !== sourceTile) pool.push(t);
        }
    }
    if (pool.length === 0) return;
    
    pool.sort((a, b) => {
        const aGoal = (currentGoals[a.type.id] && goalProgress[a.type.id] < currentGoals[a.type.id]) ? 3 : 0;
        const bGoal = (currentGoals[b.type.id] && goalProgress[b.type.id] < currentGoals[b.type.id]) ? 3 : 0;
        const aObs = isObstacleId(a.type.id) ? 2 : 0;
        const bObs = isObstacleId(b.type.id) ? 2 : 0;
        return (bGoal + bObs) - (aGoal + aObs) + (Math.random() - 0.5);
    });
    
    const targets = pool.slice(0, Math.min(fishCount, pool.length));
    soundManager.playFishSizzle();
    
    targets.forEach((target, i) => {
        const fishEl = document.createElement("div");
        fishEl.className = "flying-braised-fish";
        fishEl.innerHTML = '<span style="display:inline-block; transform: scaleX(-1);">🐟</span>';
        fishEl.style.left = `${originX - 22}px`;
        fishEl.style.top = `${originY - 22}px`;
        document.body.appendChild(fishEl);
        
        const spreadX = (i - 1) * 70;
        const peakY = originY - 140 - Math.random() * 40;
        
        fishEl.style.transform = `translate(${spreadX}px, ${peakY - originY}px) scale(1.3) rotate(${spreadX > 0 ? 30 : -30}deg)`;
        
        setTimeout(() => {
            if (!target || !target.el) {
                fishEl.remove();
                return;
            }
            const tgtRect = target.el.getBoundingClientRect();
            const tx = tgtRect.left + tgtRect.width / 2;
            const ty = tgtRect.top + tgtRect.height / 2;
            const dx = tx - originX;
            const dy = ty - originY;
            
            fishEl.style.transform = `translate(${dx}px, ${dy}px) scale(0.9) rotate(90deg)`;
            
            setTimeout(() => {
                fishEl.remove();
                const imp = document.createElement("div");
                imp.className = "bomb-center-flash";
                imp.style.background = "radial-gradient(circle, #FFFFFF 0%, #FFD700 45%, #FF8C00 70%, transparent 100%)";
                imp.style.left = `${tx}px`;
                imp.style.top = `${ty}px`;
                document.body.appendChild(imp);
                setTimeout(() => imp.remove(), 350);
                
                showFloatingScore(tx, ty - 20, "+300 POISSON BRAISÉ ! 🐟⚡", "#FFD700");
                soundManager.playFishSizzle();
                triggerShake("medium");
            }, 420);
        }, 280);
    });
    
    await new Promise(r => setTimeout(r, 750));
    score += targets.length * 150;
    await processMatches(targets);
}
// INPUT HANDLING (Swipe & Click)
let touchStartX = 0;
let touchStartY = 0;
let activeTile = null;
let longPressTimer = null;
let longPressTarget = null;
let isLongPressActive = false;

function handleInputStart(e) {
    window.lastPlayerActionTime = Date.now();
    if (isProcessing || moves <= 0 || isPaused) return; 
    
    // Improved target detection
    let target = e.target;
    // Walk up the DOM tree until we find a .tile or hit the grid
    while (target && target.classList && !target.classList.contains('tile') && target !== gridEl) {
        target = target.parentElement;
    }
    
    if (!target || !target.classList || !target.classList.contains('tile')) return;

    const tile = getTileFromEl(target);
    if (!tile) {
        console.warn("Input detected on invalid tile element", target);
        return;
    }
    
    // --- LONG PRESS LOGIC START ---
    // isLongPressActive = false;
    // longPressTarget = tile;
    
    // Start timer for 1s (1000ms) long press
    /*
    longPressTimer = setTimeout(() => {
        isLongPressActive = true;
        // Visual feedback for Long Press Selection
        document.querySelectorAll('.tile').forEach(t => t.classList.remove('selected-booster-target'));
        tile.el.classList.add('selected-booster-target');
        
        vibrate([50, 50, 50]); // Distinct vibration
        soundManager.playClick();
        showToast("Case sélectionnée ! Choisis maintenant un Booster (Marteau ou Main)");
        
        // If we already have an active booster (e.g. Hand), we might want to apply it immediately?
        // But user said: "maintienne l'élément... ensuite sélectionne le marteau ou la main"
        // So we just mark it as selected for now.
    }, 800); // 800ms is usually enough for "long press" feel
    */
    // --- LONG PRESS LOGIC END ---

    // Booster Handling (Legacy direct click logic removed/adapted below)
    // If we click a tile while a booster is active AND we didn't just do a long press...
    // But now the flow is reversed: Select Tile -> Click Booster.
    // However, we should support both if possible, or strictly follow new rule.
    // Let's support the new rule: Long Press Tile -> then Click Booster.
    
    if (activeBooster) {
        if (handleBoosterInput(tile)) {
            e.preventDefault();
            e.stopPropagation();
            // clearTimeout(longPressTimer); // Cancel long press if it was a quick click for action
            return;
        }
    }

    resetHintTimer(); 
    
    if (e.type === 'touchstart') {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        activeTile = tile;
    } else if (e.type === 'mousedown') {
        // Mouse logic similar to touch for swipe
        touchStartX = e.clientX;
        touchStartY = e.clientY;
        activeTile = tile;
    }
}

function handleInputEnd(e) {
    if (!activeTile || isProcessing || isPaused) return;
    
    let clientX, clientY;
    if (e.type === 'touchend') {
        // Use changedTouches for touchend
        if (e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        } else {
            return;
        }
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }
    
    const dx = clientX - touchStartX;
    const dy = clientY - touchStartY;
    
    // Threshold for swipe
    if (Math.abs(dx) > 30 || Math.abs(dy) > 30) {
        // Directional booster: lightning
        if (activeBooster === 'lightning') {
            if (Math.abs(dx) > Math.abs(dy)) {
                lineClearRow(activeTile.r);
            } else {
                lineClearCol(activeTile.c);
            }
            useBooster('lightning');
            activeBooster = null;
            updateBoostersUI();
            activeTile = null;
            return;
        }

        let targetR = activeTile.r;
        let targetC = activeTile.c;
        
        if (Math.abs(dx) > Math.abs(dy)) {
            targetC += (dx > 0 ? 1 : -1);
        } else {
            targetR += (dy > 0 ? 1 : -1);
        }
        
        // Ensure within bounds
        if (targetR >= 0 && targetR < GRID_SIZE && targetC >= 0 && targetC < GRID_SIZE) {
            const targetTile = grid[targetR][targetC];
            if (targetTile) {
                attemptSwap(activeTile, targetTile);
            }
        }
        activeTile = null;
    } else {
         // Tap (Click)

         // If a booster is active, apply it on tap and exit
         if (activeBooster) {
             // bomb applies on tap; lightning requires swipe message
             if (activeBooster === 'bomb') {
                 handleBoosterInput(activeTile);
             } else if (activeBooster === 'lightning') {
                 showToast('⚡ Swipe: horizontal=ligne, vertical=colonne');
             }
             activeTile = null;
             return;
         }

         // Check if it was a real tap (short duration, small movement)
         // For now, we assume if it's not a swipe, it's a tap.
         
         // Standard Selection for Swap
         if (selectedTile) {
             if (selectedTile === activeTile) {
                 // Deselect
                 selectedTile.el.classList.remove('selected');
                 selectedTile = null;
             } else {
                 // Check if adjacent for swap
                 if (Math.abs(selectedTile.r - activeTile.r) + Math.abs(selectedTile.c - activeTile.c) === 1) {
                     attemptSwap(selectedTile, activeTile);
                     selectedTile.el.classList.remove('selected');
                     selectedTile = null;
                 } else {
                     // Select new tile
                     selectedTile.el.classList.remove('selected');
                     selectedTile = activeTile;
                     activeTile.el.classList.add('selected');
                     soundManager.playClick();
                 }
             }
         } else {
             // First selection
             selectedTile = activeTile;
             activeTile.el.classList.add('selected');
             soundManager.playClick();
         }
         activeTile = null;
    }
}

// Attach listeners properly
if (!window.inputHandlersAdded) {
    // Touch
    document.addEventListener('touchend', handleInputEnd, {passive: false});
    // Mouse
    document.addEventListener('mouseup', handleInputEnd);
    window.inputHandlersAdded = true;
}

function getTileFromEl(el) {
    const r = parseInt(el.dataset.r);
    const c = parseInt(el.dataset.c);
    if (grid[r] && grid[r][c]) return grid[r][c];
    return null;
}

async function checkAndExecuteSuperCombo(tile1, tile2) {
    const isT1Special = isSpecialTile(tile1);
    const isT2Special = isSpecialTile(tile2);
    const isT1ColorBomb = isColorBombTile(tile1);
    const isT2ColorBomb = isColorBombTile(tile2);
    const isT1Joker = tile1.type.id === "joker" || tile1.type.special === "joker";
    const isT2Joker = tile2.type.id === "joker" || tile2.type.special === "joker";
    
    // 0. JOKER ÉCLAIR UNIVERSEL (Foudroie toutes les pièces du type swipé !)
    if (isT1Joker || isT2Joker) {
        const jokerTile = isT1Joker ? tile1 : tile2;
        const targetTile = jokerTile === tile1 ? tile2 : tile1;
        await swapTilesVisual(tile1, tile2);
        
        const targetId = targetTile.type.id;
        const targets = [];
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const t = grid[r][c];
                if (t && t.type.id === targetId && t !== jokerTile) targets.push(t);
            }
        }
        
        soundManager.playLightningZap();
        const jRect = jokerTile.el.getBoundingClientRect();
        const jX = jRect.left + jRect.width / 2;
        const jY = jRect.top + jRect.height / 2;
        
        const targetPoints = targets.map(t => {
            const rct = t.el.getBoundingClientRect();
            return { x: rct.left + rct.width / 2, y: rct.top + rct.height / 2 };
        });
        showLightningArcs(jX, jY, targetPoints);
        
        await new Promise(r => setTimeout(r, 260));
        triggerShake("heavy");
        soundManager.playThunderImpact();
        
        const toDestroy = new Set([jokerTile, ...targets]);
        const bonus = targets.length * 100 + 1500;
        score += bonus;
        showFloatingScore(jX, jY - 30, `+${bonus} JOKER ÉCLAIR ! ⚡💥`, "#00FFFF");
        await new Promise(r => setTimeout(r, 220));
        await processMatches(Array.from(toDestroy));
        return true;
    }
    
    if (!isT1Special && !isT2Special) return false;
    
    // 1. Double Color Bomb (Grand Menage d'Abidjan)
    if (isT1ColorBomb && isT2ColorBomb) {
        await swapTilesVisual(tile1, tile2);
        swapTilesData(tile1, tile2);
        triggerShake("mega");
        soundManager.playColorBombMega();
        const rect = tile2.el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        showFloatingScore(cx, cy, "+10000 GRAND MÉNAGE D'ABIDJAN ! 👑", "#FFD700");
        
        const allTiles = [];
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const t = grid[r][c];
                if (t && !isObstacleId(t.type.id)) allTiles.push(t);
            }
        }
        score += 10000;
        await processMatches(allTiles);
        return true;
    }
    
    // 2. Color Bomb + Special or Normal Ingredient
    if (isT1ColorBomb || isT2ColorBomb) {
        const colorBomb = isT1ColorBomb ? tile1 : tile2;
        const other = colorBomb === tile1 ? tile2 : tile1;
        await swapTilesVisual(tile1, tile2);
        
        const cbRect = colorBomb.el.getBoundingClientRect();
        const cbX = cbRect.left + cbRect.width / 2;
        const cbY = cbRect.top + cbRect.height / 2;
        
        // 2A. Color Bomb + Striped (THE VIDEO 2 SIGNATURE COMBO!)
        if (isStripedTile(other)) {
            const targetId = other.type.id;
            const targets = [];
            for (let r = 0; r < GRID_SIZE; r++) {
                for (let c = 0; c < GRID_SIZE; c++) {
                    const t = grid[r][c];
                    if (t && t.type.id === targetId && t !== colorBomb) targets.push(t);
                }
            }
            
            soundManager.playLightningZap();
            const targetPoints = targets.map(t => {
                const rct = t.el.getBoundingClientRect();
                return { x: rct.left + rct.width / 2, y: rct.top + rct.height / 2 };
            });
            showLightningArcs(cbX, cbY, targetPoints);
            
            // Wait 250ms for lightning impact, then transform all targets into striped candies!
            await new Promise(r => setTimeout(r, 250));
            targets.forEach(t => {
                t.type = { ...t.type, special: Math.random() < 0.5 ? "striped_h" : "striped_v" };
                renderTileContent(t.el, t.type);
                t.el.classList.add("pop-anim");
            });
            
            // Wait 300ms, then detonate all striped candies simultaneously!
            await new Promise(r => setTimeout(r, 300));
            triggerShake("mega");
            soundManager.playLaserShoot();
            
            const toDestroy = new Set([colorBomb, other]);
            targets.forEach(st => {
                toDestroy.add(st);
                if (st.type.special === "striped_h") {
                    showLaserBeam("row", st.r, 1);
                    for (let c = 0; c < GRID_SIZE; c++) {
                        if (grid[st.r][c] && !isObstacleId(grid[st.r][c].type.id)) toDestroy.add(grid[st.r][c]);
                    }
                } else {
                    showLaserBeam("col", st.c, 1);
                    for (let r = 0; r < GRID_SIZE; r++) {
                        if (grid[r][st.c] && !isObstacleId(grid[r][st.c].type.id)) toDestroy.add(grid[r][st.c]);
                    }
                }
            });
            
            const bonus = toDestroy.size * 70 + 3000;
            score += bonus;
            showFloatingScore(cbX, cbY - 30, `+${bonus} FESTIVAL DE GARBA ! 🔥`, "#FFD700");
            await new Promise(r => setTimeout(r, 260));
            await processMatches(Array.from(toDestroy));
            return true;
        }
        
        // 2B. Color Bomb + Wrapped
        if (isWrappedTile(other)) {
            const targetId = other.type.id;
            const targets = [];
            for (let r = 0; r < GRID_SIZE; r++) {
                for (let c = 0; c < GRID_SIZE; c++) {
                    const t = grid[r][c];
                    if (t && t.type.id === targetId && t !== colorBomb) targets.push(t);
                }
            }
            soundManager.playLightningZap();
            const targetPoints = targets.map(t => {
                const rct = t.el.getBoundingClientRect();
                return { x: rct.left + rct.width / 2, y: rct.top + rct.height / 2 };
            });
            showLightningArcs(cbX, cbY, targetPoints);
            
            await new Promise(r => setTimeout(r, 250));
            targets.forEach(t => {
                t.type = { ...t.type, special: "wrapped" };
                renderTileContent(t.el, t.type);
                t.el.classList.add("pop-anim");
            });
            
            await new Promise(r => setTimeout(r, 300));
            triggerShake("heavy");
            soundManager.playWrappedBomb();
            
            const toDestroy = new Set([colorBomb, other]);
            targets.forEach(wt => {
                toDestroy.add(wt);
                createWrappedExplosion(wt);
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        const nr = wt.r + dr;
                        const nc = wt.c + dc;
                        if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
                            if (grid[nr][nc] && !isObstacleId(grid[nr][nc].type.id)) toDestroy.add(grid[nr][nc]);
                        }
                    }
                }
            });
            const bonus = toDestroy.size * 70 + 2500;
            score += bonus;
            showFloatingScore(cbX, cbY - 30, `+${bonus} DÉLUGE DE MARMITES ! 🍲`, "#FFD700");
            await new Promise(r => setTimeout(r, 260));
            await processMatches(Array.from(toDestroy));
            return true;
        }
        
        // 2C. Color Bomb + Normal Ingredient
        if (!isObstacleId(other.type.id)) {
            const targetId = other.type.id;
            const targets = [];
            for (let r = 0; r < GRID_SIZE; r++) {
                for (let c = 0; c < GRID_SIZE; c++) {
                    const t = grid[r][c];
                    if (t && t.type.id === targetId && t !== colorBomb) targets.push(t);
                }
            }
            soundManager.playLightningZap();
            const targetPoints = targets.map(t => {
                const rct = t.el.getBoundingClientRect();
                return { x: rct.left + rct.width / 2, y: rct.top + rct.height / 2 };
            });
            showLightningArcs(cbX, cbY, targetPoints);
            
            await new Promise(r => setTimeout(r, 250));
            triggerShake("medium");
            soundManager.playImpact();
            
            const toDestroy = new Set([colorBomb, ...targets]);
            const bonus = targets.length * 80 + 1000;
            score += bonus;
            showFloatingScore(cbX, cbY - 30, `+${bonus} FOUDRE D'ATTIÉKÉ ! ⚡`, "#FFD700");
            await new Promise(r => setTimeout(r, 200));
            await processMatches(Array.from(toDestroy));
            return true;
        }
    }
    
    // 3. Striped + Striped (Giant Cross 1-line x 1-col)
    if (isStripedTile(tile1) && isStripedTile(tile2)) {
        await swapTilesVisual(tile1, tile2);
        swapTilesData(tile1, tile2);
        const center = tile2;
        soundManager.playLaserShoot();
        triggerShake("heavy");
        showLaserBeam("row", center.r, 1);
        showLaserBeam("col", center.c, 1);
        
        const toDestroy = new Set([tile1, tile2]);
        for (let c = 0; c < GRID_SIZE; c++) {
            if (grid[center.r][c] && !isObstacleId(grid[center.r][c].type.id)) toDestroy.add(grid[center.r][c]);
        }
        for (let r = 0; r < GRID_SIZE; r++) {
            if (grid[r][center.c] && !isObstacleId(grid[r][center.c].type.id)) toDestroy.add(grid[r][center.c]);
        }
        const rect = center.el.getBoundingClientRect();
        showFloatingScore(rect.left + rect.width / 2, rect.top - 20, "+1200 CROIX LASER ! ⚡", "#00FFFF");
        score += 1200;
        await new Promise(r => setTimeout(r, 250));
        await processMatches(Array.from(toDestroy));
        return true;
    }
    
    // 4. Striped + Wrapped (Video 3 Combo: Giant 3-row x 3-col Triple Laser)
    if ((isStripedTile(tile1) && isWrappedTile(tile2)) || (isWrappedTile(tile1) && isStripedTile(tile2))) {
        await swapTilesVisual(tile1, tile2);
        swapTilesData(tile1, tile2);
        const center = tile2;
        soundManager.playLaserShoot();
        soundManager.playWrappedBomb();
        triggerShake("heavy");
        
        showLaserBeam("row", center.r, 3);
        showLaserBeam("col", center.c, 3);
        
        const toDestroy = new Set([tile1, tile2]);
        for (let dr = -1; dr <= 1; dr++) {
            const r = center.r + dr;
            if (r >= 0 && r < GRID_SIZE) {
                for (let c = 0; c < GRID_SIZE; c++) {
                    if (grid[r][c] && !isObstacleId(grid[r][c].type.id)) toDestroy.add(grid[r][c]);
                }
            }
        }
        for (let dc = -1; dc <= 1; dc++) {
            const c = center.c + dc;
            if (c >= 0 && c < GRID_SIZE) {
                for (let r = 0; r < GRID_SIZE; r++) {
                    if (grid[r][c] && !isObstacleId(grid[r][c].type.id)) toDestroy.add(grid[r][c]);
                }
            }
        }
        const rect = center.el.getBoundingClientRect();
        showFloatingScore(rect.left + rect.width / 2, rect.top - 25, "+2500 MÉGA RAYON TRIPLE ! 💥", "#FFD700");
        score += 2500;
        await new Promise(r => setTimeout(r, 280));
        await processMatches(Array.from(toDestroy));
        return true;
    }
    
    // 5. Wrapped + Wrapped (Gigantic 5x5 explosion)
    if (isWrappedTile(tile1) && isWrappedTile(tile2)) {
        await swapTilesVisual(tile1, tile2);
        swapTilesData(tile1, tile2);
        const center = tile2;
        createWrappedExplosion(center);
        soundManager.playWrappedBomb();
        triggerShake("heavy");
        
        const toDestroy = new Set([tile1, tile2]);
        for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
                const nr = center.r + dr;
                const nc = center.c + dc;
                if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
                    if (grid[nr][nc] && !isObstacleId(grid[nr][nc].type.id)) toDestroy.add(grid[nr][nc]);
                }
            }
        }
        const rect = center.el.getBoundingClientRect();
        showFloatingScore(rect.left + rect.width / 2, rect.top - 25, "+3000 MÉGA DÉTONATION 5x5 ! 🍲💥", "#FFD700");
        score += 3000;
        await new Promise(r => setTimeout(r, 280));
        await processMatches(Array.from(toDestroy));
        return true;
    }
    
    return false;
}

async function attemptSwap(tile1, tile2) {
    if (tile1 === tile2) return;
    if (!tile1 || !tile2) return;
    if (isImmovable(tile1) || isImmovable(tile2)) {
        if (selectedTile) {
            selectedTile.el.classList.remove("selected");
            selectedTile = null;
        }
        return;
    }
    
    // Check adjacency
    const isAdjacent = Math.abs(tile1.r - tile2.r) + Math.abs(tile1.c - tile2.c) === 1;
    if (!isAdjacent) {
        if (selectedTile) {
            selectedTile.el.classList.remove("selected");
            selectedTile = tile2;
            tile2.el.classList.add("selected");
        }
        return;
    }
    
    isProcessing = true;
    
    // 1. Check Super-Combo FIRST
    const superComboHandled = await checkAndExecuteSuperCombo(tile1, tile2);
    if (superComboHandled) {
        moves--;
        updateUI();
        if (selectedTile) {
            selectedTile.el.classList.remove("selected");
            selectedTile = null;
        }
        return;
    }
    
    // 2. Normal Visual Swap
    await swapTilesVisual(tile1, tile2);
    swapTilesData(tile1, tile2);
    
    // 3. Check Matches with player landing tile passed for special creation
    const matchResult = findMatches({ r: tile2.r, c: tile2.c });
    const matchesCount = matchResult.matches ? matchResult.matches.length : (Array.isArray(matchResult) ? matchResult.length : 0);
    const spawnsCount = matchResult.spawns ? matchResult.spawns.length : 0;
    
    if (matchesCount > 0 || spawnsCount > 0) {
        moves--;
        updateUI();
        if (selectedTile) {
            selectedTile.el.classList.remove("selected");
            selectedTile = null;
        }
        await processMatches(matchResult);
    } else {
        // Invalid move -> Swap back
        await swapTilesVisual(tile1, tile2);
        swapTilesData(tile1, tile2);
        isProcessing = false;
        if (selectedTile) {
            selectedTile.el.classList.remove("selected");
            selectedTile = null;
        }
    }
}

function swapTilesData(t1, t2) {
    // Swap types
    const tempType = t1.type;
    t1.type = t2.type;
    t2.type = tempType;
    
    // Update visuals
    renderTileContent(t1.el, t1.type);
    renderTileContent(t2.el, t2.type);
}

function swapTilesVisual(t1, t2) {
    return new Promise(resolve => {
        const x1 = t1.el.offsetLeft;
        const y1 = t1.el.offsetTop;
        const x2 = t2.el.offsetLeft;
        const y2 = t2.el.offsetTop;

        const dx = x2 - x1;
        const dy = y2 - y1;

        t1.el.style.transform = `translate(${dx}px, ${dy}px)`;
        t2.el.style.transform = `translate(${-dx}px, ${-dy}px)`;

        setTimeout(() => {
            t1.el.style.transform = '';
            t2.el.style.transform = '';
            resolve();
        }, 150);
    });
}

function triggerSuperCombo() {
    const bar = document.createElement('div');
    bar.id = 'super-combo-msg';
    document.body.appendChild(bar);
    
    timeRemaining += 30;
    updateTimerUI();
    vibrate([100, 50, 100, 50, 200]);
    showWouhEffect(); // Juicy WOUH effect
    
    // Screen Shake
    document.body.classList.remove('shake');
    void document.body.offsetWidth;
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 400);
    
    // Play Sound
    soundManager.playExplosion();
    
    // Force restart timer if not paused to ensure it continues
    if (!isPaused) {
        startTimer();
    }
    
    setTimeout(() => {
        if (bar.parentNode) bar.parentNode.removeChild(bar);
    }, 3000);
}

function triggerExplosionEffect(startTile, targetTiles) {
    if (!startTile || !targetTiles || targetTiles.length === 0) return;
    
    const startRect = startTile.el.getBoundingClientRect();
    const startX = startRect.left + startRect.width / 2;
    const startY = startRect.top + startRect.height / 2;
    
    // 1. Center Glow
    const glow = document.createElement('div');
    glow.className = 'super-combo-glow';
    glow.style.left = startX + 'px';
    glow.style.top = startY + 'px';
    document.body.appendChild(glow);
    setTimeout(() => glow.remove(), 1000);
    
    // 2. Play Main Sound
    soundManager.playExplosion();
    
    // 3. Shake Screen
    document.body.classList.remove('shake');
    void document.body.offsetWidth;
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 400);

    // 4. Rays & Impacts
    targetTiles.forEach((target, index) => {
        if (!target || !target.el) return;
        
        setTimeout(() => {
            const targetRect = target.el.getBoundingClientRect();
            const targetX = targetRect.left + targetRect.width / 2;
            const targetY = targetRect.top + targetRect.height / 2;
            
            // Create Ray
            const ray = document.createElement('div');
            ray.className = 'explosion-ray';
            ray.style.left = startX + 'px';
            ray.style.top = startY + 'px';
            
            const dist = Math.sqrt(Math.pow(targetX - startX, 2) + Math.pow(targetY - startY, 2));
            const angle = Math.atan2(targetY - startY, targetX - startX) * 180 / Math.PI;
            
            ray.style.setProperty('--ray-length', dist + 'px');
            ray.style.transform = `rotate(${angle}deg)`;
            document.body.appendChild(ray);
            
            // Impact (Wait for ray to travel)
            setTimeout(() => {
                const impact = document.createElement('div');
                impact.className = 'impact-flash';
                impact.style.left = targetX + 'px';
                impact.style.top = targetY + 'px';
                document.body.appendChild(impact);
                
                soundManager.playImpact();
                vibrate(20);
                
                setTimeout(() => {
                    if (ray.parentNode) ray.remove();
                    if (impact.parentNode) impact.remove();
                }, 400);
            }, 300);
            
        }, index * 15); // Stagger rays
    });
}

function findMatches(lastSwapAction = null) {
    let toDestroy = new Set();
    let spawns = [];
    
    const cellHRun = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
    const cellVRun = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
    const hRuns = [];
    const vRuns = [];
    
    // 1. Horizontal runs
    for (let r = 0; r < GRID_SIZE; r++) {
        let run = [];
        for (let c = 0; c < GRID_SIZE; c++) {
            const t = grid[r][c];
            if (!t || isObstacleId(t.type.id) || t.type.id === "color_bomb") {
                if (run.length >= 3) {
                    hRuns.push(run);
                    run.forEach(item => cellHRun[item.r][item.c] = run);
                }
                run = [];
                continue;
            }
            if (run.length === 0 || run[run.length - 1].type.id === t.type.id) {
                run.push(t);
            } else {
                if (run.length >= 3) {
                    hRuns.push(run);
                    run.forEach(item => cellHRun[item.r][item.c] = run);
                }
                run = [t];
            }
        }
        if (run.length >= 3) {
            hRuns.push(run);
            run.forEach(item => cellHRun[item.r][item.c] = run);
        }
    }
    
    // 2. Vertical runs
    for (let c = 0; c < GRID_SIZE; c++) {
        let run = [];
        for (let r = 0; r < GRID_SIZE; r++) {
            const t = grid[r][c];
            if (!t || isObstacleId(t.type.id) || t.type.id === "color_bomb") {
                if (run.length >= 3) {
                    vRuns.push(run);
                    run.forEach(item => cellVRun[item.r][item.c] = run);
                }
                run = [];
                continue;
            }
            if (run.length === 0 || run[run.length - 1].type.id === t.type.id) {
                run.push(t);
            } else {
                if (run.length >= 3) {
                    vRuns.push(run);
                    run.forEach(item => cellVRun[item.r][item.c] = run);
                }
                run = [t];
            }
        }
        if (run.length >= 3) {
            vRuns.push(run);
            run.forEach(item => cellVRun[item.r][item.c] = run);
        }
    }
    
    if (hRuns.length === 0 && vRuns.length === 0) {
        return { matches: [], spawns: [] };
    }
    
    const handledRuns = new Set();
    const spawnLocations = new Set();
    
    // 3. Find L/T/Cross Intersections -> Wrapped Candy (Marmite Royale)
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const h = cellHRun[r][c];
            const v = cellVRun[r][c];
            if (h && v && h.length >= 3 && v.length >= 3) {
                const intersectionTile = grid[r][c];
                if (intersectionTile && !spawnLocations.has(`${r},${c}`)) {
                    spawns.push({
                        r, c,
                        specialType: "wrapped",
                        baseType: intersectionTile.type
                    });
                    spawnLocations.add(`${r},${c}`);
                    handledRuns.add(h);
                    handledRuns.add(v);
                    h.forEach(t => { if (`${t.r},${t.c}` !== `${r},${c}`) toDestroy.add(t); });
                    v.forEach(t => { if (`${t.r},${t.c}` !== `${r},${c}`) toDestroy.add(t); });
                }
            }
        }
    }
    
    // 4. Handle remaining runs
    const allRuns = [...hRuns.map(r => ({ run: r, orientation: "row" })), ...vRuns.map(r => ({ run: r, orientation: "col" }))];
    allRuns.forEach(({ run, orientation }) => {
        if (handledRuns.has(run)) return;
        handledRuns.add(run);
        
        if (run.length >= 5) {
            // Line of 5: Color Bomb (Boule Magique d'Attiéké d'Or)
            let spawnTile = run[Math.floor(run.length / 2)];
            if (lastSwapAction) {
                const sw = run.find(t => t.r === lastSwapAction.r && t.c === lastSwapAction.c);
                if (sw) spawnTile = sw;
            }
            spawns.push({
                r: spawnTile.r,
                c: spawnTile.c,
                specialType: "color_bomb",
                baseType: { id: "color_bomb", name: "Attiéké d'Or Magique", emoji: "🌟" }
            });
            spawnLocations.add(`${spawnTile.r},${spawnTile.c}`);
            run.forEach(t => { if (t !== spawnTile) toDestroy.add(t); });
        } else if (run.length === 4) {
            // Line of 4: Striped Candy
            let spawnTile = run[Math.floor(run.length / 2)];
            if (lastSwapAction) {
                const sw = run.find(t => t.r === lastSwapAction.r && t.c === lastSwapAction.c);
                if (sw) spawnTile = sw;
            }
            const stripeType = orientation === "row" ? "striped_v" : "striped_h";
            spawns.push({
                r: spawnTile.r,
                c: spawnTile.c,
                specialType: stripeType,
                baseType: spawnTile.type
            });
            spawnLocations.add(`${spawnTile.r},${spawnTile.c}`);
            if (run[0] && run[0].type && run[0].type.id === "poisson") {
                setTimeout(() => spawnFlyingFish(spawnTile, 3), 350);
            }
            run.forEach(t => { if (t !== spawnTile) toDestroy.add(t); });
        } else {
            // Match 3
            run.forEach(t => toDestroy.add(t));
        }
    });
    
    // 5. Special Tiles Detonation & Chaining
    const processedSpecials = new Set();
    let queue = Array.from(toDestroy);
    
    while (queue.length > 0) {
        const t = queue.shift();
        if (processedSpecials.has(t)) continue;
        processedSpecials.add(t);
        
        if (isStripedTile(t)) {
            if (t.type.special === "striped_h") {
                showLaserBeam("row", t.r, 1);
                for (let c = 0; c < GRID_SIZE; c++) {
                    const rowTile = grid[t.r][c];
                    if (rowTile && !isObstacleId(rowTile.type.id) && !toDestroy.has(rowTile)) {
                        toDestroy.add(rowTile);
                        queue.push(rowTile);
                    }
                }
            } else {
                showLaserBeam("col", t.c, 1);
                for (let r = 0; r < GRID_SIZE; r++) {
                    const colTile = grid[r][t.c];
                    if (colTile && !isObstacleId(colTile.type.id) && !toDestroy.has(colTile)) {
                        toDestroy.add(colTile);
                        queue.push(colTile);
                    }
                }
            }
            soundManager.playLaserShoot();
        } else if (isWrappedTile(t)) {
            createWrappedExplosion(t);
            soundManager.playWrappedBomb();
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const nr = t.r + dr;
                    const nc = t.c + dc;
                    if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
                        const neighbor = grid[nr][nc];
                        if (neighbor && !toDestroy.has(neighbor)) {
                            toDestroy.add(neighbor);
                            queue.push(neighbor);
                        }
                    }
                }
            }
        } else if (isColorBombTile(t)) {
            const ingPool = INGREDIENTS.map(i => i.id);
            const chosenId = ingPool[Math.floor(Math.random() * ingPool.length)];
            for (let r = 0; r < GRID_SIZE; r++) {
                for (let c = 0; c < GRID_SIZE; c++) {
                    const cbTarget = grid[r][c];
                    if (cbTarget && cbTarget.type.id === chosenId && !toDestroy.has(cbTarget)) {
                        toDestroy.add(cbTarget);
                        queue.push(cbTarget);
                    }
                }
            }
        }
    }
    
    // 6. Adjacent Obstacle Destruction
    toDestroy.forEach(t => {
        const neighbors = [
            { r: t.r - 1, c: t.c }, { r: t.r + 1, c: t.c },
            { r: t.r, c: t.c - 1 }, { r: t.r, c: t.c + 1 }
        ];
        neighbors.forEach(n => {
            if (n.r >= 0 && n.r < GRID_SIZE && n.c >= 0 && n.c < GRID_SIZE) {
                const obs = grid[n.r][n.c];
                if (obs && isObstacleId(obs.type.id) && obs.type.id !== "rock" && !toDestroy.has(obs)) {
                    if (obs.type.id === "sachet") {
                        const giftTypes = ["striped_h", "striped_v", "wrapped"];
                        const giftSpecial = giftTypes[Math.floor(Math.random() * giftTypes.length)];
                        const giftIng = INGREDIENTS.filter(i => i.id !== "alloco")[Math.floor(Math.random() * 5)];
                        obs.type = { ...giftIng, special: giftSpecial };
                        renderTileContent(obs.el, obs.type);
                        obs.el.classList.add("pop-anim");
                        const rct = obs.el.getBoundingClientRect();
                        showFloatingScore(rct.left + rct.width / 2, rct.top - 15, "SACHET OUVERT ! 🛍️🎁", "#00FFFF");
                        soundManager.playPromoSuccess();
                        score += 150;
                    } else {
                        toDestroy.add(obs);
                        score += 20;
                    }
                }
            }
        });
    });
    
    // Filter out spawns from toDestroy
    spawns.forEach(sp => {
        const spKey = `${sp.r},${sp.c}`;
        toDestroy.forEach(t => {
            if (`${t.r},${t.c}` === spKey) toDestroy.delete(t);
        });
    });
    
    return { matches: Array.from(toDestroy), spawns };
}

function checkRecipe(tilesArr) {
    const ids = tilesArr.map(t => t.type.id);
    for (let recipe of RECIPES) {
        // Check if ids contains all ingredients of recipe
        // (Assuming recipe is length 3)
        if (recipe.every(ing => ids.includes(ing)) && new Set(ids).size === 3) {
            return true;
        }
    }
    return false;
}

function causesMatch(r, c, typeId, currentRow) {
    // Check Horizontal (Left)
    if (c >= 2) {
        const t1 = currentRow[c-1];
        const t2 = currentRow[c-2];
        if (t1 && t2 && t1.type.id === typeId && t2.type.id === typeId) return true;
    }
    // Check Vertical (Up)
    if (r >= 2) {
        const t1 = grid[r-1][c];
        const t2 = grid[r-2][c];
        if (t1 && t2 && t1.type.id === typeId && t2.type.id === typeId) return true;
    }
    return false;
}

function isObstacleId(id) {
    return id === 'crate' || id === 'frozen' || id === 'rock' || id === 'hole' || id === 'sachet';
}

function isImmovable(tile) {
    if (!tile || !tile.type) return false;
    return isObstacleId(tile.type.id);
}

function getRandomObstacleForLevel(levelId) {
    const pool = [OBSTACLES.CRATE];
    if (levelId >= 2) pool.push(OBSTACLES.SACHET);
    if (levelId >= 4) pool.push(OBSTACLES.FIRE);
    if (levelId >= 6) pool.push(OBSTACLES.FROZEN);
    if (levelId >= 11) pool.push(OBSTACLES.ROCK);
    const index = Math.floor(Math.random() * pool.length);
    return pool[index];
}

function showBonDabali() {
    comboMsg.innerHTML = '';
    comboMsg.classList.remove('hidden');
    soundManager.playBonDabali();
    vibrate([80, 40, 80]);
    spawnComboStars();
    setAvatarMood('happy');
    if (avatarEl) {
        avatarEl.classList.remove('jump-anim');
        void avatarEl.offsetWidth; // Trigger reflow
        avatarEl.classList.add('jump-anim');
    }
    setTimeout(() => comboMsg.classList.add('hidden'), 400);
    score += 300;
}

async function processMatches(matchResult) {
    let matches = [];
    let spawns = [];
    
    if (Array.isArray(matchResult)) {
        matches = matchResult;
    } else if (matchResult && matchResult.matches) {
        matches = matchResult.matches;
        spawns = matchResult.spawns || [];
    }
    
    if (matches.length === 0 && spawns.length === 0) return;
    
    // 1. Scoring & Goal Progress
    let typeCounts = {};
    matches.forEach(t => {
        t.el.classList.add("match-anim");
        if (!typeCounts[t.type.id]) typeCounts[t.type.id] = 0;
        typeCounts[t.type.id]++;
        
        const rect = t.el.getBoundingClientRect();
        const color = getParticleColor(t.type.id);
        spawnMatchParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, color);
    });
    
    if (matches.length >= 8) {
        triggerShake("heavy");
    } else if (matches.length >= 4) {
        triggerShake("medium");
    } else {
        triggerShake("light");
    }
    
    soundManager.playMatch(comboCount || 1);
    setAvatarMood("happy");
    
    // Floating score pop
    if (matches.length > 0) {
        const first = matches[0];
        const rect = first.el.getBoundingClientRect();
        const pts = matches.length >= 5 ? 120 : 60;
        showFloatingScore(rect.left + rect.width / 2, rect.top + rect.height / 2, `+${pts}`);
        score += pts;
    }
    
    if (comboCount > 1) {
        const bonus = comboCount * 60;
        score += bonus;
        showFloatingScore(window.innerWidth / 2, window.innerHeight / 2 - 40, `+${bonus} COMBO x${comboCount} !`, "#FFD700");
        vibrate([30, 30]);
    }
    
    let goalCompletedThisTurn = false;
    for (let id in typeCounts) {
        const count = typeCounts[id];
        if (currentGoals[id] && goalProgress[id] < currentGoals[id]) {
            const wasComplete = goalProgress[id] >= currentGoals[id];
            // Chaque pièce détruite compte désormais pour +1 dans l'objectif (style Candy Crush)
            goalProgress[id] += count;
            if (!wasComplete && goalProgress[id] >= currentGoals[id]) goalCompletedThisTurn = true;
        }
    }
    
    const allMet = Object.keys(currentGoals).every(id => goalProgress[id] >= currentGoals[id]);
    if (goalCompletedThisTurn || allMet) {
        showBonDabali();
    }
    updateUI();
    
    // 2. Transform Spawns into Special Candies in place!
    spawns.forEach(sp => {
        const tile = grid[sp.r][sp.c];
        if (tile) {
            tile.type = { ...sp.baseType, special: sp.specialType };
            renderTileContent(tile.el, tile.type);
            tile.el.classList.add("pop-anim");
            const rect = tile.el.getBoundingClientRect();
            const label = sp.specialType === "color_bomb" ? "BOULE MAGIQUE ! 🌟" :
                          sp.specialType === "wrapped" ? "MARMITE ROYALE ! 🍲" : "INGRÉDIENT RAYÉ ! ⚡";
            showFloatingScore(rect.left + rect.width / 2, rect.top - 10, label, "#00FFFF");
            soundManager.playPromoSuccess();
        }
    });
    
    await new Promise(r => setTimeout(r, 180));
    
    // 3. Remove destroyed tiles with full grid cleanup
    matches.forEach(t => {
        if (t && t.el && t.el.parentElement) {
            t.el.remove();
        }
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (grid[r][c] === t) {
                    grid[r][c] = null;
                }
            }
        }
    });
    
    // 4. Physical smooth gravity
    await applyGravity();
    resolveMatchesLoop();
}

async function applyGravity() {
    try {
        const tileSize = cachedTileSize || 40;
        const gap = cachedGap || 4;
        const currentLayout = (LEVELS.find(l => l.id === level) || LEVELS[0]).layout;
        const newTilesToAnimate = [];

        // 1. Move surviving tiles down per column
        for (let c = 0; c < GRID_SIZE; c++) {
            let emptySlots = 0;
            for (let r = GRID_SIZE - 1; r >= 0; r--) {
                const isHole = (currentLayout && currentLayout[r] && currentLayout[r][c] === 0) ||
                               (grid[r][c] && grid[r][c].type && grid[r][c].type.id === 'hole');
                if (isHole) {
                    emptySlots = 0; // Obstacle prevents falling across
                    continue;
                }

                if (grid[r][c] === null) {
                    emptySlots++;
                } else if (emptySlots > 0) {
                    // Slide tile down smoothly
                    const tile = grid[r][c];
                    const targetR = r + emptySlots;
                    grid[targetR][c] = tile;
                    grid[r][c] = null;
                    tile.r = targetR;
                    tile.c = c;
                    
                    if (tile.el) {
                        tile.el.dataset.r = targetR;
                        tile.el.dataset.c = c;
                        tile.el.style.top = (targetR * (tileSize + gap)) + 'px';
                    }
                }
            }
            
            // 2. Spawn and drop new tiles from above the board
            let spawnIndex = 1;
            for (let r = GRID_SIZE - 1; r >= 0; r--) {
                const isHole = (currentLayout && currentLayout[r] && currentLayout[r][c] === 0) ||
                               (grid[r][c] && grid[r][c].type && grid[r][c].type.id === 'hole');
                if (isHole) continue;

                if (grid[r][c] === null) {
                    const tileData = createRandomTile(r, c);
                    grid[r][c] = tileData;
                    
                    // Position above the board ceiling without triggering reflow
                    tileData.el.style.top = (-spawnIndex * (tileSize + gap)) + 'px';
                    tileData.el.style.left = (c * (tileSize + gap)) + 'px';
                    gridEl.appendChild(tileData.el);
                    
                    newTilesToAnimate.push({
                        el: tileData.el,
                        targetTop: r * (tileSize + gap)
                    });
                    spawnIndex++;
                }
            }
        }
        
        // Single requestAnimationFrame: animate all spawned tiles into destination simultaneously!
        if (newTilesToAnimate.length > 0) {
            requestAnimationFrame(() => {
                newTilesToAnimate.forEach(item => {
                    item.el.style.top = item.targetTop + 'px';
                });
            });
        }

        // Wait for drop transition (160ms for punchy, reactive feel)
        await new Promise(r => setTimeout(r, 160));
        
        // Trigger elastic Squash & Stretch bounce on landed tiles
        document.querySelectorAll(".tile").forEach(el => {
            el.classList.remove("tile-land-bounce");
            void el.offsetWidth;
            el.classList.add("tile-land-bounce");
            setTimeout(() => el.classList.remove("tile-land-bounce"), 240);
        });

        // PASSE DE SÉCURITÉ ABSOLUE : Garantir zéro case vide (null) sur la grille !
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const isHole = currentLayout && currentLayout[r] && currentLayout[r][c] === 0;
                if (!isHole && grid[r][c] === null) {
                    const fallbackTile = createRandomTile(r, c);
                    grid[r][c] = fallbackTile;
                    fallbackTile.el.style.top = (r * (tileSize + gap)) + "px";
                    fallbackTile.el.style.left = (c * (tileSize + gap)) + "px";
                    gridEl.appendChild(fallbackTile.el);
                    fallbackTile.el.classList.add("pop-anim");
                }
            }
        }
    } catch (e) {
        console.error("Error in applyGravity:", e);
    }
}

async function resolveMatchesLoop() {
    const matchResult = findMatches(null);
    const matchesCount = matchResult.matches ? matchResult.matches.length : (Array.isArray(matchResult) ? matchResult.length : 0);
    const spawnsCount = matchResult.spawns ? matchResult.spawns.length : 0;
    
    if (matchesCount > 0 || spawnsCount > 0) {
        comboCount++;
        if (comboCount > 1) {
            showComboText(comboCount);
        }
        if (comboCount === 4) {
            triggerCelestialStrike(null, 3);
        }
        await processMatches(matchResult);
    } else {
        isProcessing = false;
        comboCount = 0;
        checkGameEnd();
        saveGameState();
    }
}

function showComboText(count) {
    const el = document.createElement('div');
    el.className = 'combo-banner';
    
    let phrase = `COMBO x${count} !`;
    let sub = '';
    if (count === 2) { phrase = "C'EST DOUX ! 😋"; sub = "Combo x2"; }
    else if (count === 3) { phrase = "DABALI PROPRE ! 🔥"; sub = "Combo x3"; }
    else if (count === 4) { phrase = "ÇA MOUSSE FORT ! 💥"; sub = "Super Combo x4"; }
    else if (count >= 5) { phrase = "CHEF DU GARBADROME ! 👑"; sub = `Méga Combo x${count} !`; }

    el.innerHTML = `
        <div style="font-size: 1.85rem; font-weight: 900; letter-spacing: 1px; text-transform: uppercase;">${phrase}</div>
        ${sub ? `<div style="font-size: 1rem; opacity: 0.95; font-weight: 700; margin-top: 3px;">${sub}</div>` : ''}
    `;

    document.body.appendChild(el);

    setTimeout(() => {
        el.remove();
    }, 850);

    vibrate([35, 25, 35]);
}

function triggerConfetti() {
    const colors = ['#f00', '#0f0', '#00f', '#ff0', '#0ff', '#f0f', '#fff', '#ffd700'];
    const count = 100;
    
    for (let i = 0; i < count; i++) {
        const el = document.createElement('div');
        el.className = 'confetti';
        el.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        el.style.left = Math.random() * 100 + 'vw';
        el.style.animationDuration = (Math.random() * 2 + 2) + 's';
        el.style.opacity = Math.random();
        el.style.transform = `rotate(${Math.random() * 360}deg)`;
        
        document.body.appendChild(el);
        
        setTimeout(() => {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 4000);
    }
}

// PWA Install Prompt
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallButton();
});

function showInstallButton() {
    const header = document.querySelector('.header-top');
    if (!header) return;
    
    // Check if button already exists
    if (document.getElementById('install-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'install-btn';
    btn.innerHTML = '<i class="fas fa-download"></i>';
    btn.title = "Installer l'App";
    btn.style.background = '#2E8B57'; // Green
    btn.style.border = '2px solid #fff';
    btn.style.borderRadius = '50%';
    btn.style.color = '#fff';
    btn.style.width = '35px';
    btn.style.height = '35px';
    btn.style.cursor = 'pointer';
    btn.style.marginLeft = '5px';
    btn.style.display = 'flex';
    btn.style.justifyContent = 'center';
    btn.style.alignItems = 'center';
    btn.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
    
    btn.addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                deferredPrompt = null;
                btn.remove();
            }
        }
    });
    
    // Insert before menu button or pause button
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
        header.insertBefore(btn, pauseBtn);
    } else {
        header.appendChild(btn);
    }
}


function checkGameEnd() {
    let allGoalsCompleted = true;
    for (let id in currentGoals) {
        if ((goalProgress[id] || 0) < currentGoals[id]) {
            allGoalsCompleted = false;
            break;
        }
    }

    const levelConfig = LEVELS.find(l => l.id === level) || LEVELS[0];

    if (allGoalsCompleted) {
        clearInterval(timerInterval);
        cleanupTransientUI();
        isProcessing = true;
        
        // Célébration Sugar Crush "GARBA CHAUD !"
        const banner = document.createElement("div");
        banner.className = "garba-chaud-banner";
        banner.innerHTML = `GARBA EST CHAUD DÉ ! 🔥<br><span style="font-size:1.15rem; color:#FFF8DC; font-weight:700;">SUGAR CRUSH D'ABIDJAN !</span>`;
        document.body.appendChild(banner);
        soundManager.playBonDabali();
        triggerShake("heavy");
        
        setTimeout(async () => {
            banner.remove();
            
            // Convertir chaque coup restant en frappe céleste
            const remainingMoves = Math.max(0, moves);
            for (let m = 0; m < remainingMoves; m++) {
                moves--;
                updateUI();
                
                const pool = [];
                for (let r = 0; r < GRID_SIZE; r++) {
                    for (let c = 0; c < GRID_SIZE; c++) {
                        const t = grid[r][c];
                        if (t && t.type.id !== "hole") pool.push(t);
                    }
                }
                if (pool.length > 0) {
                    const target = pool[Math.floor(Math.random() * pool.length)];
                    const rct = target.el.getBoundingClientRect();
                    const tx = rct.left + rct.width / 2;
                    const ty = rct.top + rct.height / 2;
                    
                    const meteor = document.createElement("div");
                    meteor.className = "celestial-meteor-fall";
                    meteor.style.left = `${tx - 4}px`;
                    meteor.style.top = "0px";
                    meteor.style.height = `${ty}px`;
                    document.body.appendChild(meteor);
                    setTimeout(() => meteor.remove(), 350);
                    
                    setTimeout(() => {
                        const imp = document.createElement("div");
                        imp.className = "celestial-impact-flash";
                        imp.style.left = `${tx}px`;
                        imp.style.top = `${ty}px`;
                        document.body.appendChild(imp);
                        setTimeout(() => imp.remove(), 350);
                        
                        showFloatingScore(tx, ty - 25, "+500 GARBA BONUS ! 🍲⚡", "#FFD700");
                        soundManager.playThunderImpact();
                        triggerShake("medium");
                    }, 100);
                    
                    score += 500;
                    updateUI();
                }
                await new Promise(r => setTimeout(r, 220));
            }
            
            triggerConfetti();
            soundManager.playWin();
            vibrate([150, 80, 150, 80, 320]);
            
            const stars = computeStars(score, levelConfig);
            saveBestScoreAndStars(level, score, stars);
            updateModalStars(stars);
            
            if (stars === 3) {
                freeSuperCombos += 1;
                localStorage.setItem(STORAGE_KEYS.freeSuperCombos, String(freeSuperCombos));
                updateFreeSuperDisplay();
                showFloatingScore(window.innerWidth / 2, window.innerHeight / 2 - 80, "+1 COMBO GRATUIT ! 👑", "#00FF7F");
            }
            
            const maxUnlocked = parseInt(localStorage.getItem(STORAGE_KEYS.maxUnlockedLevel), 10);
            const previousMax = Number.isFinite(maxUnlocked) ? maxUnlocked : 1;
            const newMax = Math.max(previousMax, level + 1);
            localStorage.setItem(STORAGE_KEYS.maxUnlockedLevel, String(newMax));
            
            document.getElementById("modal-title").innerText = "Garba Réussi ! 👑";
            document.getElementById("modal-message").innerText = `Bravo ${playerName} ! Score Céleste: ${score}`;
            document.getElementById("modal-btn").innerText = "Niveau Suivant";
            modalBtn.onclick = () => {
                modalOverlay.classList.remove("active");
                setTimeout(() => {
                    modalOverlay.classList.add("hidden");
                    if (shouldShowAdAfterLevel(level, previousMax, newMax)) {
                        showAdForLevel(level);
                    } else {
                        nextLevel();
                    }
                }, 300);
            };
            modalOverlay.classList.remove("hidden");
            modalOverlay.classList.add("active");
            isProcessing = false;
        }, 1600);
        return;
    }

    // Loss Condition (Moves)
    if (moves <= 0) {
        clearInterval(timerInterval); // Stop Timer
        cleanupTransientUI();
        setTimeout(() => {
            document.getElementById('modal-title').innerText = "Plus de mouvements !";
            document.getElementById('modal-message').innerText = `Dommage ${playerName}, tu n'as plus de mouvements.`;
            document.getElementById('modal-btn').innerText = "Réessayer";
            
            modalBtn.onclick = () => {
                startLevel(level);
            };
            modalOverlay.classList.remove('hidden');
            modalOverlay.classList.add('active');
        }, 500);
    }
}

function nextLevel() {
    startLevel(level + 1);
}

function updateUI() {
    const scoreValEl = document.getElementById('score-display');
    const movesValEl = document.getElementById('moves-display');
    const scoreProgressEl = document.getElementById('score-progress');
    const comboMeterEl = document.getElementById('combo-meter');
    
    if (scoreValEl) scoreValEl.innerText = score;
    if (movesValEl) movesValEl.innerText = moves;
    
    document.getElementById('level-display').innerText = level;
    if (levelGroupEl) {
        levelGroupEl.innerText = getLevelGroupName(level);
    }
    document.body.classList.toggle('low-moves', moves <= 3);
    if (comboMeterEl) {
        comboMeterEl.innerText = `COMBO x${comboCount || 0}`;
        comboMeterEl.classList.toggle('active', (comboCount || 0) > 1);
    }

    // Progress Bar and Stars
    const levelConfig = LEVELS.find(l => l.id === level) || LEVELS[0];
    const base = levelConfig.moves || 1;
    const threeStarsScore = base * 60; // Slower fill: higher target
    const progressPercent = Math.min(100, (score / threeStarsScore) * 100);
    
    if (scoreProgressEl) {
        scoreProgressEl.style.width = `${progressPercent}%`;
    }

    // Star markers update
    const star1 = document.querySelector('.marker-1');
    const star2 = document.querySelector('.marker-2');
    const star3 = document.querySelector('.marker-3');
    
    if (star1) star1.classList.toggle('active', progressPercent >= 33);
    if (star2) star2.classList.toggle('active', progressPercent >= 66);
    if (star3) star3.classList.toggle('active', progressPercent >= 95);

    updateFreeSuperDisplay();
    
    // Goals Update
    for (let id in currentGoals) {
        const el = document.getElementById(`goal-count-${id}`);
        const item = document.getElementById(`goal-item-${id}`);
        if (el && item) {
            const current = Math.min(goalProgress[id], currentGoals[id]);
            el.innerText = `${current}/${currentGoals[id]}`;
            
            if (goalProgress[id] >= currentGoals[id]) {
                item.classList.add('completed');
            }
        }
    }
}

function computeStars(currentScore, levelConfig) {
    const base = levelConfig.moves || 1;
    const oneStar = base * 20;
    const twoStars = base * 40;
    const threeStars = base * 60;
    if (currentScore >= threeStars) return 3;
    if (currentScore >= twoStars) return 2;
    if (currentScore >= oneStar) return 1;
    return 0;
}

function checkDailyReward() {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth() + 1;
    const d = today.getDate();
    const todayStr = `${y}-${m}-${d}`;
    const last = localStorage.getItem('dabali_daily_reward_date');
    if (last !== todayStr) {
        localStorage.setItem('dabali_daily_reward_date', todayStr);
        freeSuperCombos += 1;
        localStorage.setItem(STORAGE_KEYS.freeSuperCombos, String(freeSuperCombos));
        updateFreeSuperDisplay();
        showToast('+1 combo quotidien');
        vibrate([80, 40, 80]);
    }
}

function saveBestScoreAndStars(levelId, currentScore, stars) {
    const rawScores = localStorage.getItem(STORAGE_KEYS.bestScores);
    const rawStars = localStorage.getItem(STORAGE_KEYS.bestStars);
    const scores = rawScores ? JSON.parse(rawScores) : {};
    const starsMap = rawStars ? JSON.parse(rawStars) : {};
    const key = String(levelId);
    const previousScore = scores[key] || 0;
    const previousStars = starsMap[key] || 0;
    if (currentScore > previousScore) {
        scores[key] = currentScore;
    }
    if (stars > previousStars) {
        starsMap[key] = stars;
    }
    localStorage.setItem(STORAGE_KEYS.bestScores, JSON.stringify(scores));
    localStorage.setItem(STORAGE_KEYS.bestStars, JSON.stringify(starsMap));
}

function updateModalStars(stars) {
    const container = document.getElementById('modal-stars');
    if (!container) return;
    const icons = container.querySelectorAll('i');
    icons.forEach((icon, index) => {
        if (index < stars) {
            icon.style.opacity = '1';
        } else {
            icon.style.opacity = '0.2';
        }
    });
}

// Start
class DabaliGame {
    init() {
        initGame();
    }
}

// Online Update Check
window.addEventListener('online', () => {
    console.log("Connection restored. Checking for updates...");
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(reg => {
            reg.update();
        });
    }
    const promoEl = document.getElementById('promo-message');
    if (promoEl) {
        promoEl.innerText = "Connexion rétablie !";
        setTimeout(() => { if(promoEl.innerText === "Connexion rétablie !") promoEl.innerText = ""; }, 3000);
    }
});

function proceedAfterSplash() {
    if (isMusicOn) {
        setTimeout(() => ambientSynth.startLoop(), 500);
    }

    const savedStateRaw = localStorage.getItem(STORAGE_KEYS.gameState);
    let resumed = false;
    if (savedStateRaw) {
        try {
            const state = JSON.parse(savedStateRaw);
            if (state.level && state.moves > 0 && state.timeRemaining > 0) {
                // Show Resume Modal
                const resumeOverlay = document.createElement('div');
                resumeOverlay.className = 'modal-overlay active';
                resumeOverlay.style.zIndex = '3000';
                resumeOverlay.innerHTML = `
                    <div class="modal-content" style="background: rgba(20,20,20,0.95); border: 2px solid #FFD700; border-radius: 22px; padding: 24px; text-align: center;">
                        <h2 style="color:#FFD700; font-size:1.8rem; margin:0 0 10px;">Partie en cours</h2>
                        <p style="margin:15px 0; font-size:1.1rem; color:#FFF8DC;">Une partie sauvegardée a été trouvée (Niveau ${state.level}).</p>
                        <p style="margin-bottom:20px; color:#FFE6A7; font-weight:bold;">Score: ${state.score}</p>
                        <div class="modal-buttons" style="display:flex; gap:15px; justify-content:center;">
                            <button id="resume-yes-btn" class="modal-btn" style="background:#4CAF50; border:none; padding:10px 22px; border-radius:14px; color:white; font-weight:bold;">Reprendre</button>
                            <button id="resume-no-btn" class="modal-btn" style="background:#f44336; border:none; padding:10px 22px; border-radius:14px; color:white; font-weight:bold;">Nouvelle Partie</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(resumeOverlay);
                
                document.getElementById('resume-yes-btn').onclick = () => {
                    resumeOverlay.remove();
                    level = state.level;
                    startLevel(level, true);
                };
                
                document.getElementById('resume-no-btn').onclick = () => {
                    resumeOverlay.remove();
                    clearSavedGame();
                    openLevelSelect();
                };
                resumed = true;
            }
        } catch(e) {
            console.error("Error checking saved state", e);
        }
    }

    if (!resumed) {
        const savedLevel = parseInt(localStorage.getItem(STORAGE_KEYS.currentLevel), 10);
        const initialLevel = Number.isFinite(savedLevel) && savedLevel >= 1 ? savedLevel : 1;
        level = initialLevel;
        openLevelSelect();
    }

    checkIosPwaPrompt();
}

function checkIosPwaPrompt() {
    try {
        const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
        const isStandalone = ('standalone' in window.navigator && window.navigator.standalone) || 
                             (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
        if (isIos && !isStandalone) {
            const banner = document.getElementById('ios-pwa-banner');
            const closeBtn = document.getElementById('close-ios-pwa-btn');
            if (banner && !sessionStorage.getItem('ios_pwa_dismissed')) {
                setTimeout(() => {
                    banner.classList.remove('hidden');
                }, 3000);
            }
            if (closeBtn && banner) {
                closeBtn.onclick = () => {
                    banner.classList.add('hidden');
                    sessionStorage.setItem('ios_pwa_dismissed', 'true');
                };
            }
        }
    } catch(e) {
        console.warn("checkIosPwaPrompt error", e);
    }
}

// INTRO STARTUP MUSIC (African Drums Tribal)
let introMusicAudio = null;

function initAndPlayIntroMusic() {
    if (introMusicAudio) return;
    try {
        const savedMusic = localStorage.getItem(STORAGE_KEYS.music);
        if (savedMusic === 'off') return;
        
        introMusicAudio = new Audio('assets/intro_drums.mp3');
        introMusicAudio.loop = true;
        introMusicAudio.preload = 'auto';
        introMusicAudio.volume = Math.max(0.1, Math.min(1.0, musicVolume || 0.7));
        
        const playPromise = introMusicAudio.play();
        if (playPromise !== undefined) {
            playPromise.catch(() => {
                const unlockIntro = () => {
                    if (introMusicAudio && splashScreen && splashScreen.style.display !== 'none') {
                        introMusicAudio.play().catch(() => {});
                    }
                    document.removeEventListener('pointerdown', unlockIntro);
                    document.removeEventListener('touchstart', unlockIntro);
                };
                document.addEventListener('pointerdown', unlockIntro, { once: true });
                document.addEventListener('touchstart', unlockIntro, { once: true });
            });
        }
    } catch(e) {
        console.warn('Could not initialize intro music:', e);
    }
}

function stopIntroMusic() {
    if (!introMusicAudio) return;
    try {
        let currentVol = introMusicAudio.volume;
        const step = currentVol / 8;
        const fadeTimer = setInterval(() => {
            currentVol = Math.max(0, currentVol - step);
            if (introMusicAudio) introMusicAudio.volume = currentVol;
            if (currentVol <= 0.02) {
                clearInterval(fadeTimer);
                if (introMusicAudio) {
                    introMusicAudio.pause();
                    introMusicAudio.currentTime = 0;
                    introMusicAudio = null;
                }
            }
        }, 30);
    } catch(e) {
        try {
            introMusicAudio.pause();
            introMusicAudio.currentTime = 0;
            introMusicAudio = null;
        } catch(err) {}
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Resume AudioContext on first user interaction to satisfy browser autoplay policies
    const unlockAudio = () => {
        if (soundCtx && soundCtx.state === 'suspended') {
            soundCtx.resume().catch(() => {});
        }
    };
    document.addEventListener('pointerdown', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });

    // Start intro tribal drums music immediately
    initAndPlayIntroMusic();

    // Start intro video playback smoothly
    const splashVideo = document.getElementById('splash-video-bg');
    if (splashVideo) {
        splashVideo.muted = true;
        splashVideo.play().catch(() => {});
    }

    // Re-bind Splash elements safely
    splashScreen = document.getElementById('splash-screen');
    startBtn = document.getElementById('start-btn');
    
    // Show button safely
    if (startBtn) {
        startBtn.style.display = 'inline-flex';
        startBtn.classList.remove('hidden');
        
        startBtn.onclick = () => {
            unlockAudio();
            stopIntroMusic();
            ambientSynth.startLoop();
            if (splashVideo) {
                try { splashVideo.pause(); } catch(e) {}
            }
            if (splashScreen) {
                splashScreen.style.opacity = '0';
                setTimeout(() => {
                    splashScreen.style.display = 'none';
                    const savedName = localStorage.getItem(STORAGE_KEYS.playerName);
                    if (!savedName || savedName === 'Joueur') {
                        if (nameModalOverlay) {
                            nameModalOverlay.classList.remove('hidden');
                            nameModalOverlay.classList.add('active');
                            if (playerNameInput) playerNameInput.focus();
                        }
                    } else {
                        playerName = savedName;
                        proceedAfterSplash();
                    }
                }, 400);
            }
        };
    }

    // Init Game Logic
    const game = new DabaliGame();
    game.init();
});
