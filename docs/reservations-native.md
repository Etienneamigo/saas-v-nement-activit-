# Réservation Native — Documentation interne

## Vue d'ensemble

Le système de réservation native permet aux établissements de recevoir des réservations directement sur la plateforme, sans passer par un outil externe (Calendly, etc.).

Il est **optionnel et activable par établissement**. Le lien de réservation externe reste disponible et peut coexister avec la réservation native.

---

## Configurer un établissement

### 1. Accéder aux paramètres

Dashboard établissement → **Réservations** (menu header ou carte rapide)

### 2. Activer la réservation native

- Cocher **"Activer les réservations natives"**
- Optionnel : cocher **"Afficher aussi le lien externe"** pour garder le bouton Calendly/autre en secondaire

### 3. Configurer les créneaux

| Champ | Valeur par défaut | Description |
|---|---|---|
| Durée d'un créneau | 60 min | Durée fixe de chaque réservation |
| Capacité par créneau | 10 | Nombre max de personnes sur un même créneau |
| Taille min groupe | 1 | Minimum de personnes par réservation |
| Taille max groupe | 10 | Maximum de personnes par réservation |
| Délai minimum | 120 min | Impossible de réserver si le créneau est dans < X min |
| Fenêtre réservation | 30 jours | Les clients ne peuvent réserver que jusqu'à J+30 |

### 4. Définir les horaires d'ouverture

Pour chaque jour de semaine (Lundi–Dimanche), ajouter des plages horaires :
- Format : HH:mm – HH:mm (ex : 09:00 – 12:00, 14:00 – 18:00)
- Un jour sans plage = **Fermé**

### 5. Gérer les exceptions

- Ajouter une date → choisir "Fermé" pour bloquer cette journée
- Les exceptions custom permettront bientôt de définir des horaires ponctuels différents

### 6. Champs personnalisés

Ajouter des champs demandés au client lors de la réservation :
- Types : Texte, Texte long, Nombre, Téléphone, Email, Choix (liste), Case à cocher
- Chaque champ peut être **requis** ou optionnel
- Pour le type "Choix", saisir les options une par ligne

### 7. Messages

- **Message de confirmation** : affiché au client après réservation
- **Politique d'annulation** : affiché avant que le client valide

---

## Exemples de payloads API

### Récupérer les créneaux disponibles

```
GET /api/establishments/{id}/reservations/availability?date=2026-03-15
```

Réponse :
```json
{
  "slots": [
    {
      "startAt": "2026-03-15T09:00:00.000Z",
      "endAt": "2026-03-15T10:00:00.000Z",
      "remainingCapacity": 8,
      "isAvailable": true
    },
    {
      "startAt": "2026-03-15T10:00:00.000Z",
      "endAt": "2026-03-15T11:00:00.000Z",
      "remainingCapacity": 0,
      "isAvailable": false
    }
  ]
}
```

### Créer une réservation

```
POST /api/establishments/{id}/reservations
Content-Type: application/json
```

Body :
```json
{
  "startAt": "2026-03-15T09:00:00.000Z",
  "partySize": 4,
  "customerName": "Jean Dupont",
  "customerEmail": "jean@example.com",
  "customerPhone": "0612345678",
  "customFieldValues": {
    "cuid_du_champ_1": "Anniversaire",
    "cuid_du_champ_2": "Oui"
  }
}
```

Réponse 201 :
```json
{
  "reservation": {
    "id": "clxxx...",
    "startAt": "2026-03-15T09:00:00.000Z",
    "endAt": "2026-03-15T10:00:00.000Z",
    "partySize": 4,
    "status": "CONFIRMED",
    "customerName": "Jean Dupont",
    "customerEmail": "jean@example.com"
  }
}
```

Réponse 409 (créneau complet) :
```json
{
  "error": "Ce créneau est complet. Veuillez choisir un autre horaire."
}
```

### Annuler une réservation

```
POST /api/reservations/{reservationId}/cancel
```

### Lister les réservations (owner)

```
GET /api/establishments/{id}/reservations?dateFrom=2026-03-01&dateTo=2026-03-31&status=CONFIRMED
```

### Mettre à jour les paramètres (owner)

```
PUT /api/establishments/{id}/reservations/settings
Content-Type: application/json

{
  "enabled": true,
  "showExternalLinkAlso": false,
  "timezone": "Europe/Paris",
  "slotDurationMinutes": 60,
  "capacityPerSlot": 10,
  "minPartySize": 1,
  "maxPartySize": 8,
  "minNoticeMinutes": 120,
  "bookingWindowDays": 30,
  "cancellationEnabled": true,
  "cancellationDeadlineHours": 24,
  "confirmationMessage": "Merci ! Nous vous attendons.",
  "cancellationPolicyText": "Annulation gratuite jusqu'à 24h avant.",
  "weeklySchedule": {
    "1": [{"start":"09:00","end":"12:00"},{"start":"14:00","end":"18:00"}],
    "2": [{"start":"09:00","end":"18:00"}],
    "3": [{"start":"09:00","end":"18:00"}],
    "4": [{"start":"09:00","end":"18:00"}],
    "5": [{"start":"09:00","end":"18:00"}],
    "6": [{"start":"10:00","end":"16:00"}],
    "0": []
  },
  "customFieldDefs": [
    {
      "label": "Commentaire",
      "type": "TEXTAREA",
      "required": false,
      "order": 0
    },
    {
      "label": "Occasion spéciale",
      "type": "SELECT",
      "required": false,
      "optionsJson": ["Anniversaire","EVG/EVJF","Sortie d'entreprise","Autre"],
      "order": 1
    }
  ]
}
```

---

## Architecture technique

### Service d'availability (`src/lib/availability.ts`)

Fonction principale : `getAvailableSlots(establishmentId, date)` → `SlotInfo[]`

Logique :
1. Charge `ReservationSettings` + `WeeklySchedule` (1 requête)
2. Vérifie si la date est dans la fenêtre de réservation
3. Charge l'override pour cette date (1 requête)
4. Si override `isClosed` → retourne []
5. Détermine le `dayOfWeek` dans la timezone de l'établissement
6. Génère tous les créneaux à partir des plages horaires
7. Filtre les créneaux trop proches (minNotice)
8. Agrège les réservations confirmées sur la période (1 requête `groupBy`)
9. Retourne la capacité restante par créneau

### Anti-double booking (`createReservation`)

La création d'une réservation utilise une **transaction Prisma** :
1. Re-vérifie la capacité dans la transaction (agrégat `SUM(partySize)`)
2. Si capacité dépassée → throw `SLOT_FULL` → rollback → 409
3. Si OK → crée la réservation + valeurs des champs custom

Remarque : Pour un environnement très haute concurrence, un verrou pessimiste (`SELECT FOR UPDATE`) serait plus robuste, mais pour le MVP cet agrégat transactionnel est suffisant.

---

## Limites MVP & points d'extension

| Fonctionnalité | MVP | Extension future |
|---|---|---|
| Paiement | Non | Stripe Checkout à l'étape "formulaire" |
| Empreinte CB / acompte | Non | Stripe PaymentIntent |
| Email de confirmation | Non (UI seulement) | Nodemailer (SMTP déjà configuré dans le projet) |
| Gestion multi-staff | Non | Associer des créneaux à des ressources/employés |
| Rappel SMS | Non | Twilio / service tiers |
| Statut "No-show" | Enum existant | Interface admin pour le marquer |
| Surcharge de capacité partielle | Non | `customCapacity` dans les overrides (déjà en DB) |
| Horaires custom par exception | Partiel | UI à compléter (override sans fermeture) |
| isFavorited dans le feed | Oui (initial SSR) | Sync temps réel via optimistic UI |

---

## Commandes utiles

```bash
# Lancer les tests
npm test

# Voir les réservations en base
npx prisma studio

# Relancer les migrations après modif schema
npm run db:migrate
```
