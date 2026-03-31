// App State & Persistence
let locations = JSON.parse(localStorage.getItem('aeroAtlasJournal')) || [];

// Loading Screen Logic
// Landing & Onboarding State
let onboarded = localStorage.getItem('aeroAtlas_onboarded') === 'true';
let userData = JSON.parse(localStorage.getItem('aeroAtlas_user')) || { name: '', avatar: '👦' };

// Loading Screen & Onboarding Initialization
window.addEventListener('load', () => {
    const loader = document.getElementById('loadingScreen');
    const landing = document.getElementById('landingOverlay');
    const app = document.getElementById('appContainer');

    if (loader) {
        setTimeout(() => {
            loader.classList.add('show-map');

            setTimeout(() => {
                loader.style.display = 'none';

                // Decide what to show after loader
                if (!onboarded) {
                    landing.classList.remove('hidden');
                    app.classList.add('initial-hide');
                } else {
                    landing.classList.add('hidden');
                    app.classList.remove('initial-hide');
                    
                    // Show User Badge if already onboarded
                    updateUserBadge();
                    
                    // Refresh map layout if shown immediately
                    setTimeout(() => map.invalidateSize(), 100);
                }
            }, 1000);
        }, 2200);
    }
});

// Update User Badge Display
function updateUserBadge() {
    const badge = document.getElementById('userProfileBadge');
    const bName = document.getElementById('badgeName');
    const bAvatar = document.getElementById('badgeAvatar');
    
    if (userData && userData.name) {
        bName.textContent = userData.name;
        bAvatar.textContent = userData.avatar || '👦';
        badge.classList.remove('hidden');
        badge.classList.remove('initial-hide');
    }
}

function saveLocations() {
    localStorage.setItem('aeroAtlasJournal', JSON.stringify(locations));
}

// ==========================================
// MAP INITIALIZATION
// ==========================================
// Initialize Leaflet Map
// Set default view to a generic center (e.g. general area, or user's last known)
const map = L.map('map', {
    zoomControl: false // Move zoom control if needed, or disable to keep it clean
}).setView([14.07, 121.32], 10);

// Add Zoom control to bottom right to match the map switcher
L.control.zoom({
    position: 'bottomright'
}).addTo(map);

// Define multiple base maps
const voyager = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; CARTO', maxZoom: 19
});
const positron = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; CARTO', maxZoom: 19
});
const darkMatter = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; CARTO', maxZoom: 19
});
const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri', maxZoom: 19
});

// Custom layer picker (see HTML #layerPicker and script below)
let currentLayer = voyager; // Initial default, will be overridden by setMapStyle in initialization


// We will keep a reference to drawn markers and lines to easily remove them
let markersLayer = L.layerGroup().addTo(map);
let pathLayer = L.featureGroup().addTo(map);

// Custom Map Icons
const baseIcon = L.divIcon({
    className: 'custom-pin',
    html: `<i class="fa-solid fa-location-dot" style="color: #fbbf24; font-size: 2rem; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5)); transform: translate(-50%, -100%);"></i>`,
    iconSize: [30, 42],
    iconAnchor: [0, 0] // Centered at bottom point due to translate hack
});

const searchIcon = L.divIcon({
    className: 'search-pin-pulse',
    html: `
        <div class="search-pulse-ring"></div>
        <i class="fa-solid fa-location-crosshairs"></i>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20] // Perfectly centered on coordinate
});


// ==========================================
// UI & MODAL INTERACTION
// ==========================================
const navBtns = document.querySelectorAll('.nav-btn');
const panels = document.querySelectorAll('.glass-panel');
const closeBtns = document.querySelectorAll('.close-btn, .close-toast-btn');

let lastNotificationTime = 0;
let lastNotificationMsg = '';

function showNotification(msg, isError = false) {
    // Avoid duplicate notifications within a short time
    const now = Date.now();
    if (msg === lastNotificationMsg && now - lastNotificationTime < 500) return;

    lastNotificationTime = now;
    lastNotificationMsg = msg;

    const cont = document.getElementById('notifications');
    const toast = document.createElement('div');
    toast.className = 'notification';
    toast.style.borderLeftColor = isError ? 'var(--danger)' : 'var(--c-action)';
    toast.innerHTML = msg;
    cont.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'panelHide 0.3s ease-in forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Unified Modal/Panel Close
function closeAllPanels() {
    panels.forEach(p => {
        if (!p.classList.contains('hidden')) {
            p.classList.add('closing');
            setTimeout(() => {
                p.classList.add('hidden');
                p.classList.remove('closing');
            }, 300);
        }
    });
    navBtns.forEach(b => {
        b.classList.remove('active');
        const radio = b.querySelector('input[type="radio"]');
        if (radio) radio.checked = false;
    });

    // Reset Specific Tool States on Close
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    if (searchInput) searchInput.value = '';
    if (searchResults) searchResults.innerHTML = '';

    const addForm = document.getElementById('addLocationForm');
    if (addForm) addForm.reset();

    // Clear temporary search marker if exists (unless explicitly kept by a keepTempMarker flag)
    if (tempSearchMarker && !window._keepTempMarker) {
        map.removeLayer(tempSearchMarker);
        tempSearchMarker = null;
    }

    // Reset Distance Tool
    resetDistanceTool();
}

// Open modals
navBtns.forEach(btn => {
    btn.addEventListener('click', function (e) {
        // Prevent default label click behavior which clicks sibling input to avoid double-triggers
        if (e.target.tagName === 'INPUT') return;

        // Special case for Clear All - allow it to stay active until switched
        if (this.id === 'clearAllBtn') {
            this.classList.add('active');
            clearAll();
            return;
        }

        const targetId = btn.getAttribute('data-target');
        const targetPanel = document.getElementById(targetId);

        // If already open, do nothing (keep it open as per user request)
        if (!targetPanel.classList.contains('hidden')) return;

        closeAllPanels();

        // Toggle desired panel
        targetPanel.classList.remove('hidden');
        btn.classList.add('active');
        const radio = btn.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;

        // Setup specialized data when opening
        if (targetId === 'journalPanel') renderJournal();
        if (targetId === 'distanceModal') populateDistanceDropdowns();
    });
});

// Close buttons
closeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        closeAllPanels();
    });
});

// ==========================================
// RENDER MARKERS
// ==========================================
function renderMarkers() {
    markersLayer.clearLayers();
    locations.forEach(loc => {
        // Create custom div icon based on user's color and emoji
        const customIcon = L.divIcon({
            className: 'custom-marker',
            html: `
                <div class="marker-pin-wrapper">
                    <svg width="36" height="46" viewBox="0 0 36 46" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18 0C8.058 0 0 8.058 0 18C0 29.826 18 46 18 46C18 46 36 29.826 36 18C36 8.058 27.942 0 18 0Z" fill="${loc.color || '#ffc107'}"/>
                        <circle cx="18" cy="18" r="14" fill="white" fill-opacity="0.2"/>
                    </svg>
                    <span class="marker-emoji">${loc.emoji || '📸'}</span>
                </div>
            `,
            iconSize: [36, 46],
            iconAnchor: [18, 46],
            popupAnchor: [0, -40]
        });

        const marker = L.marker([loc.lat, loc.lng], { icon: customIcon }).addTo(markersLayer);

        marker.on('click', () => {
            // Create sleek popup content
            const popupContent = `
                <div class="popup-content">
                    <div class="popup-header">${loc.name}</div>
                    <span class="popup-coords">${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}</span>
                    <p class="popup-desc">${loc.description || 'No description provided.'}</p>
                    <div class="popup-time">${loc.timestamp}</div>
                </div>
            `;

            // Open popup
            const popup = L.popup({
                closeButton: false,
                offset: [0, -35],
                className: 'glass-popup'
            })
                .setLatLng([loc.lat, loc.lng])
                .setContent(popupContent)
                .openOn(map);

            // Auto-close after 4 seconds
            setTimeout(() => {
                if (map.hasLayer(popup)) map.closePopup();
            }, 4000);

            map.panTo([loc.lat, loc.lng]);
        });
    });
}


// ==========================================
// ADD LOCATION LOGIC
// ==========================================
const addForm = document.getElementById('addLocationForm');

addForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const newLoc = {
        id: Date.now().toString(),
        name: document.getElementById('addName').value,
        lat: parseFloat(document.getElementById('addLat').value),
        lng: parseFloat(document.getElementById('addLng').value),
        description: document.getElementById('addDesc').value,
        emoji: document.querySelector('input[name="pinEmoji"]:checked').value,
        color: document.querySelector('input[name="pinColor"]:checked').value,
        timestamp: new Date().toLocaleString()
    };

    locations.push(newLoc);
    saveLocations();
    renderMarkers();

    // Clear search markers if we came from a search
    if (tempSearchMarker) {
        map.removeLayer(tempSearchMarker);
        tempSearchMarker = null;
    }

    addForm.reset();
    document.getElementById('addModal').classList.add('hidden');
    document.querySelector('[data-target="addModal"]').classList.remove('active');

    map.flyTo([newLoc.lat, newLoc.lng], 13);
    showNotification(`Added ${newLoc.name} to Journal!`);
});

// ==========================================
// SMART SEARCH LOGIC (Nominatim API)
// ==========================================
const searchBtn = document.getElementById('searchBtn');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
let tempSearchMarker = null;

async function performSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    searchResults.innerHTML = '<div style="color:var(--c-action); font-weight: 500;">Searching...</div>';

    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
        const data = await response.json();

        searchResults.innerHTML = '';
        if (data.length === 0) {
            searchResults.innerHTML = '<div style="color:var(--text-secondary);">No results found.</div>';
            return;
        }

        data.forEach(place => {
            const item = document.createElement('div');
            item.className = 'search-item';
            item.innerHTML = `
                <div class="search-item-title">${place.name || place.display_name.split(',')[0]}</div>
                <div class="search-item-desc">${place.display_name}</div>
            `;
            item.addEventListener('click', () => {
                selectSearchResult(place);
            });
            searchResults.appendChild(item);
        });

    } catch (err) {
        searchResults.innerHTML = '<div style="color:var(--danger);">Error connecting to search service.</div>';
    }
}

function selectSearchResult(place) {
    const lat = parseFloat(place.lat);
    const lng = parseFloat(place.lon);

    if (tempSearchMarker) map.removeLayer(tempSearchMarker);

    tempSearchMarker = L.marker([lat, lng], { icon: searchIcon }).addTo(map);
    map.trackSearchMarker = tempSearchMarker; // Reference for later cleanup if needed

    map.flyTo([lat, lng], 14);

    // Auto populate ADD form and open it
    // Use unified closeAllPanels to reset all nav states first
    window._keepTempMarker = true; // Temporary flag to prevent closure cleanup
    closeAllPanels();
    window._keepTempMarker = false; // Reset flag immediately

    // Brief timeout to ensure smooth state transition
    setTimeout(() => {
        const addModal = document.getElementById('addModal');
        const addBtn = document.querySelector('[data-target="addModal"]');

        addModal.classList.remove('hidden');
        if (addBtn) {
            addBtn.classList.add('active');
            const radio = addBtn.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
        }

        document.getElementById('addName').value = place.name || place.display_name.split(',')[0];
        document.getElementById('addLat').value = lat.toFixed(6);
        document.getElementById('addLng').value = lng.toFixed(6);
        document.getElementById('addDesc').value = place.display_name;
    }, 100);
}

searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
});


// ==========================================
// JOURNAL LIST LOGIC
// ==========================================
function renderJournal() {
    const list = document.getElementById('journalList');
    const emptyState = document.getElementById('emptyState');

    list.innerHTML = '';

    if (locations.length === 0) {
        list.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    list.classList.remove('hidden');
    emptyState.classList.add('hidden');

    locations.forEach(loc => {
        const li = document.createElement('li');
        li.className = 'journal-item';
        li.innerHTML = `
            <div class="item-info">
                <h4>${loc.name}</h4>
                <div class="item-coords">${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}</div>
                <div class="item-desc">${loc.description || 'No notes.'}</div>
            </div>
            <div class="item-actions">
                <button class="view-btn" title="View on Map"><i class="fa-solid fa-eye"></i></button>
                <button class="del-btn" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;

        li.querySelector('.view-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            map.flyTo([loc.lat, loc.lng], 15);
        });

        li.querySelector('.del-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteLocation(loc.id);
        });

        list.appendChild(li);
    });
}

function deleteLocation(id) {
    const loc = locations.find(l => l.id === id);
    if (!loc) return;

    showConfirm(`Delete <strong>${loc.name}</strong> from journal?`, () => {
        locations = locations.filter(l => l.id !== id);
        saveLocations();
        renderMarkers();
        renderJournal();
        showNotification("Location removed.");

        // If distance was pointing to this, reset it
        resetDistanceTool();
    });
}

// ==========================================
// CUSTOM CONFIRMATION LOGIC
// ==========================================
let confirmCallback = null;

function showConfirm(message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    const msgEl = document.getElementById('confirmMsg');

    msgEl.innerHTML = message;
    confirmCallback = onConfirm;

    modal.classList.remove('hidden');
}

function resetConfirmModal() {
    confirmCallback = null;
}

document.getElementById('confirmAction').addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    document.getElementById('confirmModal').classList.add('hidden');
    resetConfirmModal();
    // Maintain active highlight/radio after confirm for parity
    const btn = document.getElementById('clearAllBtn');
    btn.classList.add('active');
    const radio = btn.querySelector('input[type="radio"]');
    if (radio) radio.checked = true;
});

document.getElementById('confirmCancel').addEventListener('click', () => {
    document.getElementById('confirmModal').classList.add('hidden');
    resetConfirmModal();
    // Reverted persistence: Cancel now fully closes out the tool like the 'X' button
    closeAllPanels();
});

// ==========================================
// DISTANCE CALCULATOR
// ==========================================
// Reset distance tool state
function resetDistanceTool() {
    if (pathLayer) pathLayer.clearLayers();
    const distResult = document.getElementById('distResult');
    if (distResult) {
        distResult.classList.add('hidden');
        // Clear value to prevent lingering stale data
        const distVal = document.getElementById('distVal');
        if (distVal) distVal.textContent = "0.00";
    }
    document.getElementById('distSelectA').value = "";
    document.getElementById('distSelectB').value = "";
}

function populateDistanceDropdowns() {
    resetDistanceTool(); // Reset whenever we re-populate
    const selA = document.getElementById('distSelectA');
    const selB = document.getElementById('distSelectB');

    selA.innerHTML = '<option value="" disabled selected>Select a location</option>';
    selB.innerHTML = '<option value="" disabled selected>Select a location</option>';

    locations.forEach(loc => {
        const optA = document.createElement('option');
        optA.value = loc.id;
        optA.textContent = loc.name;
        selA.appendChild(optA);

        const optB = document.createElement('option');
        optB.value = loc.id;
        optB.textContent = loc.name;
        selB.appendChild(optB);
    });
}

// Haversine formula
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

document.getElementById('calcDistBtn').addEventListener('click', () => {
    const idA = document.getElementById('distSelectA').value;
    const idB = document.getElementById('distSelectB').value;

    if (!idA || !idB) {
        showNotification("Please select two locations.", true);
        return;
    }
    if (idA === idB) {
        showNotification("Select two different locations.", true);
        return;
    }

    const locA = locations.find(l => l.id === idA);
    const locB = locations.find(l => l.id === idB);

    const dist = getDistanceFromLatLonInKm(locA.lat, locA.lng, locB.lat, locB.lng);

    document.getElementById('distResult').classList.remove('hidden');
    document.getElementById('distVal').textContent = dist.toFixed(2);

    // Draw Path (Advanced Feature)
    pathLayer.clearLayers();
    const latlngs = [
        [locA.lat, locA.lng],
        [locB.lat, locB.lng]
    ];
    // Create polyline
    const polyline = L.polyline(latlngs, { color: 'var(--gold-accent)', weight: 4, dashArray: '10, 10' }).addTo(pathLayer);

    // Zoom to fit path
    map.fitBounds(polyline.getBounds(), { padding: [50, 50] });

    showNotification("Distance calculated!");
});


// ==========================================
document.getElementById('clearAllBtn').addEventListener('click', (e) => {
    if (e.target.tagName === 'INPUT') return;

    // Modal Shield: If already open, do nothing (prevents disappearing/reset when clicking again)
    if (!document.getElementById('confirmModal').classList.contains('hidden')) return;

    if (locations.length === 0) {
        showNotification("Journal is already empty.");
        return;
    }

    // Smoothly close any open modals first
    closeAllPanels();

    // Ensure standard parity radio states
    const radio = document.querySelector('#clearAllBtn input[type="radio"]');
    if (radio) radio.checked = true;
    document.getElementById('clearAllBtn').classList.add('active');

    // Brief delay to allow panels to close before the prompt appears
    setTimeout(() => {
        showConfirm("Clear all locations and reset your profile? This will return you to the landing page.", () => {
            document.body.classList.add('closing');

            // Full Reset
            localStorage.removeItem('aeroAtlasJournal');
            localStorage.removeItem('aeroAtlas_onboarded');
            localStorage.removeItem('aeroAtlas_user');

            setTimeout(() => {
                window.location.reload();
            }, 800);
        });
    }, 100);
});


// ==========================================
// CUSTOM MAP LAYER PICKER
// ==========================================
const layerPickerMenu = document.getElementById('layerPickerMenu');
const layerPickerBtn = document.getElementById('layerPickerBtn');
const layerPickerIcon = document.getElementById('layerPickerIcon');

const layerMap = {
    voyager: voyager,
    positron: positron,
    darkMatter: darkMatter,
    satellite: satellite
};

// Toggle the popup open/close
layerPickerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    layerPickerMenu.classList.toggle('hidden');
});

// Close popup when clicking anywhere on map
document.getElementById('map').addEventListener('click', () => {
    layerPickerMenu.classList.add('hidden');
});

// Function to switch map layers and persist choice
function setMapStyle(key, save = true) {
    if (!layerMap[key]) return;

    // Remove old layer
    if (currentLayer) map.removeLayer(currentLayer);

    // Set and add new layer
    currentLayer = layerMap[key];
    currentLayer.addTo(map);

    // Toggle dark-tiles class so UI adapts contrast for dark/satellite maps
    if (key === 'darkMatter' || key === 'satellite') {
        document.body.classList.add('dark-tiles');
    } else {
        document.body.classList.remove('dark-tiles');
    }

    // Update active state in the menu
    layerPickerMenu.querySelectorAll('.layer-option').forEach(o => {
        if (o.getAttribute('data-layer') === key) {
            o.classList.add('active');
            // Update button preview icon to match the selected style
            document.getElementById('layerPickerIcon').className = o.querySelector('i').className;
        } else {
            o.classList.remove('active');
        }
    });

    // Persist to localStorage
    if (save) localStorage.setItem('aeroAtlas_mapStyle', key);
}

// Switch layer when an option is clicked
layerPickerMenu.querySelectorAll('.layer-option').forEach(option => {
    option.addEventListener('click', () => {
        const key = option.getAttribute('data-layer');
        setMapStyle(key);
        layerPickerMenu.classList.add('hidden');
    });
});

// INITIALIZATION KICK-OFF
const savedStyle = localStorage.getItem('aeroAtlas_mapStyle') || 'voyager';
setMapStyle(savedStyle, false); // Load saved style without re-saving

renderMarkers();
if (locations.length > 0) {
    // If locations exist, center on the first one
    map.flyTo([locations[0].lat, locations[0].lng], 8);
}

// ==========================================
// LANDING & ONBOARDING INTERACTION
// ==========================================
const getStartedBtn = document.getElementById('getStartedBtn');
const onboardingModal = document.getElementById('onboardingModal');
const onboardingForm = document.getElementById('onboardingForm');
const closeOnboarding = document.getElementById('closeOnboarding');

if (getStartedBtn) {
    getStartedBtn.addEventListener('click', () => {
        onboardingModal.classList.remove('hidden');
    });
}

if (closeOnboarding) {
    closeOnboarding.addEventListener('click', () => {
        onboardingModal.classList.add('hidden');
    });
}

if (onboardingForm) {
    onboardingForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const nickname = document.getElementById('userNickname').value;
        const avatar = document.querySelector('input[name="userAvatar"]:checked').value;
        userData = { name: nickname, avatar: avatar };

        // Finalize state
        onboarded = true;
        localStorage.setItem('aeroAtlas_onboarded', 'true');
        localStorage.setItem('aeroAtlas_user', JSON.stringify(userData));

        // Hide form and show high-tech loader
        onboardingForm.classList.add('hidden');
        const loader = document.getElementById('onboardingLoader');
        const percentEl = document.getElementById('syncPercent');
        loader.classList.remove('hidden');

        // Dynamic Percentage Counter (1-100% over 1.8s)
        let percent = 1;
        const syncInterval = setInterval(() => {
            percent += 2; // Increment by 2 for faster feel
            if (percent > 100) percent = 100;
            percentEl.textContent = `${percent}%`;
            if (percent === 100) clearInterval(syncInterval);
        }, 30); // ~1.5s total count finish

        // Experience the holographic sync before entering the map
        setTimeout(() => {
            clearInterval(syncInterval); // Cleanup
            percentEl.textContent = '100%';
            // Close the modal and show app
            onboardingModal.classList.add('hidden');
            
            const landing = document.getElementById('landingOverlay');
            const app = document.getElementById('appContainer');
            landing.style.opacity = '0';
            
            setTimeout(() => {
                landing.classList.add('hidden');
                app.classList.remove('initial-hide');
                app.classList.remove('hidden');
                
                // Show User Badge
                updateUserBadge();

                setTimeout(() => {
                    map.invalidateSize();
                    showNotification(`System Sync Complete. Welcome, ${nickname}! 🌏`);
                }, 200);
            }, 800);
        }, 1800); // 1.8s Sync Delay
    });
}
