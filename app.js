/**
 * Application Web Directionnelle - OpenStreetMap
 * Affiche une flèche pointant vers une destination depuis la position utilisateur
 */

/**
 * Gestionnaire de destinations sauvegardées avec localStorage
 */
class DestinationManager {
    constructor() {
        this.storageKey = 'directional-map-destinations';
        this.destinations = this.loadDestinations();
    }

    /**
     * Charge les destinations depuis localStorage
     */
    loadDestinations() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('Erreur de chargement des destinations:', error);
            return [];
        }
    }

    /**
     * Sauvegarde les destinations dans localStorage
     */
    saveDestinations() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.destinations));
            return true;
        } catch (error) {
            console.error('Erreur de sauvegarde des destinations:', error);
            return false;
        }
    }

    /**
     * Ajoute une nouvelle destination
     */
    addDestination(name, lat, lng) {
        const destination = {
            id: this.generateId(),
            name: name.trim(),
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            createdAt: Date.now(),
            favorite: false
        };

        this.destinations.push(destination);
        this.saveDestinations();
        return destination;
    }

    /**
     * Supprime une destination par ID
     */
    deleteDestination(id) {
        const index = this.destinations.findIndex(d => d.id === id);
        if (index !== -1) {
            this.destinations.splice(index, 1);
            this.saveDestinations();
            return true;
        }
        return false;
    }

    /**
     * Récupère une destination par ID
     */
    getDestination(id) {
        return this.destinations.find(d => d.id === id);
    }

    /**
     * Récupère toutes les destinations
     */
    getAllDestinations() {
        return [...this.destinations];
    }

    /**
     * Toggle le statut favori d'une destination
     */
    toggleFavorite(id) {
        const destination = this.getDestination(id);
        if (destination) {
            destination.favorite = !destination.favorite;
            this.saveDestinations();
            return destination.favorite;
        }
        return false;
    }

    /**
     * Met à jour une destination
     */
    updateDestination(id, updates) {
        const destination = this.getDestination(id);
        if (destination) {
            Object.assign(destination, updates);
            this.saveDestinations();
            return destination;
        }
        return null;
    }

    /**
     * Génère un ID unique
     */
    generateId() {
        return `dest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Exporte les destinations en JSON
     */
    exportToJSON() {
        return JSON.stringify(this.destinations, null, 2);
    }

    /**
     * Importe des destinations depuis JSON
     */
    importFromJSON(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            if (Array.isArray(imported)) {
                this.destinations = imported;
                this.saveDestinations();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Erreur d\'importation:', error);
            return false;
        }
    }
}

class DirectionalMapApp {
    constructor() {
        // Configuration
        this.target = {
            lat: 48.858370,  // Tour Eiffel par défaut
            lng: 2.294481
        };

        // Gestionnaire de destinations
        this.destinationManager = new DestinationManager();

        // État de l'application
        this.map = null;
        this.userPosition = null;
        this.userMarker = null;
        this.targetMarker = null;
        this.geodesicLine = null;
        this.deviceHeading = 0;
        this.watchId = null;
        this.orientationEnabled = false;

        // Throttling
        this.lastOrientationUpdate = 0;
        this.orientationThrottle = 66; // ~15Hz max

        // Lissage de l'orientation (moyenne glissante)
        this.headingBuffer = [];
        this.headingBufferSize = 5;

        // Éléments DOM
        this.distanceContainer = document.getElementById('distance-container');
        this.distanceElement = document.getElementById('distance');
        this.statusElement = document.getElementById('status');

        // Initialisation
        this.init();
    }

    /**
     * Initialisation de l'application
     */
    async init() {
        try {
            // Vérifier HTTPS (requis pour géolocalisation et orientation)
            if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
                this.showStatus('⚠️ HTTPS requis pour la géolocalisation', 'warning', 0);
                return;
            }

            // Initialiser la carte
            this.initMap();

            // Charger la destination depuis l'URL si présente
            this.parseURLHash();

            // Initialiser le panneau de configuration
            this.initConfigPanel();

            // Démarrer la géolocalisation
            this.startGeolocation();

            // Démarrer l'orientation
            this.startOrientation();

        } catch (error) {
            console.error('Erreur d\'initialisation:', error);
            this.showStatus('❌ Erreur d\'initialisation', 'error', 0);
        }
    }

    /**
     * Initialise la carte Leaflet avec OpenStreetMap
     */
    initMap() {
        // Créer la carte centrée sur la France par défaut
        this.map = L.map('map', {
            center: [46.603354, 1.888334],
            zoom: 6,
            zoomControl: true,
            attributionControl: true
        });

        // Ajouter les tuiles OpenStreetMap
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(this.map);

        // Ajouter le marqueur de destination
        this.addTargetMarker();

        console.log('Carte initialisée avec succès');
    }

    /**
     * Ajoute le marqueur de la destination cible
     */
    addTargetMarker() {
        if (this.targetMarker) {
            this.map.removeLayer(this.targetMarker);
        }

        const targetIcon = L.divIcon({
            className: 'target-marker',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        this.targetMarker = L.marker([this.target.lat, this.target.lng], {
            icon: targetIcon,
            title: 'Destination'
        }).addTo(this.map);

        this.targetMarker.bindPopup('<b>Destination</b>');
    }

    /**
     * Démarre la géolocalisation de l'utilisateur
     */
    startGeolocation() {
        if (!navigator.geolocation) {
            this.showStatus('❌ Géolocalisation non disponible', 'error', 0);
            return;
        }

        this.showStatus('📍 Recherche de votre position...', 'info', 3000);

        const options = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        };

        this.watchId = navigator.geolocation.watchPosition(
            (position) => this.onPositionSuccess(position),
            (error) => this.onPositionError(error),
            options
        );
    }

    /**
     * Callback de succès de géolocalisation
     */
    onPositionSuccess(position) {
        const { latitude, longitude, accuracy } = position.coords;

        this.userPosition = { lat: latitude, lng: longitude };

        // Mettre à jour ou créer le marqueur utilisateur
        if (!this.userMarker) {
            const userIcon = L.divIcon({
                className: 'user-marker',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });

            this.userMarker = L.marker([latitude, longitude], {
                icon: userIcon,
                title: 'Vous êtes ici'
            }).addTo(this.map);

            // Centrer la carte entre l'utilisateur et la cible
            const bounds = L.latLngBounds([
                [this.userPosition.lat, this.userPosition.lng],
                [this.target.lat, this.target.lng]
            ]);
            this.map.fitBounds(bounds, { padding: [50, 50] });
        } else {
            this.userMarker.setLatLng([latitude, longitude]);
        }

        // Afficher la distance
        this.distanceContainer.classList.remove('hidden');

        // Mettre à jour la distance
        this.updateDirection();

        // Mettre à jour la ligne géodésique
        this.updateGeodesicLine();

        // Message de précision GPS
        if (accuracy > 100) {
            this.showStatus(`⚠️ Précision GPS: ±${Math.round(accuracy)}m`, 'warning', 5000);
        } else {
            this.showStatus('✓ Position acquise', 'info', 2000);
        }
    }

    /**
     * Callback d'erreur de géolocalisation
     */
    onPositionError(error) {
        let message = '❌ Erreur de géolocalisation';

        switch (error.code) {
            case error.PERMISSION_DENIED:
                message = '❌ Permission de géolocalisation refusée';
                break;
            case error.POSITION_UNAVAILABLE:
                message = '❌ Position indisponible';
                break;
            case error.TIMEOUT:
                message = '❌ Délai de géolocalisation expiré';
                break;
        }

        this.showStatus(message, 'error', 0);
        console.error('Erreur de géolocalisation:', error);
    }

    /**
     * Démarre l'écoute de l'orientation de l'appareil
     */
    async startOrientation() {
        // Tenter d'utiliser AbsoluteOrientationSensor d'abord (plus moderne)
        if ('AbsoluteOrientationSensor' in window) {
            try {
                const sensor = new AbsoluteOrientationSensor({ frequency: 15 });

                sensor.addEventListener('reading', () => {
                    this.onOrientationChange(sensor.quaternion);
                });

                sensor.addEventListener('error', (event) => {
                    console.warn('AbsoluteOrientationSensor error:', event.error);
                    this.fallbackToDeviceOrientation();
                });

                await sensor.start();
                this.orientationEnabled = true;
                console.log('AbsoluteOrientationSensor activé');
                return;
            } catch (error) {
                console.warn('AbsoluteOrientationSensor non disponible:', error);
            }
        }

        // Fallback sur DeviceOrientationEvent
        this.fallbackToDeviceOrientation();
    }

    /**
     * Utilise DeviceOrientationEvent en fallback
     */
    fallbackToDeviceOrientation() {
        if (window.DeviceOrientationEvent) {
            // iOS 13+ requiert une permission explicite
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                DeviceOrientationEvent.requestPermission()
                    .then(permissionState => {
                        if (permissionState === 'granted') {
                            this.attachOrientationListener();
                        } else {
                            this.showStatus('⚠️ Permission d\'orientation refusée', 'warning', 5000);
                        }
                    })
                    .catch(console.error);
            } else {
                // Android et anciens iOS
                this.attachOrientationListener();
            }
        } else {
            this.showStatus('⚠️ Capteur d\'orientation non disponible', 'warning', 5000);
        }
    }

    /**
     * Attache l'écouteur d'événement d'orientation
     */
    attachOrientationListener() {
        window.addEventListener('deviceorientationabsolute', (event) => {
            this.onDeviceOrientation(event);
        }, true);

        window.addEventListener('deviceorientation', (event) => {
            this.onDeviceOrientation(event);
        }, true);

        this.orientationEnabled = true;
        console.log('DeviceOrientationEvent activé');
    }

    /**
     * Callback d'orientation de l'appareil (DeviceOrientationEvent)
     */
    onDeviceOrientation(event) {
        // Throttling
        const now = Date.now();
        if (now - this.lastOrientationUpdate < this.orientationThrottle) {
            return;
        }
        this.lastOrientationUpdate = now;

        // Récupérer l'angle alpha (compass heading)
        let heading = event.alpha; // 0-360 degrés

        // Sur iOS, utiliser webkitCompassHeading si disponible (plus précis)
        if (event.webkitCompassHeading !== undefined) {
            heading = event.webkitCompassHeading;
        }

        if (heading !== null) {
            // Ajouter au buffer pour lissage
            this.headingBuffer.push(heading);
            if (this.headingBuffer.length > this.headingBufferSize) {
                this.headingBuffer.shift();
            }

            // Calculer la moyenne
            this.deviceHeading = this.averageHeading(this.headingBuffer);

            // Mettre à jour la direction
            this.updateDirection();
        }
    }

    /**
     * Callback d'orientation (AbsoluteOrientationSensor avec quaternion)
     */
    onOrientationChange(quaternion) {
        // Throttling
        const now = Date.now();
        if (now - this.lastOrientationUpdate < this.orientationThrottle) {
            return;
        }
        this.lastOrientationUpdate = now;

        // Convertir quaternion en heading
        const heading = this.quaternionToHeading(quaternion);

        if (heading !== null) {
            // Ajouter au buffer pour lissage
            this.headingBuffer.push(heading);
            if (this.headingBuffer.length > this.headingBufferSize) {
                this.headingBuffer.shift();
            }

            // Calculer la moyenne
            this.deviceHeading = this.averageHeading(this.headingBuffer);

            // Mettre à jour la direction
            this.updateDirection();
        }
    }

    /**
     * Convertit un quaternion en heading (0-360°)
     */
    quaternionToHeading(q) {
        if (!q || q.length < 4) return null;

        const [x, y, z, w] = q;

        // Calcul de l'angle de rotation autour de l'axe Z
        const heading = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));

        // Convertir en degrés et normaliser 0-360
        return this.normalizeDegrees(heading * (180 / Math.PI));
    }

    /**
     * Calcule la moyenne circulaire des angles
     */
    averageHeading(headings) {
        if (headings.length === 0) return 0;

        let sinSum = 0;
        let cosSum = 0;

        headings.forEach(heading => {
            const rad = heading * (Math.PI / 180);
            sinSum += Math.sin(rad);
            cosSum += Math.cos(rad);
        });

        const avgRad = Math.atan2(sinSum / headings.length, cosSum / headings.length);
        return this.normalizeDegrees(avgRad * (180 / Math.PI));
    }

    /**
     * Met à jour la distance affichée
     */
    updateDirection() {
        if (!this.userPosition) return;

        // Calculer et afficher la distance
        const distance = this.calculateDistance(
            this.userPosition.lat,
            this.userPosition.lng,
            this.target.lat,
            this.target.lng
        );

        this.distanceElement.textContent = this.formatDistance(distance);
    }

    /**
     * Calcule le bearing (azimut) entre deux points géographiques
     * Retourne l'angle en degrés (0-360)
     */
    calculateBearing(lat1, lng1, lat2, lng2) {
        const φ1 = lat1 * (Math.PI / 180);
        const φ2 = lat2 * (Math.PI / 180);
        const Δλ = (lng2 - lng1) * (Math.PI / 180);

        const y = Math.sin(Δλ) * Math.cos(φ2);
        const x = Math.cos(φ1) * Math.sin(φ2) -
                  Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

        const θ = Math.atan2(y, x);
        const bearing = θ * (180 / Math.PI);

        return this.normalizeDegrees(bearing);
    }

    /**
     * Calcule la distance entre deux points géographiques (formule haversine)
     * Retourne la distance en mètres
     */
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000; // Rayon de la Terre en mètres
        const φ1 = lat1 * (Math.PI / 180);
        const φ2 = lat2 * (Math.PI / 180);
        const Δφ = (lat2 - lat1) * (Math.PI / 180);
        const Δλ = (lng2 - lng1) * (Math.PI / 180);

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    /**
     * Calcule les points intermédiaires d'un great circle (orthodromie)
     * entre deux points géographiques
     * @param {number} lat1 - Latitude du point de départ
     * @param {number} lng1 - Longitude du point de départ
     * @param {number} lat2 - Latitude du point d'arrivée
     * @param {number} lng2 - Longitude du point d'arrivée
     * @param {number} numPoints - Nombre de points intermédiaires
     * @returns {Array} Tableau de points [lat, lng]
     */
    calculateGreatCircle(lat1, lng1, lat2, lng2, numPoints = 100) {
        const points = [];

        // Convertir en radians
        const φ1 = lat1 * (Math.PI / 180);
        const λ1 = lng1 * (Math.PI / 180);
        const φ2 = lat2 * (Math.PI / 180);
        const λ2 = lng2 * (Math.PI / 180);

        // Calculer la distance angulaire
        const Δφ = φ2 - φ1;
        const Δλ = λ2 - λ1;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

        const δ = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        // Interpolation sphérique (SLERP)
        for (let i = 0; i <= numPoints; i++) {
            const f = i / numPoints;

            // Formule d'interpolation great circle
            const A = Math.sin((1 - f) * δ) / Math.sin(δ);
            const B = Math.sin(f * δ) / Math.sin(δ);

            const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
            const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
            const z = A * Math.sin(φ1) + B * Math.sin(φ2);

            const φi = Math.atan2(z, Math.sqrt(x * x + y * y));
            const λi = Math.atan2(y, x);

            // Convertir en degrés
            const lat = φi * (180 / Math.PI);
            const lng = λi * (180 / Math.PI);

            points.push([lat, lng]);
        }

        return points;
    }

    /**
     * Met à jour ou crée la ligne géodésique sur la carte
     */
    updateGeodesicLine() {
        if (!this.userPosition) return;

        // Supprimer l'ancienne ligne si elle existe
        if (this.geodesicLine) {
            this.map.removeLayer(this.geodesicLine);
        }

        // Calculer les points du great circle
        const points = this.calculateGreatCircle(
            this.userPosition.lat,
            this.userPosition.lng,
            this.target.lat,
            this.target.lng
        );

        // Créer la ligne avec un style distinctif
        this.geodesicLine = L.polyline(points, {
            color: '#4ECDC4',
            weight: 3,
            opacity: 0.7,
            dashArray: '10, 10',
            lineJoin: 'round'
        }).addTo(this.map);

        // Ajouter une info-bulle
        this.geodesicLine.bindPopup('<b>Trajectoire orthodromique</b><br>Chemin le plus court sur la sphère terrestre');
    }

    /**
     * Normalise un angle en degrés sur l'intervalle [0, 360)
     */
    normalizeDegrees(degrees) {
        let normalized = degrees % 360;
        if (normalized < 0) {
            normalized += 360;
        }
        return normalized;
    }

    /**
     * Formate une distance pour l'affichage
     */
    formatDistance(meters) {
        if (meters < 1000) {
            return `${Math.round(meters)} m`;
        } else if (meters < 10000) {
            return `${(meters / 1000).toFixed(1)} km`;
        } else {
            return `${Math.round(meters / 1000)} km`;
        }
    }

    /**
     * Affiche un message de statut
     */
    showStatus(message, type = 'info', duration = 3000) {
        this.statusElement.textContent = message;
        this.statusElement.className = `status ${type}`;

        if (duration > 0) {
            setTimeout(() => {
                this.statusElement.classList.add('hidden');
            }, duration);
        }
    }

    /**
     * Initialise le panneau de configuration
     */
    initConfigPanel() {
        const toggleBtn = document.getElementById('toggle-config');
        const configContent = document.getElementById('config-content');
        const updateBtn = document.getElementById('update-target');
        const saveBtn = document.getElementById('save-destination');
        const shareBtn = document.getElementById('share-destination');
        const latInput = document.getElementById('target-lat');
        const lngInput = document.getElementById('target-lng');
        const nameInput = document.getElementById('destination-name');

        // Toggle panneau
        toggleBtn.addEventListener('click', () => {
            configContent.classList.toggle('hidden');
            if (!configContent.classList.contains('hidden')) {
                this.renderDestinations();
            }
        });

        // Mise à jour de la cible
        updateBtn.addEventListener('click', () => {
            const lat = parseFloat(latInput.value);
            const lng = parseFloat(lngInput.value);

            if (isNaN(lat) || isNaN(lng)) {
                this.showStatus('❌ Coordonnées invalides', 'error', 3000);
                return;
            }

            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                this.showStatus('❌ Coordonnées hors limites', 'error', 3000);
                return;
            }

            this.setTarget(lat, lng);
            configContent.classList.add('hidden');
            this.showStatus('✓ Destination mise à jour', 'info', 2000);
        });

        // Sauvegarde de la destination
        saveBtn.addEventListener('click', () => {
            const lat = parseFloat(latInput.value);
            const lng = parseFloat(lngInput.value);
            let name = nameInput.value.trim();

            if (isNaN(lat) || isNaN(lng)) {
                this.showStatus('❌ Coordonnées invalides', 'error', 3000);
                return;
            }

            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                this.showStatus('❌ Coordonnées hors limites', 'error', 3000);
                return;
            }

            // Générer un nom si vide
            if (!name) {
                name = `Destination ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            }

            this.destinationManager.addDestination(name, lat, lng);
            nameInput.value = '';
            this.renderDestinations();
            this.showStatus('✓ Destination sauvegardée', 'info', 2000);
        });

        // Partage de la destination
        shareBtn.addEventListener('click', () => {
            const name = nameInput.value.trim() || null;

            // Mettre à jour l'URL avec le nom si présent
            if (name) {
                this.updateURLHash(name);
            }

            // Copier l'URL dans le presse-papiers
            this.shareDestination();
        });

        // Rendu initial
        this.renderDestinations();
    }

    /**
     * Affiche la liste des destinations sauvegardées
     */
    renderDestinations() {
        const list = document.getElementById('saved-destinations-list');
        const emptyState = document.getElementById('empty-destinations');
        const destinations = this.destinationManager.getAllDestinations();

        // Vider la liste
        list.innerHTML = '';

        if (destinations.length === 0) {
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');

        // Trier : favoris d'abord, puis par date décroissante
        destinations.sort((a, b) => {
            if (a.favorite && !b.favorite) return -1;
            if (!a.favorite && b.favorite) return 1;
            return b.createdAt - a.createdAt;
        });

        // Créer les éléments
        destinations.forEach(dest => {
            const item = document.createElement('div');
            item.className = 'destination-item';

            const info = document.createElement('div');
            info.className = 'destination-info';
            info.innerHTML = `
                <div class="destination-name">${dest.favorite ? '⭐ ' : ''}${this.escapeHtml(dest.name)}</div>
                <div class="destination-coords">${dest.lat.toFixed(6)}, ${dest.lng.toFixed(6)}</div>
            `;
            info.addEventListener('click', () => this.loadDestination(dest.id));

            const actions = document.createElement('div');
            actions.className = 'destination-actions';

            // Bouton favori
            const favoriteBtn = document.createElement('button');
            favoriteBtn.className = `btn-icon ${dest.favorite ? 'favorite' : ''}`;
            favoriteBtn.innerHTML = dest.favorite ? '★' : '☆';
            favoriteBtn.title = 'Favori';
            favoriteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleFavorite(dest.id);
            });

            // Bouton partager
            const shareBtn = document.createElement('button');
            shareBtn.className = 'btn-icon share';
            shareBtn.innerHTML = '🔗';
            shareBtn.title = 'Partager';
            shareBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                // Charger temporairement la destination pour mettre à jour l'URL
                const oldTarget = { ...this.target };
                this.target = { lat: dest.lat, lng: dest.lng };
                this.updateURLHash(dest.name);
                await this.shareDestination();
                // Restaurer la cible précédente
                this.target = oldTarget;
            });

            // Bouton supprimer
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-icon delete';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.title = 'Supprimer';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteDestination(dest.id);
            });

            actions.appendChild(favoriteBtn);
            actions.appendChild(shareBtn);
            actions.appendChild(deleteBtn);

            item.appendChild(info);
            item.appendChild(actions);
            list.appendChild(item);
        });
    }

    /**
     * Charge une destination sauvegardée
     */
    loadDestination(id) {
        const dest = this.destinationManager.getDestination(id);
        if (dest) {
            this.setTarget(dest.lat, dest.lng, dest.name);
            document.getElementById('config-content').classList.add('hidden');
            this.showStatus(`✓ ${dest.name}`, 'info', 2000);
        }
    }

    /**
     * Définit une nouvelle cible
     */
    setTarget(lat, lng, name = null) {
        this.target = { lat, lng };
        this.addTargetMarker();
        this.updateDirection();
        this.updateGeodesicLine();

        // Mettre à jour l'URL pour le partage
        this.updateURLHash(name);

        // Recentrer la carte si l'utilisateur est positionné
        if (this.userPosition) {
            const bounds = L.latLngBounds([
                [this.userPosition.lat, this.userPosition.lng],
                [this.target.lat, this.target.lng]
            ]);
            this.map.fitBounds(bounds, { padding: [50, 50] });
        } else {
            this.map.setView([lat, lng], 13);
        }
    }

    /**
     * Toggle le statut favori d'une destination
     */
    toggleFavorite(id) {
        this.destinationManager.toggleFavorite(id);
        this.renderDestinations();
    }

    /**
     * Supprime une destination
     */
    deleteDestination(id) {
        if (confirm('Supprimer cette destination ?')) {
            this.destinationManager.deleteDestination(id);
            this.renderDestinations();
            this.showStatus('✓ Destination supprimée', 'info', 2000);
        }
    }

    /**
     * Échappe les caractères HTML pour éviter XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Parse le hash de l'URL pour charger une destination
     * Format: #lat,lng ou #lat,lng,nom
     * Exemple: #48.858370,2.294481,Tour%20Eiffel
     */
    parseURLHash() {
        const hash = window.location.hash.substring(1); // Retirer le #
        if (!hash) return;

        const parts = hash.split(',');
        if (parts.length < 2) return;

        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        const name = parts.length >= 3 ? decodeURIComponent(parts[2]) : null;

        // Valider les coordonnées
        if (isNaN(lat) || isNaN(lng)) {
            console.warn('Coordonnées invalides dans l\'URL:', hash);
            return;
        }

        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            console.warn('Coordonnées hors limites dans l\'URL:', hash);
            return;
        }

        // Charger la destination
        this.target = { lat, lng };
        this.addTargetMarker();

        // Afficher un message
        const message = name ? `📍 ${name}` : `📍 Destination partagée`;
        console.log('Destination chargée depuis l\'URL:', { lat, lng, name });

        // Mettre à jour les inputs
        document.getElementById('target-lat').value = lat;
        document.getElementById('target-lng').value = lng;
        if (name) {
            document.getElementById('destination-name').value = name;
        }
    }

    /**
     * Met à jour le hash de l'URL avec la destination actuelle
     */
    updateURLHash(name = null) {
        const lat = this.target.lat.toFixed(6);
        const lng = this.target.lng.toFixed(6);

        let hash = `#${lat},${lng}`;
        if (name) {
            hash += `,${encodeURIComponent(name)}`;
        }

        // Mettre à jour l'URL sans recharger la page
        history.replaceState(null, '', hash);
    }

    /**
     * Copie l'URL de partage dans le presse-papiers
     */
    async shareDestination() {
        const url = window.location.href;

        try {
            // Utiliser l'API Clipboard si disponible
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(url);
                this.showStatus('✓ Lien copié dans le presse-papiers', 'info', 2000);
            } else {
                // Fallback pour les navigateurs plus anciens
                const textarea = document.createElement('textarea');
                textarea.value = url;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                this.showStatus('✓ Lien copié', 'info', 2000);
            }
        } catch (error) {
            console.error('Erreur de copie:', error);
            // Afficher l'URL pour copie manuelle
            this.showStatus(`Lien: ${url}`, 'info', 5000);
        }
    }

    /**
     * Nettoyage lors de la destruction
     */
    destroy() {
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
        }

        window.removeEventListener('deviceorientation', this.onDeviceOrientation);
        window.removeEventListener('deviceorientationabsolute', this.onDeviceOrientation);

        if (this.geodesicLine && this.map) {
            this.map.removeLayer(this.geodesicLine);
        }

        if (this.map) {
            this.map.remove();
        }
    }
}

// Initialisation de l'application au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    window.app = new DirectionalMapApp();
});
