# Application Web Directionnelle — OpenStreetMap

Application web responsive affichant une carte interactive avec une flèche indiquant la direction vers une destination cible depuis votre position.

## 🎯 Fonctionnalités

- **Carte interactive** : Affichage OpenStreetMap avec navigation
- **Géolocalisation GPS** : Localisation en temps réel de l'utilisateur
- **Position manuelle** : Définition manuelle de votre position (clic sur carte ou saisie de coordonnées)
- **Boussole directionnelle** : Flèche pointant vers la destination
- **Ligne géodésique** : Tracé orthodromique (great circle) tenant compte de la courbure terrestre
- **Calcul de distance** : Affichage de la distance jusqu'à la cible
- **Destinations sauvegardées** : Système de sauvegarde avec localStorage et favoris
- **Partage par URL** : Partage de destinations via hash fragment
- **Interface responsive** : Optimisée pour mobile et desktop
- **Configuration flexible** : Changement de destination à la volée

## 🚀 Installation

### Prérequis

- Serveur HTTPS (requis pour la géolocalisation et l'orientation)
- Navigateur moderne supportant :
  - Geolocation API
  - DeviceOrientationEvent
  - Chrome Android ou Safari iOS recommandés

### Déploiement local

```bash
# Option 1 : Python 3
python3 -m http.server 8000 --bind localhost

# Option 2 : Node.js avec http-server
npx http-server -p 8000

# Option 3 : PHP
php -S localhost:8000
```

Pour tester avec HTTPS en local :

```bash
# Avec http-server et certificat auto-signé
npx http-server -p 8443 -S -C cert.pem -K key.pem
```

### Déploiement production

L'application est constituée de fichiers statiques. Déployez simplement les fichiers sur :
- GitHub Pages (avec HTTPS automatique)
- Netlify
- Vercel
- Tout serveur web avec support HTTPS

## 📱 Utilisation

### Mode GPS (par défaut)
1. **Autoriser la géolocalisation** : Acceptez la demande de permission GPS
2. **Autoriser l'orientation** (iOS) : Acceptez la demande de permission boussole
3. **Visualiser la trajectoire** : Une ligne pointillée bleue montre le chemin orthodromique (great circle) tenant compte de la courbure terrestre
4. **Observer votre position** : Un marqueur bleu indique votre position GPS

### Mode Position Manuelle
Si le GPS n'est pas disponible (en intérieur, permission refusée, etc.) :
1. **Ouvrir le panneau de configuration** : Cliquez sur ⚙️ en bas à droite
2. **Activer le mode manuel** : Sélectionnez "📌 Position manuelle"
3. **Définir votre position** :
   - **Option 1 - Clic sur carte** : Cliquez sur "📍 Cliquer sur la carte" puis sur votre position
   - **Option 2 - Coordonnées** : Saisissez latitude et longitude manuellement
4. **Observer votre position** : Un marqueur orange indique votre position manuelle

### Gérer les destinations
1. **Changer de destination** :
   - Ouvrez le panneau de configuration (⚙️)
   - Entrez les nouvelles coordonnées (latitude, longitude)
   - Cliquez sur "Aller à cette destination"

2. **Sauvegarder une destination** :
   - Définissez la destination souhaitée
   - Donnez-lui un nom (optionnel)
   - Cliquez sur "💾 Sauvegarder cette destination"

3. **Partager une destination** :
   - Cliquez sur "🔗 Partager cette destination"
   - L'URL est copiée dans le presse-papiers
   - Partagez le lien par SMS, email, messagerie, etc.

4. **Charger une destination sauvegardée** :
   - Cliquez sur une destination dans la liste
   - Ajoutez-la en favoris avec ★
   - Partagez-la avec 🔗
   - Supprimez-la avec 🗑️

## 🛠️ Technologies

### Frontend
- **HTML5** : Structure sémantique
- **CSS3** : Styles responsive avec variables CSS
- **JavaScript ES6+** : Logique applicative orientée objet

### Bibliothèques
- **Leaflet 1.9.4** : Cartographie interactive
- **OpenStreetMap** : Données cartographiques

### APIs navigateur
- **Geolocation API** : Position GPS avec `watchPosition`
- **DeviceOrientationEvent** : Orientation/boussole
- **AbsoluteOrientationSensor** : Capteur d'orientation moderne (fallback)

## 📐 Architecture

```
direction-on-map/
├── index.html          # Structure de l'application
├── styles.css          # Styles mobile-first
├── app.js              # Logique applicative
├── README.md           # Documentation
└── LICENSE             # Licence
```

### Classes principales

**`DestinationManager`** : Gestion des destinations sauvegardées
- `loadDestinations()` : Charge les destinations depuis localStorage
- `addDestination()` : Ajoute une nouvelle destination
- `deleteDestination()` : Supprime une destination
- `toggleFavorite()` : Toggle le statut favori
- `getAllDestinations()` : Récupère toutes les destinations

**`DirectionalMapApp`** : Classe principale de l'application
- `initMap()` : Initialisation de la carte Leaflet
- `startGeolocation()` : Démarrage du suivi GPS
- `startOrientation()` : Activation des capteurs d'orientation
- `setPositionMode()` : Bascule entre mode GPS et manuel
- `setManualPosition()` : Définit une position manuelle
- `enableMapClickMode()` : Active le mode clic sur carte
- `calculateBearing()` : Calcul de l'azimut vers la cible
- `calculateDistance()` : Calcul de la distance (formule haversine)
- `calculateGreatCircle()` : Calcul des points intermédiaires orthodromiques (SLERP)
- `updateGeodesicLine()` : Affichage de la ligne géodésique sur la carte
- `updateDirection()` : Mise à jour de la distance
- `parseURLHash()` : Charge une destination depuis l'URL
- `shareDestination()` : Copie l'URL de partage dans le presse-papiers

## 🧮 Calculs géographiques

### Bearing (Azimut)
```javascript
// Calcul du bearing entre deux points
bearing = atan2(
    sin(Δλ) × cos(φ2),
    cos(φ1) × sin(φ2) − sin(φ1) × cos(φ2) × cos(Δλ)
)
```

### Distance (Haversine)
```javascript
// Calcul de la distance sphérique
a = sin²(Δφ/2) + cos(φ1) × cos(φ2) × sin²(Δλ/2)
c = 2 × atan2(√a, √(1−a))
distance = R × c  // R = rayon terrestre (6371 km)
```

### Angle relatif
```javascript
// Angle de rotation de la flèche
angleAffiché = bearing_cible − heading_appareil
```

### Ligne géodésique (Great Circle / Orthodromie)
La ligne tracée entre votre position et la destination représente le **chemin le plus court** sur la sphère terrestre (trajectoire orthodromique). Cette ligne est calculée par interpolation sphérique (SLERP) :

```javascript
// Pour chaque point intermédiaire (fraction f entre 0 et 1)
δ = distance_angulaire  // calculée avec Haversine
A = sin((1-f) × δ) / sin(δ)
B = sin(f × δ) / sin(δ)

// Coordonnées cartésiennes 3D
x = A × cos(φ1) × cos(λ1) + B × cos(φ2) × cos(λ2)
y = A × cos(φ1) × sin(λ1) + B × cos(φ2) × sin(λ2)
z = A × sin(φ1) + B × sin(φ2)

// Retour en coordonnées sphériques
lat = atan2(z, √(x² + y²))
lng = atan2(y, x)
```

Cette ligne suit la courbure de la Terre et représente la direction réelle que suivrait un avion ou un navire. Sur de grandes distances, elle peut différer significativement d'une ligne droite sur une projection de Mercator.

## ⚙️ Optimisations

### Performance
- **Throttling** : Limitation à ~15Hz pour les événements d'orientation
- **Lissage** : Moyenne glissante sur 5 valeurs pour stabiliser l'orientation
- **Lazy updates** : Mise à jour uniquement si nécessaire

### Précision
- `enableHighAccuracy: true` pour la géolocalisation
- Support des deux APIs d'orientation (AbsoluteOrientationSensor + DeviceOrientationEvent)
- Gestion du `webkitCompassHeading` sur iOS

## 🔒 Sécurité et confidentialité

- ✅ Données persistées uniquement en local (localStorage)
- ✅ Aucun tracking utilisateur
- ✅ Aucune connexion à un backend
- ✅ Dépendances open source uniquement (Leaflet)
- ✅ Fonctionnement 100% client-side
- ✅ Partage sécurisé via hash fragment (pas envoyé au serveur)

## ⚠️ Limitations connues

### Précision directionnelle
- La précision dépend fortement du matériel (qualité de la boussole)
- Les résultats peuvent varier selon l'appareil
- L'utilisation en intérieur ou près de masses métalliques peut affecter la boussole

### Compatibilité
- iOS requiert une interaction utilisateur pour activer DeviceOrientationEvent
- La précision GPS peut être limitée en intérieur
- Les fonctionnalités sont optimales en extérieur avec bon signal GPS

### Usage recommandé
- **Informatif uniquement** : Ne pas utiliser pour de la navigation instrumentale
- **Ponctuel** : Conçu pour un usage occasionnel
- **Extérieur** : Meilleurs résultats en extérieur avec vue dégagée du ciel

## 🌐 Compatibilité navigateurs

| Navigateur | Support | Notes |
|------------|---------|-------|
| Chrome Android | ✅ Excellent | Support complet |
| Safari iOS | ✅ Bon | Requiert permission explicite |
| Firefox Mobile | ⚠️ Partiel | Orientation limitée |
| Edge Mobile | ✅ Bon | Support complet |

## 📝 Configuration par défaut

### Destination
- **Latitude** : 48.858370 (Tour Eiffel)
- **Longitude** : 2.294481 (Paris, France)

### Position
- **Mode par défaut** : GPS automatique
- **Marqueur GPS** : Bleu
- **Marqueur manuel** : Orange

### Carte
- **Centre initial** : France (46.603354, 1.888334)
- **Zoom initial** : 6
- **Zoom max** : 19

### Capteurs
- **Fréquence orientation** : 15 Hz max
- **Buffer de lissage** : 5 valeurs
- **GPS enableHighAccuracy** : true

### Stockage
- **localStorage** : Destinations sauvegardées avec favoris
- **URL Hash** : Format `#lat,lng` ou `#lat,lng,nom`

## 🔧 Personnalisation

### Changer la destination par défaut

Modifiez dans `app.js` :
```javascript
this.target = {
    lat: 48.858370,  // Votre latitude
    lng: 2.294481    // Votre longitude
};
```

### Ajuster le lissage de l'orientation

Modifiez dans `app.js` :
```javascript
this.headingBufferSize = 5;  // Nombre de valeurs à moyenner (1-10)
this.orientationThrottle = 66;  // Délai en ms (66ms = ~15Hz)
```

### Personnaliser les couleurs

Modifiez les variables CSS dans `styles.css` :
```css
:root {
    --primary-color: #FF6B6B;
    --secondary-color: #4ECDC4;
    --text-color: #2C3E50;
}
```

## 🐛 Débogage

### Activer les logs dans la console
```javascript
// Dans app.js, les console.log sont déjà présents
// Ouvrez la console développeur du navigateur (F12)
```

### Tester sans appareil mobile
Les capteurs d'orientation ne fonctionnent que sur appareil mobile. Pour tester :
1. Utilisez Chrome DevTools > Device Mode
2. Activez "Sensors" dans les outils supplémentaires
3. Simulez l'orientation

## 🤝 Contribution

Les contributions sont bienvenues ! Pour contribuer :
1. Fork le projet
2. Créez une branche feature (`git checkout -b feature/AmazingFeature`)
3. Committez vos changements (`git commit -m 'Add AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

## 📄 Licence

Ce projet est distribué sous licence MIT. Voir le fichier `LICENSE` pour plus d'informations.

## 📚 Ressources

- [Leaflet Documentation](https://leafletjs.com/)
- [OpenStreetMap](https://www.openstreetmap.org/)
- [Geolocation API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)
- [DeviceOrientationEvent (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent)
- [Haversine Formula](https://en.wikipedia.org/wiki/Haversine_formula)

## 🙏 Remerciements

- OpenStreetMap contributors pour les données cartographiques
- Leaflet.js pour l'excellente bibliothèque de cartographie
- La communauté open source

---

**Note** : Cette application est fournie à titre informatif uniquement. La précision directionnelle n'est pas garantie et ne doit pas être utilisée pour de la navigation instrumentale.
