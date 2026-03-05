# Mobile API Endpoints

All mobile endpoints live under `/api/mobile/...` and use **JWT Bearer** authentication (not NextAuth cookies).

## Authentication

Include the JWT token in the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

Obtain a token via `POST /api/mobile/login`.

### Standard error responses

| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid token |
| 403 | Valid token but insufficient permissions (not owner, wrong establishment) |
| 404 | Resource not found |

---

## Public Endpoints (no auth required)

### GET /api/mobile/activities
List published activities with filtering.

### GET /api/mobile/activities/[id]
Get activity details. Includes establishment accessibility fields:
- `accessWheelchair`, `accessToilets`, `accessParking`, `accessElevator`, `accessLevelEntry`

### GET /api/mobile/establishments/[id]/reservations/settings
Get reservation settings for an establishment (public booking widget).

**Response:**
```json
{
  "settings": {
    "enabled": true,
    "slotDurationMinutes": 60,
    "capacityPerSlot": 10,
    "minPartySize": 1,
    "maxPartySize": 10,
    "minNoticeMinutes": 120,
    "bookingWindowDays": 30,
    "cancellationEnabled": true,
    "cancellationDeadlineHours": 24,
    "resourceSelectionMode": "HIDDEN",
    "weeklySchedule": [...],
    "customFieldDefs": [...]
  }
}
```

---

## User Endpoints (JWT auth required)

### GET /api/mobile/me
Get authenticated user profile.

### GET /api/mobile/me/reservations
Get user's reservations.

**Query params:**
- `status=upcoming` - Future confirmed reservations (sorted asc)
- `status=past` - Past or cancelled/no-show reservations (sorted desc)

**Response:**
```json
{
  "reservations": [
    {
      "id": "...",
      "startAt": "2025-01-15T10:00:00.000Z",
      "endAt": "2025-01-15T11:00:00.000Z",
      "partySize": 2,
      "status": "CONFIRMED",
      "establishment": {
        "name": "...",
        "address": "...",
        "city": "...",
        "activity": { "id": "...", "title": "...", "type": "..." }
      },
      "settings": {
        "cancellationEnabled": true,
        "cancellationDeadlineHours": 24
      },
      "slot": { "id": "...", "startAt": "...", "endAt": "..." },
      "resource": { "name": "Salle A" }
    }
  ]
}
```

### POST /api/mobile/reservations/[id]/cancel
Cancel user's own reservation.

**Rules:**
- Only the reservation owner (userId) can cancel
- Must be CONFIRMED status
- Cancellation must be enabled in settings
- Must respect `cancellationDeadlineHours`

**Response:** `{ "success": true }`

### GET/POST /api/mobile/favorites
Manage user favorites.

### GET/DELETE /api/mobile/favorites/[id]
Manage individual favorites.

---

## Owner Endpoints (JWT auth, ESTABLISHMENT role required)

All owner endpoints verify that the authenticated user owns the specified establishment.

### GET /api/mobile/establishment
Get own establishment profile (includes accessibility fields).

### PATCH /api/mobile/establishment
Update own establishment profile.

**Accepted fields:**
```json
{
  "name": "string",
  "phone": "string",
  "website": "string",
  "bookingUrl": "string",
  "address": "string",
  "city": "string",
  "zipCode": "string",
  "country": "string",
  "lat": 48.8566,
  "lng": 2.3522,
  "accessWheelchair": true,
  "accessToilets": true,
  "accessParking": false,
  "accessElevator": false,
  "accessLevelEntry": true
}
```

### Reservation Settings

#### GET /api/mobile/owner/establishments/[id]/reservations/settings
Get settings + overrides for own establishment.

#### PUT /api/mobile/owner/establishments/[id]/reservations/settings
Update reservation settings (full replace).

**Body:**
```json
{
  "enabled": true,
  "slotDurationMinutes": 60,
  "capacityPerSlot": 10,
  "minPartySize": 1,
  "maxPartySize": 10,
  "minNoticeMinutes": 120,
  "bookingWindowDays": 30,
  "cancellationEnabled": true,
  "cancellationDeadlineHours": 24,
  "confirmationMessage": "Merci pour votre réservation !",
  "cancellationPolicyText": "Annulation gratuite 24h avant.",
  "resourceSelectionMode": "HIDDEN",
  "weeklySchedule": {
    "1": [{ "start": "09:00", "end": "12:00" }, { "start": "14:00", "end": "18:00" }],
    "2": [{ "start": "09:00", "end": "18:00" }]
  },
  "customFieldDefs": [
    { "label": "Remarques", "type": "TEXTAREA", "required": false, "order": 0 }
  ]
}
```

### Reservations (received)

#### GET /api/mobile/owner/establishments/[id]/reservations
List reservations received by the establishment.

**Query params:**
- `status` - Filter by status (CONFIRMED, CANCELLED, NO_SHOW)
- `dateFrom` - ISO date string, filter startAt >= dateFrom
- `dateTo` - ISO date string, filter startAt <= dateTo

#### POST /api/mobile/owner/reservations/[id]/cancel
Owner cancels a reservation. No deadline restriction for owners.

### Resources (salles/tables)

#### GET /api/mobile/owner/establishments/[id]/resources
List all resources for the establishment.

#### POST /api/mobile/owner/establishments/[id]/resources
Create a new resource.

**Body:**
```json
{
  "name": "Salle A",
  "capacity": 20,
  "isActive": true,
  "description": "Grande salle",
  "useCustomRules": false
}
```

#### PATCH /api/mobile/owner/establishments/[id]/resources/[resourceId]
Update a resource (partial).

#### DELETE /api/mobile/owner/establishments/[id]/resources/[resourceId]
Delete a resource.

### Slots (créneaux)

#### GET /api/mobile/owner/establishments/[id]/slots
List slots with reservation counts.

**Query params:**
- `dateFrom` - ISO date string
- `dateTo` - ISO date string

#### POST /api/mobile/owner/establishments/[id]/slots
Create a manual slot **or** generate slots from the weekly schedule.

**Mode 1 — Create a single slot:**
```json
{
  "startAt": "2025-01-15T10:00:00.000Z",
  "endAt": "2025-01-15T11:00:00.000Z",
  "capacity": 10,
  "isActive": true,
  "resourceId": "clxyz..."
}
```

**Response (201):** `{ "slot": { ... } }`

**Mode 2 — Generate slots from weekly schedule:**
```json
{
  "action": "generate",
  "dateFrom": "2025-01-15",
  "dateTo": "2025-02-15"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| action | `"generate"` | Yes | Must be the literal string `"generate"` |
| dateFrom | `string` | Yes | Start date (`YYYY-MM-DD`) |
| dateTo | `string` | Yes | End date (`YYYY-MM-DD`, must be >= dateFrom) |

**Response (200):**
```json
{
  "count": 120,
  "cleanedOrphans": 0
}
```

- `count`: number of new slots created (duplicates are skipped via upsert)
- `cleanedOrphans`: number of orphan slots cleaned up (when resources exist)

#### PATCH /api/mobile/owner/establishments/[id]/slots/[slotId]
Update a slot (partial).

#### DELETE /api/mobile/owner/establishments/[id]/slots/[slotId]
Delete a slot.

---

## Date Formats

- **Datetime fields** (`startAt`, `endAt`): ISO 8601 string `"2025-01-15T10:00:00.000Z"`
- **Date-only fields** (availability, overrides): `"YYYY-MM-DD"` format `"2025-01-15"`
- **Time fields** (weekly schedule): `"HH:mm"` format `"09:00"`

## Rate Limiting

All endpoints are rate-limited per IP. Authentication-sensitive endpoints use stricter limits.
