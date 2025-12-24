/**
 * Application Web Directionnelle - OpenStreetMap
 * Affiche une flèche pointant vers une destination depuis la position utilisateur
 */

class DirectionalMapApp {
    constructor() {
        // Configuration
        this.target = {
            lat: 48.858370,  // Tour Eiffel par défaut
            lng: 2.294481
        };

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
        const latInput = document.getElementById('target-lat');
        const lngInput = document.getElementById('target-lng');

        // Toggle panneau
        toggleBtn.addEventListener('click', () => {
            configContent.classList.toggle('hidden');
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

            this.target = { lat, lng };
            this.addTargetMarker();
            this.updateDirection();
            this.updateGeodesicLine();

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

            configContent.classList.add('hidden');
            this.showStatus('✓ Destination mise à jour', 'info', 2000);
        });
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
