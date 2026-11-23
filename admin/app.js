// Dabali Game - Admin Dashboard Controller
const DEFAULT_KEY = "dabali2026admin";
let adminKey = sessionStorage.getItem('dabali_admin_token') || localStorage.getItem('dabali_admin_key') || DEFAULT_KEY;

// Base 30 Saga Levels (Reference data for display)
const BASE_LEVELS = [
    { id: 1, name: "Deux Plateaux (Cocody)", moves: 20, goals: "🍚10, 🐟10", obstacles: "Aucun" },
    { id: 2, name: "Angré (Cocody)", moves: 22, goals: "🍚12, 🐟12, 🌶️10", obstacles: "Sachets" },
    { id: 3, name: "Riviera 3 (Cocody)", moves: 24, goals: "🍚15, 🐟15, 🍾10", obstacles: "Sachets" },
    { id: 4, name: "Palmeraie (Cocody)", moves: 26, goals: "🍚18, 🐟18, 🌶️12, 🧅12", obstacles: "Caisses" },
    { id: 5, name: "Anono (Cocody)", moves: 30, goals: "🍚20, 🐟20, 🌶️15, 🧅15, 🍾10", obstacles: "Sachets + Caisses" },
    { id: 6, name: "Maroc (Yopougon)", moves: 25, goals: "🍚20, 🐟15, 🌶️15", obstacles: "Sachets" },
    { id: 7, name: "Niangon (Yopougon)", moves: 26, goals: "🍚22, 🐟18, 🍾12", obstacles: "Caisses" },
    { id: 8, name: "Selmer (Yopougon)", moves: 28, goals: "🍚25, 🐟20, 🌶️15", obstacles: "Sachets + Caisses" },
    { id: 9, name: "Siporex (Yopougon)", moves: 30, goals: "🍚25, 🐟25, 🍾15", obstacles: "Caisses" },
    { id: 10, name: "Toits Rouges (Yopougon)", moves: 32, goals: "🍚30, 🐟25, 🌶️20", obstacles: "Sachets + Caisses" },
    { id: 11, name: "Koumassi Remblais", moves: 28, goals: "🍚25, 🐟20, 🧅15", obstacles: "Sachets" },
    { id: 12, name: "Marcory Résidentiel", moves: 30, goals: "🍚25, 🐟25, 🍾15", obstacles: "Caisses" },
    { id: 13, name: "Treichville Arras", moves: 30, goals: "🍚30, 🐟25, 🌶️20", obstacles: "Sachets" },
    { id: 14, name: "Plateau Cité Administrative", moves: 32, goals: "🍚30, 🐟30, 🍾20", obstacles: "Caisses" },
    { id: 15, name: "Adjamé Liberté", moves: 35, goals: "🍚35, 🐟30, 🌶️25, 🧅20", obstacles: "Sachets + Caisses" }
];

// Current State
let state = {
    version: "1.0.0",
    announcement: {
        enabled: true,
        text: "Bienvenue sur Dabali Game ! Nouveau tournoi du Garbaman ouvert à Abidjan !",
        badge: "Événement"
    },
    ads: [
        {
            id: "ad-1",
            partner: "Garba Palace Abidjan",
            text: "Le meilleur Garba chaud de Cocody ! Commandez direct sur WhatsApp avec -15%",
            code: "GARBA15",
            link: "https://wa.me/2250707070707",
            frequency: 3,
            enabled: true
        }
    ],
    customLevels: []
};

// INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    setupNavigation();
    loadConfig();
    setupSimulatorLiveSync();
});

// AUTHENTICATION
function initAuth() {
    const isAuth = sessionStorage.getItem('dabali_admin_logged');
    if (isAuth === 'true') {
        showDashboard();
    } else {
        document.getElementById('login-modal').classList.remove('hidden');
    }

    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const pin = document.getElementById('admin-pin').value.trim();
        const currentSavedKey = localStorage.getItem('dabali_admin_key') || DEFAULT_KEY;
        
        if (pin === currentSavedKey || pin === DEFAULT_KEY) {
            sessionStorage.setItem('dabali_admin_logged', 'true');
            sessionStorage.setItem('dabali_admin_token', pin);
            adminKey = pin;
            document.getElementById('login-modal').classList.add('hidden');
            showDashboard();
            showToast("Connexion réussie !", "success");
        } else {
            const err = document.getElementById('login-error');
            err.classList.remove('hidden');
            setTimeout(() => err.classList.add('hidden'), 3500);
        }
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        sessionStorage.removeItem('dabali_admin_logged');
        sessionStorage.removeItem('dabali_admin_token');
        location.reload();
    });
}

function showDashboard() {
    document.getElementById('dashboard-app').classList.remove('hidden');
}

// NAVIGATION
function setupNavigation() {
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            switchTab(tabId);
        });
    });

    document.getElementById('sync-now-btn').addEventListener('click', syncConfigToCloud);
}

function switchTab(tabId) {
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    const activeBtn = document.querySelector(`.sidebar-nav .nav-item[data-tab="${tabId}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    const activeContent = document.getElementById(tabId);
    if (activeContent) activeContent.classList.add('active');

    // Title update
    const titles = {
        'tab-overview': "Vue d'ensemble",
        'tab-sponsors': "Régie Publicitaire & Sponsors",
        'tab-levels': "Gestionnaire des Niveaux",
        'tab-announcements': "Annonces & Notifications",
        'tab-settings': "Paramètres & Clé"
    };
    document.getElementById('page-title').innerText = titles[tabId] || "Administration";
}

// LOAD CONFIGURATION
async function loadConfig() {
    try {
        const local = localStorage.getItem('dabali_game_config');
        if (local) {
            state = JSON.parse(local);
        }

        // Try to fetch from API
        const res = await fetch('/api/game-config');
        if (res.ok) {
            const cloud = await res.json();
            if (cloud && cloud.ads) {
                state = cloud;
                localStorage.setItem('dabali_game_config', JSON.stringify(state));
            }
        }
    } catch(e) {
        console.warn("Utilisation de la configuration locale :", e);
    }

    renderAll();
}

function renderAll() {
    renderStats();
    renderAds();
    renderLevels();
    renderAnnouncement();
    renderSimulator();
}

// STATS
function renderStats() {
    const totalLevels = 30 + (state.customLevels ? state.customLevels.length : 0);
    document.getElementById('stat-levels-count').innerText = totalLevels;

    const activeAds = state.ads ? state.ads.filter(a => a.enabled).length : 0;
    document.getElementById('stat-ads-count').innerText = activeAds;

    const annStatus = state.announcement && state.announcement.enabled ? "Active" : "Désactivée";
    document.getElementById('stat-announcement-status').innerText = annStatus;
}

// SPONSORS & ADS
function renderAds() {
    const tbody = document.getElementById('ads-table-body');
    tbody.innerHTML = '';

    if (!state.ads || state.ads.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#64748B; padding:30px;">Aucune campagne publicitaire active. Cliquez sur "Nouveau Partenaire" pour en ajouter une.</td></tr>`;
        return;
    }

    state.ads.forEach(ad => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="font-weight:700; color:#FFD700;">${escapeHtml(ad.partner)}</div>
                <div style="font-size:0.75rem; color:#94A3B8;">ID: ${ad.id}</div>
            </td>
            <td>
                <div style="max-width:280px; font-size:0.85rem;">${escapeHtml(ad.text)}</div>
                ${ad.code ? `<div style="font-size:0.78rem; color:#10B981; font-weight:bold; margin-top:3px;">Code: ${escapeHtml(ad.code)}</div>` : ''}
            </td>
            <td>
                <a href="${escapeHtml(ad.link)}" target="_blank" style="color:#38BDF8; font-size:0.85rem; text-decoration:none;">
                    <i class="fas fa-external-link-alt"></i> Ouvrir le lien
                </a>
            </td>
            <td>Tous les ${ad.frequency || 3} niveaux</td>
            <td>
                <span class="badge ${ad.enabled ? 'badge-active' : 'badge-inactive'}">
                    ${ad.enabled ? 'Actif' : 'Inactif'}
                </span>
            </td>
            <td>
                <button class="action-icon-btn" title="Modifier" onclick="editAd('${ad.id}')"><i class="fas fa-edit"></i></button>
                <button class="action-icon-btn" title="${ad.enabled ? 'Désactiver' : 'Activer'}" onclick="toggleAd('${ad.id}')">
                    <i class="fas ${ad.enabled ? 'fa-pause' : 'fa-play'}"></i>
                </button>
                <button class="action-icon-btn delete" title="Supprimer" onclick="deleteAd('${ad.id}')"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openAdModal(adId = null) {
    document.getElementById('ad-form').reset();
    document.getElementById('ad-id').value = '';
    document.getElementById('ad-modal-title').innerText = adId ? "Modifier le Partenaire" : "Nouveau Partenaire Publicitaire";

    if (adId) {
        const ad = state.ads.find(a => a.id === adId);
        if (ad) {
            document.getElementById('ad-id').value = ad.id;
            document.getElementById('ad-partner').value = ad.partner;
            document.getElementById('ad-text').value = ad.text;
            document.getElementById('ad-link').value = ad.link;
            document.getElementById('ad-code').value = ad.code || '';
            document.getElementById('ad-frequency').value = ad.frequency || 3;
            document.getElementById('ad-enabled').checked = ad.enabled;
        }
    }

    document.getElementById('ad-modal').classList.remove('hidden');
}

function closeAdModal() {
    document.getElementById('ad-modal').classList.add('hidden');
}

function handleAdSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('ad-id').value || `ad-${Date.now()}`;
    const partner = document.getElementById('ad-partner').value.trim();
    const text = document.getElementById('ad-text').value.trim();
    const link = document.getElementById('ad-link').value.trim();
    const code = document.getElementById('ad-code').value.trim();
    const frequency = parseInt(document.getElementById('ad-frequency').value, 10);
    const enabled = document.getElementById('ad-enabled').checked;

    const existingIndex = state.ads.findIndex(a => a.id === id);
    const adData = { id, partner, text, link, code, frequency, enabled };

    if (existingIndex >= 0) {
        state.ads[existingIndex] = adData;
    } else {
        state.ads.push(adData);
    }

    closeAdModal();
    renderAds();
    renderStats();
    renderSimulator();
    showToast("Campagne publicitaire enregistrée localement. Cliquez sur 'Publier' pour l'activer en direct !", "success");
}

function editAd(id) {
    openAdModal(id);
}

function toggleAd(id) {
    const ad = state.ads.find(a => a.id === id);
    if (ad) {
        ad.enabled = !ad.enabled;
        renderAds();
        renderStats();
        renderSimulator();
        showToast(`Campagne ${ad.partner} ${ad.enabled ? 'activée' : 'mise en pause'}.`, "info");
    }
}

function deleteAd(id) {
    if (confirm("Confirmer la suppression de cette publicité partenaire ?")) {
        state.ads = state.ads.filter(a => a.id !== id);
        renderAds();
        renderStats();
        renderSimulator();
        showToast("Publicité supprimée.", "info");
    }
}

// AD SIMULATOR
function setupSimulatorLiveSync() {
    ['ad-partner', 'ad-text', 'ad-code', 'ad-link'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateSimulatorFromInputs);
    });
}

function updateSimulatorFromInputs() {
    const partner = document.getElementById('ad-partner').value || "Nom du Partenaire";
    const text = document.getElementById('ad-text').value || "Votre message publicitaire apparaîtra ici.";
    const code = document.getElementById('ad-code').value || "CODE";
    const link = document.getElementById('ad-link').value || "#";

    document.getElementById('preview-ad-partner').innerText = partner;
    document.getElementById('preview-ad-text').innerText = text;
    document.getElementById('preview-ad-code').innerText = code;
    document.getElementById('preview-ad-link').href = link;
}

function renderSimulator() {
    const activeAd = state.ads && state.ads.find(a => a.enabled);
    if (activeAd) {
        document.getElementById('preview-ad-partner').innerText = activeAd.partner;
        document.getElementById('preview-ad-text').innerText = activeAd.text;
        document.getElementById('preview-ad-code').innerText = activeAd.code || 'Aucun';
        document.getElementById('preview-ad-link').href = activeAd.link;
    } else {
        document.getElementById('preview-ad-partner').innerText = "Aucun sponsor actif";
        document.getElementById('preview-ad-text').innerText = "Activez une campagne pour voir la simulation.";
        document.getElementById('preview-ad-code').innerText = "-";
        document.getElementById('preview-ad-link').href = "#";
    }
}

// LEVELS MANAGER
function renderLevels() {
    const tbody = document.getElementById('levels-table-body');
    tbody.innerHTML = '';

    // Render Base 15 preview
    BASE_LEVELS.forEach(lvl => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong style="color:#FFD700;">Niveau ${lvl.id}</strong></td>
            <td>${lvl.name}</td>
            <td>${lvl.moves} coups</td>
            <td><span style="font-size:0.85rem;">${lvl.goals}</span></td>
            <td><span style="font-size:0.85rem; color:#94A3B8;">${lvl.obstacles}</span></td>
            <td><span class="badge badge-active">Inclus (Saga)</span></td>
        `;
        tbody.appendChild(tr);
    });

    // Render Custom Levels
    if (state.customLevels && state.customLevels.length > 0) {
        state.customLevels.forEach(lvl => {
            const tr = document.createElement('tr');
            tr.style.background = "rgba(255, 215, 0, 0.05)";
            tr.innerHTML = `
                <td><strong style="color:#10B981;">Niveau ${lvl.id} ✨</strong></td>
                <td><strong>${escapeHtml(lvl.name)}</strong></td>
                <td>${lvl.moves} coups</td>
                <td><span style="font-size:0.85rem; color:#FFD700;">${formatGoals(lvl.goals)}</span></td>
                <td><span style="font-size:0.85rem;">${lvl.obstacles || 'Aucun'}</span></td>
                <td>
                    <button class="action-icon-btn delete" title="Supprimer le niveau" onclick="deleteLevel(${lvl.id})">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

function openLevelModal() {
    document.getElementById('level-form').reset();
    const nextLvlNum = 31 + (state.customLevels ? state.customLevels.length : 0);
    document.getElementById('level-number').value = nextLvlNum;
    document.getElementById('level-modal').classList.remove('hidden');
}

function closeLevelModal() {
    document.getElementById('level-modal').classList.add('hidden');
}

function handleLevelSubmit(e) {
    e.preventDefault();
    const id = parseInt(document.getElementById('level-number').value, 10);
    const moves = parseInt(document.getElementById('level-moves').value, 10);
    const name = document.getElementById('level-name').value.trim();
    const obstacles = document.getElementById('level-obstacles').value;

    const goals = {};
    const attieke = parseInt(document.getElementById('goal-attieke').value, 10);
    const poisson = parseInt(document.getElementById('goal-poisson').value, 10);
    const piment = parseInt(document.getElementById('goal-piment').value, 10);
    const oignon = parseInt(document.getElementById('goal-oignon').value, 10);
    const huile = parseInt(document.getElementById('goal-huile').value, 10);

    if (attieke > 0) goals['attieke'] = attieke;
    if (poisson > 0) goals['poisson'] = poisson;
    if (piment > 0) goals['piment'] = piment;
    if (oignon > 0) goals['oignon'] = oignon;
    if (huile > 0) goals['huile'] = huile;

    const newLevel = { id, name, moves, goals, obstacles };
    
    if (!state.customLevels) state.customLevels = [];
    state.customLevels = state.customLevels.filter(l => l.id !== id);
    state.customLevels.push(newLevel);
    state.customLevels.sort((a, b) => a.id - b.id);

    closeLevelModal();
    renderLevels();
    renderStats();
    showToast(`Niveau ${id} créé avec succès ! Pensez à cliquer sur 'Publier'.`, "success");
}

function deleteLevel(id) {
    if (confirm(`Supprimer le niveau personnalisé ${id} ?`)) {
        state.customLevels = state.customLevels.filter(l => l.id !== id);
        renderLevels();
        renderStats();
        showToast(`Niveau ${id} supprimé.`, "info");
    }
}

function formatGoals(goals) {
    if (!goals) return "-";
    const parts = [];
    if (goals.attieke) parts.push(`🍚 ${goals.attieke}`);
    if (goals.poisson) parts.push(`🐟 ${goals.poisson}`);
    if (goals.piment) parts.push(`🌶️ ${goals.piment}`);
    if (goals.oignon) parts.push(`🧅 ${goals.oignon}`);
    if (goals.huile) parts.push(`🍾 ${goals.huile}`);
    return parts.join(", ");
}

// ANNOUNCEMENTS
function renderAnnouncement() {
    if (!state.announcement) return;
    document.getElementById('announcement-toggle').checked = !!state.announcement.enabled;
    document.getElementById('announcement-badge').value = state.announcement.badge || "Événement";
    document.getElementById('announcement-text').value = state.announcement.text || "";
}

function saveAnnouncement() {
    state.announcement = {
        enabled: document.getElementById('announcement-toggle').checked,
        badge: document.getElementById('announcement-badge').value.trim(),
        text: document.getElementById('announcement-text').value.trim()
    };
    renderStats();
    showToast("Annonce enregistrée ! Cliquez sur 'Publier' pour l'envoyer au jeu.", "success");
}

// SETTINGS
function saveSettings() {
    const key = document.getElementById('settings-key').value.trim();
    if (key) {
        localStorage.setItem('dabali_admin_key', key);
        adminKey = key;
        showToast("Clé secrète mise à jour avec succès !", "success");
    }
}

async function testApiConnection() {
    try {
        const res = await fetch('/api/game-config');
        if (res.ok) {
            const data = await res.json();
            showToast(`Connexion API réussie (v${data.version || '1.0'}) !`, "success");
        } else {
            showToast(`Erreur HTTP : ${res.status}`, "error");
        }
    } catch(e) {
        showToast("Erreur de connexion à l'API : " + e.message, "error");
    }
}

// PUBLISH TO CLOUD / API
async function syncConfigToCloud() {
    const btn = document.getElementById('sync-now-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Publication...`;
    btn.disabled = true;

    state.updatedAt = new Date().toISOString();
    localStorage.setItem('dabali_game_config', JSON.stringify(state));

    try {
        const res = await fetch('/api/game-config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Key': adminKey
            },
            body: JSON.stringify(state)
        });

        if (res.ok) {
            showToast("🎉 En direct ! Tous les joueurs reçoivent instantanément la mise à jour !", "success");
        } else {
            const err = await res.json();
            showToast(err.error || "Erreur lors de la publication.", "error");
        }
    } catch(e) {
        showToast("Sauvegardé localement. (Vérifiez la connexion réseau)", "info");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// TOAST NOTIFICATIONS
function showToast(message, type = "info") {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
}
