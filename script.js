// CONFIGURATION
const GRID_SIZE = 8;
const INGREDIENTS = [
    { name: 'Attiéké', emoji: '🍚', id: 'attieke' },
    { name: 'Poisson', emoji: '🐟', id: 'poisson' },
    { name: 'Piment', emoji: '🌶️', id: 'piment' },
    { name: 'Oignon', emoji: '🧅', id: 'oignon' },
    { name: 'Tomate', emoji: '🍅', id: 'tomate' },
    { name: 'Cube Maggi', emoji: '🟨', id: 'maggi', image: 'assets/maggi.png' },
    { name: 'Huile', emoji: '🍾', id: 'huile' }
];

const OBSTACLES = {
    CRATE: { name: 'Caisse', emoji: '📦', id: 'crate', destructible: true, immovable: true },
    FROZEN: { name: 'Bloc glacé', emoji: '🧊', id: 'frozen', destructible: true, immovable: true },
    ROCK: { name: 'Roche', emoji: '🪨', id: 'rock', destructible: false, immovable: true },
    FIRE: { name: 'Flamme', emoji: '🔥', id: 'fire', destructible: true, immovable: true }
};

const STORAGE_KEYS = {
    sound: 'dabali_sound',
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
    bonusLevels: 'dabali_bonus_levels',
    usedPromoCodes: 'dabali_used_promo_codes'
};

// ... (Existing code)

// BOOSTERS LOGIC
let activeBooster = null; // 'hammer', 'swap', or null
let swapSourceTile = null;
let selectedTile = null; // Defined here once

// Booster State Management
const BOOSTER_CONFIG = {
    hammer: { max: 3, current: 3 },
    swap: { max: 3, current: 3 }, // Now "Transform"
    shuffle: { max: 2, current: 2, cooldown: 0, lastUsed: 0 }
};

function initBoosterState() {
    // Reset boosters per level based on rules
    BOOSTER_CONFIG.hammer.current = 3;
    BOOSTER_CONFIG.swap.current = 3;
    BOOSTER_CONFIG.shuffle.current = 2; // Fixed to 2 for now as requested
    BOOSTER_CONFIG.shuffle.cooldown = 0;
    updateBoostersUI();
}

function activateBooster(type) {
    if (moves <= 0 || isPaused) return;

    // Toggle off if already active
    if (activeBooster === type) {
        activeBooster = null;
        if (swapSourceTile) {
            swapSourceTile.el.classList.remove('selected');
            swapSourceTile = null;
        }
        updateBoostersUI();
        return;
    }
    
    // Deactivate other boosters first
    activeBooster = null;
    if (swapSourceTile) {
        swapSourceTile.el.classList.remove('selected');
        swapSourceTile = null;
    }

    // Check availability
    if (type === 'shuffle') {
        const now = Date.now();
        if (BOOSTER_CONFIG.shuffle.current > 0) {
            // Check cooldown if it's the 2nd use (implied by max > 1)
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
        } else {
            showToast("Plus de mélange !");
        }
        return;
    }

    if (BOOSTER_CONFIG[type].current > 0) {
        activeBooster = type;
        updateBoostersUI();
        vibrate(50);
        
        let msg = '';
        if (type === 'hammer') msg = '🔨 Mode Marteau : Touche une case pour la détruire !';
        if (type === 'swap') msg = '✋ Mode Transformation : Sélectionne une case, puis choisis en quoi la transformer !';
        showToast(msg);
    } else {
        showToast("Épuisé !");
    }
}

function handleBoosterInput(tile) {
    if (!activeBooster) return false;

    if (activeBooster === 'hammer') {
        if (!tile) return false;
        destroyTile(tile);
        useBooster('hammer');
        activeBooster = null;
        updateBoostersUI();
        return true;
    }

    if (activeBooster === 'swap') { // Hand = Transform
        if (!tile) return false;
        
        if (!swapSourceTile) {
            // Step 1: Select the tile to transform
            swapSourceTile = tile;
            tile.el.classList.add('selected');
            soundManager.playClick();
            
            // Show a mini-menu or just expect next click to be a neighbor?
            // User requirement: "si on a deux piments et que à coté des deux piments c'est un oignon, la main doit permettre de changer l'oignon en piment"
            // Implementation: Select target -> Select source type from neighbor?
            // Simpler: Click tile -> Cycle through ingredients? Or Click Tile -> Click neighbor to copy its type?
            // Let's do: Click Target -> Click Source (to copy type from).
            showToast("Maintenant, touche une case voisine pour copier son ingrédient !");
            return true;
        } else {
            // Step 2: Select the source type (neighbor)
            if (swapSourceTile === tile) {
                // Deselect
                swapSourceTile.el.classList.remove('selected');
                swapSourceTile = null;
                return true;
            }
            
            // Transform swapSourceTile INTO tile.type
            const targetType = tile.type;
            const tileToTransform = swapSourceTile;
            
            if (isObstacleId(targetType.id)) {
                showToast("Impossible de copier un obstacle !");
                return true;
            }

            // Animate transformation
            tileToTransform.type = targetType;
            renderTileContent(tileToTransform.el, targetType);
            tileToTransform.el.classList.add('match-anim'); // visual feedback
            
            swapSourceTile.el.classList.remove('selected');
            swapSourceTile = null;
            
            useBooster('swap');
            activeBooster = null;
            updateBoostersUI();
            
            soundManager.playPromoSuccess();
            resolveMatchesLoop(); // Check if this created a match
            return true;
        }
    }

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
        if (title === 'Marteau') type = 'hammer';
        else if (title === 'Mélange') type = 'shuffle';
        else if (title === 'Main') type = 'swap';
        
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
    matches.add(tile);
    score += 50; // Bonus points for hammering
    updateUI();
    
    soundManager.playImpact();
    resolveMatchesLoop();
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

// JUICY EFFECTS

function triggerShake() {
    document.body.classList.remove('shake-anim');
    void document.body.offsetWidth; // Trigger reflow
    document.body.classList.add('shake-anim');
    if (navigator.vibrate) navigator.vibrate(200);
}

function showFloatingText(x, y, text, color = '#FFD700') {
    const el = document.createElement('div');
    el.className = 'floating-text';
    el.innerText = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.color = color;
    document.body.appendChild(el);
    
    setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
    }, 1000);
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
        case 'huile': return '#FFA500';
        case 'crate': return '#8B4513';
        case 'frozen': return '#E0FFFF';
        case 'rock': return '#696969';
        case 'fire': return '#FF4500';
        default: return '#FFFFFF';
    }
}

function spawnMatchParticles(x, y, color) {
    const count = 12;
    for(let i=0; i<count; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.backgroundColor = color;
        p.style.left = x + 'px';
        p.style.top = y + 'px';
        
        const angle = Math.random() * Math.PI * 2;
        const velocity = Math.random() * 60 + 20;
        
        p.style.setProperty('--tx', Math.cos(angle) * velocity + 'px');
        p.style.setProperty('--ty', Math.sin(angle) * velocity + 'px');
        
        document.body.appendChild(p);
        
        setTimeout(() => p.remove(), 600);
    }
}


const LEVELS = [
    { id: 1, moves: 20, goals: { attieke: 10, poisson: 10 }, 
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
    { id: 3, moves: 30, goals: { attieke: 15, poisson: 15, huile: 10 }, obstacles: { count: 3 },
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

const PROMO_CODES = {
    'GARBA2025': { type: 'unlock_level', level: null, message: 'Tu as débloqué un niveau bonus !' },
    'DABALI50': { type: 'unlock_level', level: null, message: 'Tu as débloqué un niveau bonus !' },
    'SUPERDABALI': { type: 'free_super', count: 3, message: 'Tu as gagné 3 super combos.' }
};

function getLevelGroupName(levelId) {
    if (levelId <= 10) return "Garba du quartier";
    if (levelId <= 20) return "Dabali de Yopougon";
    if (levelId <= 40) return "Dabali de Cocody";
    if (levelId <= 60) return "Dabali de Treichville";
    if (levelId <= 80) return "Dabali du marché";
    return "Dabali de Côte d'Ivoire";
}

function applyThemeForLevel(levelId) {
    document.body.classList.remove(
        'theme-garba',
        'theme-yopougon',
        'theme-cocody',
        'theme-treichville',
        'theme-marche'
    );
    if (levelId <= 10) document.body.classList.add('theme-garba');
    else if (levelId <= 20) document.body.classList.add('theme-yopougon');
    else if (levelId <= 40) document.body.classList.add('theme-cocody');
    else if (levelId <= 60) document.body.classList.add('theme-treichville');
    else document.body.classList.add('theme-marche');
    
    if (typeof ambientManager !== 'undefined') ambientManager.update(levelId);
}

// STATE
let grid = [];
let score = 0;
let moves = 20;
let level = 1;
let currentGoals = {};
let goalProgress = {};
// let selectedTile = null; // Defined globally at top
let isProcessing = false;
let playerName = "Joueur";
let isSoundOn = true;
let isVibrationOn = true;
let freeSuperCombos = 0;
let comboCount = 0;

let timerInterval = null;
let avatarEl = null;
let avatarState = 'neutral';
let avatarIdleTimeout = null;
let avatarLimbsEl = null;
let timeRemaining = 90; // 1m30s
let isPaused = false;
let hintTimeout = null;
let currentHint = null;

// AMBIENT SOUND SYSTEM
let ambientOscillators = [];
let ambientGain = null;
let isMusicOn = true;

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
        
        if (soundCtx.state === 'suspended') soundCtx.resume();
        
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
const AudioContext = window.AudioContext || window.webkitAudioContext;
const soundCtx = new AudioContext();

// Simple Synthesizer for African Ambient Music
const ambientSynth = {
    ctx: soundCtx,
    nodes: [],
    isPlaying: false,
    tempo: 120,
    
    playNote: function(freq, time, duration, vol=0.08) {
        if(!isMusicOn) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.value = freq;
        osc.type = 'sine'; // Changed from triangle to sine for pure tone
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(vol, time + 0.01); // Faster attack (percussive)
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration); // Fast decay
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(time);
        osc.stop(time + duration + 0.1);
        this.nodes.push(osc);
    },
    
    playPercussion: function(time) {
        if(!isMusicOn) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(80, time + 0.05); // Faster drop
        gain.gain.setValueAtTime(0.2, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08); // Very short (woodblock style)
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(time);
        osc.stop(time + 0.1);
        this.nodes.push(osc);
    },
    
    startLoop: function() {
        if(this.isPlaying) return;
        this.isPlaying = true;
        this.schedule(this.ctx.currentTime + 0.1);
    },
    
    schedule: function(startTime) {
        if(!this.isPlaying) return;
        
        const beatLen = 60 / this.tempo;
        // Simple 4/4 Afrobeat pattern
        // Percussion on 1, 2&, 4
        this.playPercussion(startTime);
        this.playPercussion(startTime + beatLen * 1.5);
        this.playPercussion(startTime + beatLen * 3);
        
        // Melody (Pentatonic: C D E G A)
        // Adjusted to be less "wave-like" and more "marimba"
        const scale = [261.63, 293.66, 329.63, 392.00, 440.00];
        const note = scale[Math.floor(Math.random() * scale.length)];
        
        if(Math.random() > 0.3) {
            this.playNote(note, startTime, beatLen * 0.5, 0.08); // Reduced volume
        }
        if(Math.random() > 0.5) {
            this.playNote(scale[Math.floor(Math.random()*scale.length)], startTime + beatLen * 2, beatLen * 0.5, 0.08);
        }

        setTimeout(() => this.schedule(startTime + beatLen * 4), (beatLen * 4 * 1000) - 50);
    },
    
    stop: function() {
        this.isPlaying = false;
        this.nodes.forEach(n => { try{n.stop()}catch(e){} });
        this.nodes = [];
    }
};

const soundManager = {
    playTone: (freq, type, duration) => {
        if (!isSoundOn) return;
        if (soundCtx.state === 'suspended') soundCtx.resume();
        const osc = soundCtx.createOscillator();
        const gain = soundCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, soundCtx.currentTime);
        gain.gain.setValueAtTime(0.1, soundCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, soundCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(soundCtx.destination);
        osc.start();
        osc.stop(soundCtx.currentTime + duration);
    },
    playClick: () => soundManager.playTone(400, 'sine', 0.1),
    playMatch: (comboMultiplier = 1) => {
        const baseFreq = 600;
        const pitch = Math.min(1200, baseFreq + ((comboMultiplier - 1) * 50));
        soundManager.playTone(pitch, 'sine', 0.1);
        setTimeout(() => soundManager.playTone(pitch * 1.33, 'sine', 0.2), 100);
    },
    playBonDabali: () => {
        soundManager.playTone(400, 'square', 0.1);
        setTimeout(() => soundManager.playTone(600, 'square', 0.1), 100);
        setTimeout(() => soundManager.playTone(800, 'square', 0.1), 200);
        setTimeout(() => soundManager.playTone(1000, 'square', 0.4), 300);
    },
    playWin: () => {
        [300, 400, 500, 600, 800].forEach((f, i) => setTimeout(() => soundManager.playTone(f, 'triangle', 0.2), i * 100));
    },
    playError: () => {
        soundManager.playTone(220, 'sawtooth', 0.12);
        setTimeout(() => soundManager.playTone(160, 'sawtooth', 0.18), 100);
    },
    playAdStart: () => {
        soundManager.playTone(700, 'sine', 0.08);
        setTimeout(() => soundManager.playTone(900, 'sine', 0.1), 80);
    },
    playAdEnd: () => {
        soundManager.playTone(480, 'triangle', 0.1);
        setTimeout(() => soundManager.playTone(720, 'triangle', 0.14), 100);
    },
    playPromoSuccess: () => {
        soundManager.playTone(550, 'square', 0.1);
        setTimeout(() => soundManager.playTone(750, 'square', 0.14), 90);
        setTimeout(() => soundManager.playTone(950, 'square', 0.16), 180);
    },
    playExplosion: () => {
        if (!isSoundOn) return;
        if (soundCtx.state === 'suspended') soundCtx.resume();
        const bufferSize = soundCtx.sampleRate * 0.4;
        const buffer = soundCtx.createBuffer(1, bufferSize, soundCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize) * 0.5;
        }
        const source = soundCtx.createBufferSource();
        source.buffer = buffer;
        const gain = soundCtx.createGain();
        gain.gain.setValueAtTime(0.15, soundCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, soundCtx.currentTime + 0.4);
        source.connect(gain);
        gain.connect(soundCtx.destination);
        source.start();
        // Add a low thump
        soundManager.playTone(80, 'sine', 0.3);
    },
    playImpact: () => {
        soundManager.playTone(150, 'square', 0.1);
    }
};

function vibrate(pattern) {
    if (!isVibrationOn) return;
    if (navigator.vibrate) navigator.vibrate(pattern);
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
    if (!avatarEl) return;
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
    if (avatarLimbsEl) {
        avatarLimbsEl.style.transform = state === 'happy' ? 'translateY(-4px)' : state === 'angry' ? 'rotate(-3deg)' : '';
    }
    if (avatarIdleTimeout) clearTimeout(avatarIdleTimeout);
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

function shouldShowAdAfterLevel(completedLevel, previousMax, newMax) {
    if (newMax <= previousMax) return false;
    if (completedLevel <= 0) return false;
    return completedLevel % 3 === 0;
}

function showAdForLevel(completedLevel) {
    if (!adModalOverlay || !adPartnerNameEl || !adCodeHintEl || !adCountdownEl || !adContinueBtn) {
        nextLevel();
        return;
    }
    const fakeAds = [
        { partner: 'Garba Palace', code: 'GARBA2025', text: 'Code GARBA2025 pour débloquer des niveaux.' },
        { partner: 'Dabali Street', code: 'DABALI50', text: 'Code DABALI50 pour avancer plus vite.' },
        { partner: 'Super Sauce Piment', code: 'SUPERDABALI', text: 'Code SUPERDABALI pour des super combos.' }
    ];
    const ad = fakeAds[Math.floor(Math.random() * fakeAds.length)];
    adPartnerNameEl.innerText = `${ad.partner}`;
    adCodeHintEl.innerText = `Retient bien le code : ${ad.code}`;
    let remaining = 10;
    adCountdownEl.innerText = String(remaining);
    adContinueBtn.disabled = true;
    soundManager.playAdStart();
    vibrate([60, 40, 60]);
    adModalOverlay.classList.remove('hidden');
    adModalOverlay.classList.add('active');
    let lastCode = ad.code;
    if (adCopyBtn) {
        adCopyBtn.onclick = () => {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(lastCode);
            }
        };
    }

    const interval = setInterval(() => {
        remaining -= 1;
        adCountdownEl.innerText = String(remaining);
        if (remaining <= 0) {
            clearInterval(interval);
            adContinueBtn.disabled = false;
            setTimeout(() => {
                if (!adModalOverlay.classList.contains('hidden')) {
                    adContinueBtn.onclick();
                }
            }, 3000);
        }
    }, 1000);
    adContinueBtn.onclick = () => {
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
        
        const headerHeight = headerEl ? headerEl.offsetHeight : 0;
        const footerHeight = footerGoalsEl ? footerGoalsEl.offsetHeight : 0;
        
        const containerWidth = gameContainerEl.clientWidth || window.innerWidth || 320;
        const containerHeight = gameContainerEl.clientHeight || window.innerHeight || 568;
        
        const availableWidth = Math.max(140, containerWidth - 16);
        const availableHeight = Math.max(140, containerHeight - headerHeight - footerHeight - 16);
        
        const boardStyles = window.getComputedStyle(gameBoardEl);
        const borderW = parseFloat(boardStyles.borderLeftWidth) || 0;
        const paddingW = parseFloat(boardStyles.paddingLeft) || 0;
        
        const gridGap = gridEl ? (parseFloat(window.getComputedStyle(gridEl).gap) || 4) : 4;
        const totalGaps = gridGap * (GRID_SIZE - 1);
        
        const maxBoardWidth = Math.max(120, availableWidth - (borderW * 2) - (paddingW * 2));
        const maxBoardHeight = Math.max(120, availableHeight - (borderW * 2) - (paddingW * 2));
        
        const base = Math.min(maxBoardWidth, maxBoardHeight);
        const raw = Math.floor((base - totalGaps) / GRID_SIZE);
        const clamped = Math.max(20, Math.min(72, raw));
        
        if (!isNaN(clamped)) {
            document.documentElement.style.setProperty('--tile-size', `${clamped}px`);
        }
    } catch (e) {
        console.error("Error in updateTileSize:", e);
    }
}

// INIT
function initGame() {
    console.log("Dabali Game v1.11 - Init Started");
    
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
                
                // Check for saved game state first
        if (isMusicOn) {
            // Start ambient music
            setTimeout(() => ambientSynth.startLoop(), 1000);
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
                                <div class="modal-content" style="background: rgba(20,20,20,0.95); border: 2px solid #FFD700;">
                                    <h2 style="color:#FFD700; font-size:1.8rem;">Partie en cours</h2>
                                    <p style="margin:20px 0; font-size:1.1rem;">Une partie sauvegardée a été trouvée (Niveau ${state.level}).</p>
                                    <p style="margin-bottom:20px;">Score: ${state.score}</p>
                                    <div class="modal-buttons" style="display:flex; gap:15px; justify-content:center;">
                                        <button id="resume-yes-btn" class="modal-btn" style="background:#4CAF50; border:none;">Reprendre</button>
                                        <button id="resume-no-btn" class="modal-btn" style="background:#f44336; border:none;">Nouvelle Partie</button>
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
                             resumed = true; // Handled by modal logic
                        }
                    } catch(e) {
                        console.error("Error checking saved state", e);
                    }
                }

                if (!resumed) {
                    const savedLevel = parseInt(localStorage.getItem(STORAGE_KEYS.currentLevel), 10);
                    const initialLevel = Number.isFinite(savedLevel) && savedLevel >= 1 ? savedLevel : 1;
                    level = initialLevel;
                    const maxUnlockedRaw = parseInt(localStorage.getItem(STORAGE_KEYS.maxUnlockedLevel), 10);
                    const maxUnlocked = Number.isFinite(maxUnlockedRaw) ? maxUnlockedRaw : 1;
                    
                    if (maxUnlocked <= 1 && level === 1 && tutorialOverlay) {
                        tutorialOverlay.classList.remove('hidden');
                        tutorialOverlay.classList.add('active');
                    } else {
                        openLevelSelect();
                    }
                }
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
                    // ambientSoundManager.play(ambientManager.currentTheme);
                    ambientSynth.startLoop();
                } else {
                    // ambientSoundManager.stop();
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
                if (title === 'Marteau') activateBooster('hammer');
                else if (title === 'Mélange') activateBooster('shuffle');
                else if (title === 'Main') activateBooster('swap');
            });
        });

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

        const avatarBody = document.getElementById('avatar-body');
        if (avatarBody) {
            avatarEl = document.createElement('div');
            avatarEl.className = 'avatar-face';
            avatarBody.appendChild(avatarEl);
            avatarLimbsEl = document.createElement('div');
            avatarLimbsEl.id = 'avatar-limbs';
            const armLeft = document.createElement('div');
            armLeft.className = 'avatar-arm left';
            const armRight = document.createElement('div');
            armRight.className = 'avatar-arm right';
            const legLeft = document.createElement('div');
            legLeft.className = 'avatar-leg left';
            const legRight = document.createElement('div');
            legRight.className = 'avatar-leg right';
            avatarLimbsEl.appendChild(armLeft);
            avatarLimbsEl.appendChild(armRight);
            avatarLimbsEl.appendChild(legLeft);
            avatarLimbsEl.appendChild(legRight);
            avatarBody.appendChild(avatarLimbsEl);
            setAvatarMood('neutral');
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
    if (!levelGridEl || !levelSelectOverlay) return;
    levelGridEl.innerHTML = '';
    const maxUnlockedRaw = parseInt(localStorage.getItem(STORAGE_KEYS.maxUnlockedLevel), 10);
    const maxUnlocked = Number.isFinite(maxUnlockedRaw) ? maxUnlockedRaw : 1;
    
    const rawBonus = localStorage.getItem(STORAGE_KEYS.bonusLevels);
    const bonusLevels = rawBonus ? JSON.parse(rawBonus) : [];
    
    const rawStars = localStorage.getItem(STORAGE_KEYS.bestStars);
    const starsMap = rawStars ? JSON.parse(rawStars) : {};
    
    LEVELS.forEach(cfg => {
        const btn = document.createElement('button');
        btn.className = 'level-button';
        const stars = starsMap[String(cfg.id)] || 0;
        btn.innerText = stars > 0 ? `${cfg.id} (${stars}⭐)` : String(cfg.id);
        btn.title = getLevelGroupName(cfg.id);
        
        // Unlocked if <= maxUnlocked OR in bonusLevels
        const isUnlocked = (cfg.id <= maxUnlocked) || bonusLevels.includes(cfg.id);
        
        if (!isUnlocked) {
            btn.disabled = true;
            btn.classList.add('locked');
        } else {
            btn.addEventListener('click', () => {
                levelSelectOverlay.classList.add('hidden');
                startLevel(cfg.id);
            });
            if (bonusLevels.includes(cfg.id) && cfg.id > maxUnlocked) {
                btn.style.border = '2px solid gold';
                btn.style.boxShadow = '0 0 10px gold';
            }
        }
        if (cfg.id === level) btn.classList.add('current');
        levelGridEl.appendChild(btn);
    });
    levelSelectOverlay.classList.remove('hidden');
    levelSelectOverlay.classList.add('active');
}

function openDrawer() {
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
        clearInterval(timerInterval);
        isProcessing = true; // Block game
        if (pauseBtn) pauseBtn.innerHTML = '<i class="fas fa-play"></i>';
        
        // Show Overlay
        const overlay = document.createElement('div');
        overlay.id = 'pause-overlay';
        overlay.innerHTML = `
            <div>PAUSE</div>
            <div style="font-size:1rem; margin:20px 0">Touche le bouton Play pour reprendre</div>
            <div style="display:flex; flex-direction:column; gap:15px; align-items:center;">
                <button id="resume-btn" class="modal-btn" style="background:#FFD700; color:#8B4513; margin:0;">
                    <i class="fas fa-play"></i> Reprendre
                </button>
                <button id="menu-btn-pause" class="modal-btn" style="background:#FF4500; color:white; font-size:1rem; padding:8px 20px; margin:0;">
                    <i class="fas fa-home"></i> Menu Principal
                </button>
            </div>
        `;
        document.body.appendChild(overlay);

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
        moves = levelConfig.moves;
        isProcessing = false; // Reset processing flag
        isPaused = false; // Reset pause flag
        
        // Timer Init
        clearInterval(timerInterval);
        timeRemaining = 90; // 90 seconds
        startTimer();
        setAvatarMood('neutral');

        // Init Goals
        if (!levelConfig.goals) {
            console.warn("[DEBUG] No goals defined for this level, using empty object");
            currentGoals = {};
        } else {
            currentGoals = { ...levelConfig.goals };
        }
        goalProgress = {};
        for (let k in currentGoals) goalProgress[k] = 0;

        console.log("[DEBUG] Updating UI...");
        renderGoals(); // Initial Render
        updateUI();
        if (modalOverlay) modalOverlay.classList.add('hidden');
        updateTileSize();
        
        // Create Grid
        console.log("[DEBUG] Creating grid...");
        const obstacleCount = levelConfig.obstacles ? levelConfig.obstacles.count : 0;
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
    if (currentHint) {
        currentHint.forEach(el => {
            if (el.classList.contains('tile')) el.classList.remove('hint-anim');
            if (el.classList.contains('hand-hint')) el.remove();
        });
        currentHint = null;
    }
}

async function showHint() {
    // Brute force find a move
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            // Check Right
            if (c < GRID_SIZE - 1) {
                if (await checkSwapForMatch(r, c, r, c + 1)) {
                    applyHint(r, c, r, c + 1);
                    return;
                }
            }
            // Check Down
            if (r < GRID_SIZE - 1) {
                if (await checkSwapForMatch(r, c, r + 1, c)) {
                    applyHint(r, c, r + 1, c);
                    return;
                }
            }
        }
    }
    handleNoMovesAvailable();
}

async function checkSwapForMatch(r1, c1, r2, c2) {
    // Virtual swap
    const t1 = grid[r1][c1];
    const t2 = grid[r2][c2];
    
    if (!t1 || !t2 || isObstacleId(t1.type.id) || isObstacleId(t2.type.id)) return false;

    // Swap types temporarily
    const temp = t1.type;
    t1.type = t2.type;
    t2.type = temp;
    
    // Check local matches (simplified)
    const hasMatch = checkMatchAt(r1, c1) || checkMatchAt(r2, c2);
    
    // Swap back
    t1.type = t2.type;
    t2.type = temp;
    
    return hasMatch;
}

function checkMatchAt(r, c) {
    const tile = grid[r][c];
    if (!tile) return false;
    const typeId = tile.type.id;
    
    // Horiz
    let hCount = 1;
    let i = c - 1; while(i>=0 && grid[r][i] && grid[r][i].type.id === typeId) { hCount++; i--; }
    i = c + 1; while(i<GRID_SIZE && grid[r][i] && grid[r][i].type.id === typeId) { hCount++; i++; }
    if (hCount >= 3) return true;
    
    // Vert
    let vCount = 1;
    i = r - 1; while(i>=0 && grid[i][c] && grid[i][c].type.id === typeId) { vCount++; i--; }
    i = r + 1; while(i<GRID_SIZE && grid[i][c] && grid[i][c].type.id === typeId) { vCount++; i++; }
    if (vCount >= 3) return true;
    
    return false;
}

function applyHint(r1, c1, r2, c2) {
    const el1 = grid[r1][c1].el;
    const el2 = grid[r2][c2].el;
    el1.classList.add('hint-anim');
    el2.classList.add('hint-anim');
    
    // Hand logic
    const hand = document.createElement('div');
    hand.className = 'hand-hint';
    const rect1 = el1.getBoundingClientRect();
    const rect2 = el2.getBoundingClientRect();
    
    hand.style.left = (rect1.left + rect1.width/2 - 20) + 'px'; // 20 is half width
    hand.style.top = (rect1.top + rect1.height/2 - 20) + 'px';
    
    const dx = (rect2.left - rect1.left);
    const dy = (rect2.top - rect1.top);
    
    hand.style.setProperty('--dx', `${dx}px`);
    hand.style.setProperty('--dy', `${dy}px`);
    
    document.body.appendChild(hand);
    
    currentHint = [el1, el2, hand];
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
    setAvatarMood('angry');
    setTimeout(() => {
        vibrate([200, 120, 200, 120, 260]);
        document.getElementById('modal-title').innerText = "YAKO !";
        document.getElementById('modal-message').innerHTML = `<b>${playerName}</b>, le temps est écoulé !<br>Score : ${score}`;
        document.getElementById('modal-btn').innerText = "Recommencer";
        
        modalBtn.onclick = () => {
            startLevel(level);
        };
        modalOverlay.classList.remove('hidden');
        modalOverlay.classList.add('active');
    }, 500);
}

function handleNoMovesAvailable() {
    if (isProcessing || isPaused) return;
    vibrate([100, 80, 100]);
    const msg = document.createElement('div');
    msg.id = 'nomove-msg';
    msg.innerHTML = `${playerName}, y'a plus de coups là...<br><strong>On mélange le Dabali !</strong>`;
    msg.style.position = 'fixed';
    msg.style.top = '50%';
    msg.style.left = '50%';
    msg.style.transform = 'translate(-50%, -50%)';
    msg.style.background = 'rgba(0,0,0,0.8)';
    msg.style.color = 'white';
    msg.style.padding = '15px 20px';
    msg.style.borderRadius = '15px';
    msg.style.zIndex = '2200';
    msg.style.textAlign = 'center';
    document.body.appendChild(msg);
    reshuffleGrid();
    setTimeout(() => {
        if (msg.parentNode) msg.parentNode.removeChild(msg);
        resetHintTimer();
    }, 1500);
}

function reshuffleGrid() {
    const types = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const tile = grid[r][c];
            if (!isObstacleId(tile.type.id)) {
                types.push(tile.type);
            }
        }
    }
    for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = types[i];
        types[i] = types[j];
        types[j] = tmp;
    }
    let index = 0;
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const tile = grid[r][c];
            if (!isObstacleId(tile.type.id)) {
                tile.type = types[index++];
                renderTileContent(tile.el, tile.type);
            }
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
                    row.push(null);
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
            }
            grid.push(row);
        }
        console.log(`[DEBUG] Grid created successfully. Tiles in gridEl: ${gridEl.childElementCount}`);

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
    for (let id in currentGoals) {
        const target = currentGoals[id];
        const current = goalProgress[id];
        const ing = INGREDIENTS.find(i => i.id === id);
        
        if (!ing) continue;

        const el = document.createElement('div');
        el.className = 'goal-item';
        el.id = `goal-item-${id}`;
        
        const iconContent = ing.image ? 
            `<img src="${ing.image}" style="width:30px; height:30px; object-fit:contain;">` : 
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
    const type = INGREDIENTS[Math.floor(Math.random() * INGREDIENTS.length)];
    const el = document.createElement('div');
    el.className = 'tile';
    renderTileContent(el, type);
    el.dataset.r = r;
    el.dataset.c = c;
    
    // Events
    el.addEventListener('mousedown', handleInputStart);
    el.addEventListener('touchstart', handleInputStart, {passive: false});
    
    return { r, c, type, el };
}

function renderTileContent(el, type) {
    el.classList.remove(
        'tile-attieke',
        'tile-poisson',
        'tile-piment',
        'tile-oignon',
        'tile-tomate',
        'tile-maggi',
        'tile-huile'
    );
    if (type.image) {
        el.innerHTML = `<img src="${type.image}" alt="${type.name}" style="width:80%; height:80%; object-fit:contain; pointer-events:none;">`;
        el.style.fontSize = '';
    } else {
        el.innerText = type.emoji;
        el.innerHTML = type.emoji; // Use innerHTML to be safe
        el.style.fontSize = '';
    }
    if (type.id) {
        el.classList.add(`tile-${type.id}`);
    }
}

// INPUT HANDLING (Swipe & Click)
let touchStartX = 0;
let touchStartY = 0;
let activeTile = null;
// let selectedTile = null; // Removed duplicate declaration

function handleInputStart(e) {
    if (isProcessing || moves <= 0 || isPaused) return; 
    
    let target = e.target;
    // Traverse up to find .tile if clicked on child
    while (target && !target.classList.contains('tile') && target !== gridEl) {
        target = target.parentElement;
    }
    if (!target || !target.classList.contains('tile')) return;

    const tile = getTileFromEl(target);
    if (!tile) return;

    // Booster Handling
    if (activeBooster) {
        if (handleBoosterInput(tile)) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
    }

    resetHintTimer(); 
    
    // Normal Swap Logic
    if (e.type === 'touchstart') {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        activeTile = tile;
        // Don't prevent default to allow scroll if needed, 
        // but usually game prevents default via CSS touch-action: none
    } else if (e.type === 'mousedown') {
        if (selectedTile) {
            // Check if same tile clicked -> deselect
            if (selectedTile === tile) {
                selectedTile.el.classList.remove('selected');
                selectedTile = null;
                return;
            }
            
            // Try swap
            attemptSwap(selectedTile, tile);
            selectedTile.el.classList.remove('selected');
            selectedTile = null;
        } else {
            // First click -> Select
            selectedTile = tile;
            tile.el.classList.add('selected');
            soundManager.playClick();
        }
    }
}

// Add global listeners for swipe end
// We need to attach these once, preferably in init or outside
// But here is fine if guarded
if (!window.touchHandlersAdded) {
    document.addEventListener('touchend', handleTouchEnd, {passive: false});
    window.touchHandlersAdded = true;
}

function handleTouchEnd(e) {
    if (!activeTile || isProcessing || isPaused) return;
    
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    
    const dx = touchEndX - touchStartX;
    const dy = touchEndY - touchStartY;
    
    // Threshold for swipe
    if (Math.abs(dx) > 30 || Math.abs(dy) > 30) {
        let targetR = activeTile.r;
        let targetC = activeTile.c;
        
        if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal
            targetC += (dx > 0 ? 1 : -1);
        } else {
            // Vertical
            targetR += (dy > 0 ? 1 : -1);
        }
        
        if (targetR >= 0 && targetR < GRID_SIZE && targetC >= 0 && targetC < GRID_SIZE) {
            const targetTile = grid[targetR][targetC];
            if (targetTile) {
                attemptSwap(activeTile, targetTile);
            }
        }
        activeTile = null;
    } else {
         // Tap (no swipe)
         // Treat as click for selection logic on touch devices if needed
         if (selectedTile) {
             if (selectedTile === activeTile) {
                 selectedTile.el.classList.remove('selected');
                 selectedTile = null;
             } else {
                 attemptSwap(selectedTile, activeTile);
                 selectedTile.el.classList.remove('selected');
                 selectedTile = null;
             }
         } else {
             selectedTile = activeTile;
             activeTile.el.classList.add('selected');
             soundManager.playClick();
         }
         activeTile = null;
    }
}

function getTileFromEl(el) {
    const r = parseInt(el.dataset.r);
    const c = parseInt(el.dataset.c);
    if (grid[r] && grid[r][c]) return grid[r][c];
    return null;
}

async function attemptSwap(tile1, tile2) {
    if (tile1 === tile2) return;
    if (!tile1 || !tile2) return;
    if (isImmovable(tile1) || isImmovable(tile2)) {
        if (selectedTile) {
            selectedTile.el.classList.remove('selected');
            selectedTile = null;
        }
        return;
    }
    
    // Check adjacency
    const isAdjacent = Math.abs(tile1.r - tile2.r) + Math.abs(tile1.c - tile2.c) === 1;
    if (!isAdjacent) {
        // Reset selection if clicked far away
        if (selectedTile) {
            selectedTile.el.classList.remove('selected');
            selectedTile = tile2;
            tile2.el.classList.add('selected');
        }
        return;
    }
    
    isProcessing = true;
    
    // Visual Swap
    await swapTilesVisual(tile1, tile2);
    
    // Logic Swap
    swapTilesData(tile1, tile2);
    
    // Check Matches
    const matches = findMatches();
    
    if (matches.length > 0) {
        // Valid move
        moves--;
        updateUI();
        await processMatches(matches);
    } else {
        // Invalid -> Swap back
        await swapTilesVisual(tile1, tile2);
        swapTilesData(tile1, tile2);
        isProcessing = false;
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
        }, 200);
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

function findMatches() {
    let matches = new Set();
    let superComboTriggered = false;
    let chicComboType = null;

    const applyExplosionAroundRun = (run) => {
        const explosionTargets = [];
        run.forEach(t => {
            const positions = [
                { r: t.r - 1, c: t.c },
                { r: t.r + 1, c: t.c },
                { r: t.r, c: t.c - 1 },
                { r: t.r, c: t.c + 1 }
            ];
            positions.forEach(pos => {
                if (pos.r >= 0 && pos.r < GRID_SIZE && pos.c >= 0 && pos.c < GRID_SIZE) {
                    const neighbor = grid[pos.r][pos.c];
                    if (neighbor) {
                        matches.add(neighbor);
                        explosionTargets.push(neighbor);
                    }
                }
            });
        });
        const center = run[Math.floor(run.length / 2)];
        triggerExplosionEffect(center, explosionTargets);
    };

    const applyLineClear = (run, orientation, cross = false) => {
        if (run.length === 0) return;
        const center = run[Math.floor(run.length / 2)];
        const targets = [];
        
        if (orientation === 'row' || cross) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const t = grid[center.r][c];
                if (t) {
                    matches.add(t);
                    targets.push(t);
                }
            }
        }
        if (orientation === 'col' || cross) {
            for (let r = 0; r < GRID_SIZE; r++) {
                const t = grid[r][center.c];
                if (t) {
                    matches.add(t);
                    targets.push(t);
                }
            }
        }
        triggerExplosionEffect(center, targets);
    };

    const checkRun = (run, orientation) => {
        if (run.length >= 3) {
            run.forEach(t => matches.add(t));
            if (run.length === 3 && freeSuperCombos > 0 && !superComboTriggered) {
                freeSuperCombos -= 1;
                localStorage.setItem(STORAGE_KEYS.freeSuperCombos, String(freeSuperCombos));
                triggerSuperCombo();
                superComboTriggered = true;
                applyLineClear(run, orientation, false);
                return;
            }
            if (run.length >= 4 && !superComboTriggered) {
                triggerSuperCombo();
                superComboTriggered = true; 
            }
            if (run.length === 4) {
                run.forEach(t => {
                    if (t.el) t.el.classList.add('combo-4-anim');
                });
                applyLineClear(run, orientation, false);
                chicComboType = run[0].type.id;
            }
            if (run.length >= 5) {
                applyExplosionAroundRun(run);
                applyLineClear(run, orientation, true);
            }
        }
    };
    
    // 1. Standard Match-3 (Identical) with Run-Length Check
    // Horizontal
    for (let r = 0; r < GRID_SIZE; r++) {
        let run = [];
        for (let c = 0; c < GRID_SIZE; c++) {
            const t = grid[r][c];
            if (!t || isObstacleId(t.type.id)) {
                checkRun(run, 'row'); run = []; continue;
            }
            if (run.length === 0 || run[run.length-1].type.id === t.type.id) {
                run.push(t);
            } else {
                checkRun(run, 'row'); run = [t];
            }
        }
        checkRun(run, 'row');
    }

    // Vertical
    for (let c = 0; c < GRID_SIZE; c++) {
        let run = [];
        for (let r = 0; r < GRID_SIZE; r++) {
            const t = grid[r][c];
            if (!t || isObstacleId(t.type.id)) {
                checkRun(run, 'col'); run = []; continue;
            }
            if (run.length === 0 || run[run.length-1].type.id === t.type.id) {
                run.push(t);
            } else {
                checkRun(run, 'col'); run = [t];
            }
        }
        checkRun(run, 'col');
    }
    
    // 2. Special Recipe Matches (Heterogeneous)
    // Horizontal
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE - 2; c++) {
            const tilesToCheck = [grid[r][c], grid[r][c+1], grid[r][c+2]];
            if (tilesToCheck.every(t => t) && checkRecipe(tilesToCheck)) {
                tilesToCheck.forEach(t => matches.add(t));
                showBonDabali(); // Recipe always triggers Bon Dabali
                
                // Recipe Explosion
                const center = tilesToCheck[1];
                const surrounding = [];
                for(let dr=-1; dr<=1; dr++) {
                    for(let dc=-1; dc<=1; dc++) {
                        const nr = center.r + dr;
                        const nc = center.c + dc;
                        if(nr>=0 && nr<GRID_SIZE && nc>=0 && nc<GRID_SIZE) {
                            const neighbor = grid[nr][nc];
                            if(neighbor && !tilesToCheck.includes(neighbor)) {
                                matches.add(neighbor);
                                surrounding.push(neighbor);
                            }
                        }
                    }
                }
                triggerExplosionEffect(center, surrounding);
            }
        }
    }
    // Vertical
    for (let c = 0; c < GRID_SIZE; c++) {
        for (let r = 0; r < GRID_SIZE - 2; r++) {
            const tilesToCheck = [grid[r][c], grid[r+1][c], grid[r+2][c]];
            if (tilesToCheck.every(t => t) && checkRecipe(tilesToCheck)) {
                tilesToCheck.forEach(t => matches.add(t));
                showBonDabali();
                
                // Recipe Explosion
                const center = tilesToCheck[1];
                const surrounding = [];
                for(let dr=-1; dr<=1; dr++) {
                    for(let dc=-1; dc<=1; dc++) {
                        const nr = center.r + dr;
                        const nc = center.c + dc;
                        if(nr>=0 && nr<GRID_SIZE && nc>=0 && nc<GRID_SIZE) {
                            const neighbor = grid[nr][nc];
                            if(neighbor && !tilesToCheck.includes(neighbor)) {
                                matches.add(neighbor);
                                surrounding.push(neighbor);
                            }
                        }
                    }
                }
                triggerExplosionEffect(center, surrounding);
            }
        }
    }
    
    // 3. Handle Obstacle Destruction (Adjacent to matches)
    const currentMatches = Array.from(matches);
    currentMatches.forEach(t => {
        const neighbors = [
            {r: t.r-1, c: t.c}, {r: t.r+1, c: t.c},
            {r: t.r, c: t.c-1}, {r: t.r, c: t.c+1}
        ];
        
        neighbors.forEach(n => {
            if (n.r >= 0 && n.r < GRID_SIZE && n.c >= 0 && n.c < GRID_SIZE) {
                const neighborTile = grid[n.r][n.c];
                if (neighborTile && isObstacleId(neighborTile.type.id) && !matches.has(neighborTile)) {
                    if (neighborTile.type.id === 'rock') return;
                    matches.add(neighborTile);
                    score += 20;
                }
            }
        });
    });
    
    if (chicComboType) {
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const t = grid[r][c];
                if (t && !isObstacleId(t.type.id) && t.type.id === chicComboType) {
                    matches.add(t);
                }
            }
        }
    }

    return Array.from(matches);
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
        
        // Check Recipe Horizontal (potential)
        if (t1 && t2 && checkRecipe([{type:{id:t2.type.id}}, {type:{id:t1.type.id}}, {type:{id:typeId}}])) return true;
    }
    // Check Vertical (Up)
    if (r >= 2) {
        const t1 = grid[r-1][c];
        const t2 = grid[r-2][c];
        if (t1 && t2 && t1.type.id === typeId && t2.type.id === typeId) return true;
        
        // Check Recipe Vertical
        if (t1 && t2 && checkRecipe([{type:{id:t2.type.id}}, {type:{id:t1.type.id}}, {type:{id:typeId}}])) return true;
    }
    return false;
}

function isObstacleId(id) {
    return id === 'crate' || id === 'frozen' || id === 'rock';
}

function isImmovable(tile) {
    if (!tile || !tile.type) return false;
    return isObstacleId(tile.type.id);
}

function getRandomObstacleForLevel(levelId) {
    const pool = [OBSTACLES.CRATE];
    if (levelId >= 3) pool.push(OBSTACLES.FIRE);
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

async function processMatches(matches) {
    // 1. Logic & Scoring
    let typeCounts = {};
    
    matches.forEach(t => {
        t.el.classList.add('match-anim');
        if (!typeCounts[t.type.id]) typeCounts[t.type.id] = 0;
        typeCounts[t.type.id]++;
        
        // Particle effect
        const rect = t.el.getBoundingClientRect();
        const color = getParticleColor(t.type.id);
        spawnMatchParticles(rect.left + rect.width/2, rect.top + rect.height/2, color);
    });

    if (matches.length >= 4) {
        triggerShake();
    }

    soundManager.playMatch(comboCount || 1);
    setAvatarMood('angry');

    if (comboCount > 1) {
        const bonus = comboCount * 50;
        score += bonus;
        showFloatingText(window.innerWidth / 2, window.innerHeight / 2 - 50, `+${bonus}`, '#FFD700');
        vibrate([30, 30]);
    }

    let goalCompletedThisTurn = false;
    let allGoalsCompleted = false;

    const levelConfig = LEVELS.find(l => l.id === level) || LEVELS[0];

    // Apply logic per type
    for (let id in typeCounts) {
        const count = typeCounts[id];
        // 1 Combo = group of 3+. Approx by count/3.
        const combos = Math.floor(count / 3) || 1; 
        
        // Score: 50 per combo ONLY if it is a goal ingredient
        if (currentGoals[id]) {
            score += combos * 50;
        }

        // Goals: +1 per combo
        if (currentGoals[id] && goalProgress[id] < currentGoals[id]) {
            const wasComplete = goalProgress[id] >= currentGoals[id];
            goalProgress[id] += combos; // Increment by combo count
            
            // Cap at max (optional, strictly speaking user said "jusqu'arriver à 10/10")
            // But if we have 11/10 it's fine visually.
            
            const isComplete = goalProgress[id] >= currentGoals[id];
            if (!wasComplete && isComplete) {
                goalCompletedThisTurn = true;
            }
        }
    }

    // Check Global Completion
    const allMet = Object.keys(currentGoals).every(id => goalProgress[id] >= currentGoals[id]);
    
    // Trigger Bon Dabali if a goal was just finished OR all are finished
    if (goalCompletedThisTurn || (allMet && goalCompletedThisTurn)) {
        showBonDabali();
    }

    updateUI();
    if (matches.length >= 7) {
        setAvatarMood('happy');
    }
    
    await new Promise(r => setTimeout(r, 300));
    
    // 2. Refill (Gravity)
    // Removed duplicate declaration of levelConfig
    const currentLayout = (LEVELS.find(l => l.id === level) || LEVELS[0]).layout;

    for (let c = 0; c < GRID_SIZE; c++) {
        // Collect types that are staying in this column (not matches, not holes)
        let stayingTypes = [];
        for (let r = GRID_SIZE - 1; r >= 0; r--) {
            const tile = grid[r][c];
            const isHole = currentLayout && currentLayout[r] && currentLayout[r][c] === 0;
            if (!isHole && tile && !matches.includes(tile)) {
                stayingTypes.push(tile.type);
            }
        }

        // Fill slots from bottom to top
        let stayingIdx = 0;
        for (let r = GRID_SIZE - 1; r >= 0; r--) {
            const isHole = currentLayout && currentLayout[r] && currentLayout[r][c] === 0;
            if (isHole) continue;

            if (stayingIdx < stayingTypes.length) {
                grid[r][c].type = stayingTypes[stayingIdx++];
            } else {
                // New tile
                grid[r][c].type = INGREDIENTS[Math.floor(Math.random() * INGREDIENTS.length)];
                
                // Drop animation for new tiles
                grid[r][c].el.classList.remove('drop-anim');
                void grid[r][c].el.offsetWidth;
                grid[r][c].el.classList.add('drop-anim');
            }

            // Render the updated tile
            grid[r][c].el.className = 'tile';
            renderTileContent(grid[r][c].el, grid[r][c].type);
            if (isObstacleId(grid[r][c].type.id)) grid[r][c].el.classList.add('obstacle');
        }
    }
    
    await new Promise(r => setTimeout(r, 200));
    
    // 3. Check for new matches (Chain reaction)
    resolveMatchesLoop();
}

async function resolveMatchesLoop() {
    const newMatches = findMatches();
    if (newMatches.length > 0) {
        comboCount++;
        if (comboCount > 1) {
            showComboText(comboCount);
        }
        await processMatches(newMatches);
    } else {
        isProcessing = false;
        comboCount = 0;
        checkGameEnd();
        saveGameState();
    }
}

function showComboText(count) {
    const el = document.createElement('div');
    el.innerText = `COMBO x${count} !`;
    el.style.position = 'fixed';
    el.style.left = '50%';
    el.style.top = '40%';
    el.style.transform = 'translate(-50%, -50%) scale(0) rotate(-10deg)';
    el.style.color = '#FFD700';
    el.style.fontSize = '3.5rem';
    el.style.fontWeight = 'bold';
    el.style.textShadow = '0 0 15px #FF4500, 4px 4px 0 #8B4513';
    el.style.zIndex = '2000';
    el.style.pointerEvents = 'none';
    el.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease-in';
    
    document.body.appendChild(el);
    
    requestAnimationFrame(() => {
        el.style.transform = 'translate(-50%, -50%) scale(1) rotate(0deg)';
    });
    
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translate(-50%, -50%) scale(1.5) rotate(10deg)';
        setTimeout(() => el.remove(), 300);
    }, 800);
    
    vibrate([50, 50, 50]);
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
    // Win Condition
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
        setTimeout(() => {
            showBonDabali(); // Extra celebration
            triggerConfetti();
            setTimeout(() => {
                vibrate([150, 80, 150, 80, 320]);
                soundManager.playWin();
                const stars = computeStars(score, levelConfig);
                saveBestScoreAndStars(level, score, stars);
                updateModalStars(stars);
                const maxUnlocked = parseInt(localStorage.getItem(STORAGE_KEYS.maxUnlockedLevel), 10);
                const previousMax = Number.isFinite(maxUnlocked) ? maxUnlocked : 1;
                const newMax = Math.max(previousMax, level + 1);
                localStorage.setItem(STORAGE_KEYS.maxUnlockedLevel, String(newMax));
                document.getElementById('modal-title').innerText = "Niveau Terminé !";
                document.getElementById('modal-message').innerText = `Bravo ${playerName} ! Score: ${score}`;
                document.getElementById('modal-btn').innerText = "Niveau Suivant";
                modalBtn.onclick = () => {
                    modalOverlay.classList.remove('active');
                    setTimeout(() => {
                        modalOverlay.classList.add('hidden');
                        if (shouldShowAdAfterLevel(level, previousMax, newMax)) {
                            showAdForLevel(level);
                        } else {
                            nextLevel();
                        }
                    }, 300);
                };
                modalOverlay.classList.remove('hidden');
                modalOverlay.classList.add('active');
            }, 2000);
        }, 500);
        return;
    }

    // Loss Condition (Moves)
    if (moves <= 0) {
        clearInterval(timerInterval); // Stop Timer
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
    
    if (scoreValEl) scoreValEl.innerText = score;
    if (movesValEl) movesValEl.innerText = moves;
    
    document.getElementById('level-display').innerText = level;
    if (levelGroupEl) {
        levelGroupEl.innerText = getLevelGroupName(level);
    }

    // Progress Bar and Stars
    const levelConfig = LEVELS.find(l => l.id === level) || LEVELS[0];
    const base = levelConfig.moves || 1;
    const threeStarsScore = base * 30;
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
    const oneStar = base * 10;
    const twoStars = base * 20;
    const threeStars = base * 30;
    if (currentScore >= threeStars) return 3;
    if (currentScore >= twoStars) return 2;
    if (currentScore >= oneStar) return 1;
    return 0;
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

document.addEventListener('DOMContentLoaded', () => {
    // Re-bind Splash elements safely
    splashScreen = document.getElementById('splash-screen');
    startBtn = document.getElementById('start-btn');
    const progress = document.getElementById('splash-progress');
    
    // Animate progress
    if (progress) {
        setTimeout(() => progress.style.width = '50%', 100);
        setTimeout(() => progress.style.width = '100%', 500);
    }

    // Show button safely
    if (startBtn) {
        setTimeout(() => {
            startBtn.style.display = 'block';
            startBtn.classList.remove('hidden'); // Legacy
        }, 1000);
        
        startBtn.onclick = () => {
            if (splashScreen) {
                splashScreen.style.opacity = '0';
                setTimeout(() => {
                    splashScreen.style.display = 'none';
                    // Open Name Modal
                    if (nameModalOverlay) {
                        nameModalOverlay.classList.remove('hidden');
                        nameModalOverlay.classList.add('active');
                        if (playerNameInput) playerNameInput.focus();
                    }
                }, 500);
            }
        };
    }

        const boosterItems = document.querySelectorAll('.booster-item');
        boosterItems.forEach(b => {
            b.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent grid click
                const title = b.getAttribute('title');
                if (title === 'Marteau') activateBooster('hammer');
                else if (title === 'Mélange') activateBooster('shuffle');
                else if (title === 'Main') activateBooster('swap');
            });
        });

        // Init Game Logic
        const game = new DabaliGame();
        game.init();
});
