"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getAvailability, createReservation, getResourcesForSlot } from "@/app/actions/reservations"
import { toast } from "sonner"
import { CalendarCheck, ChevronLeft, Clock, Users, CheckCircle2, Loader2, Warehouse } from "lucide-react"
import type { ReservationSettings, WeeklySchedule, ReservationCustomFieldDef, ReservationResource } from "@prisma/client"

type SettingsWithRelations = ReservationSettings & {
  weeklySchedule: WeeklySchedule[]
  customFieldDefs: ReservationCustomFieldDef[]
}

interface SlotInfo {
  startAt: string
  endAt: string
  remainingCapacity: number
  isAvailable: boolean
  slotId?: string
  resourceId?: string
  resourceName?: string
}

interface ResourceOption {
  id: string
  name: string
  remainingCapacity: number
  description?: string | null
  imageUrl?: string | null
}

interface BookingWidgetProps {
  establishmentId: string
  settings: SettingsWithRelations
  resources?: ReservationResource[]
  isAuthenticated: boolean
}

// resourceSelectionMode peut ne pas exister encore (DB non migrée) → fallback HIDDEN
type ResourceMode = "HIDDEN" | "PICK_RESOURCE_FIRST" | "PICK_TIME_FIRST"

type Step =
  | "resource"   // PICK_RESOURCE_FIRST : choisir une salle en premier
  | "date"
  | "slot"
  | "room"       // PICK_TIME_FIRST : choisir la salle après le créneau
  | "form"
  | "confirmed"

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
}

function formatDateFR(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
}

function getTodayStr() {
  return new Date().toISOString().split("T")[0]
}

function normalizeDateInput(value: Date | string): string {
  if (value instanceof Date) return value.toISOString()
  return value
}

function getMaxDateStr(windowDays: number) {
  const d = new Date()
  d.setDate(d.getDate() + windowDays)
  return d.toISOString().split("T")[0]
}

function computeEffectiveRules(
  resource: ReservationResource | null | undefined,
  settings: SettingsWithRelations
) {
  if (!resource || !(resource as Record<string, unknown>).useCustomRules) {
    return {
      minPartySize: settings.minPartySize,
      maxPartySize: settings.maxPartySize,
      bookingWindowDays: settings.bookingWindowDays,
    }
  }
  const r = resource as Record<string, unknown>
  return {
    minPartySize: (r.minPartySizeOverride as number) ?? settings.minPartySize,
    maxPartySize: (r.maxPartySizeOverride as number) ?? settings.maxPartySize,
    bookingWindowDays: (r.bookingWindowDaysOverride as number) ?? settings.bookingWindowDays,
  }
}

export function BookingWidget({ establishmentId, settings, resources = [], isAuthenticated }: BookingWidgetProps) {
  const resourceMode: ResourceMode =
    (settings as unknown as { resourceSelectionMode?: ResourceMode }).resourceSelectionMode ?? "HIDDEN"

  const [step, setStep] = useState<Step>(resourceMode === "PICK_RESOURCE_FIRST" ? "resource" : "date")
  const [selectedDate, setSelectedDate] = useState("")
  const [slots, setSlots] = useState<SlotInfo[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<SlotInfo | null>(null)
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null)
  const [availableRooms, setAvailableRooms] = useState<ResourceOption[]>([])
  const [loadingRooms, setLoadingRooms] = useState(false)

  // Compute effective rules based on selected resource
  const selectedResource = resources.find((r) => r.id === selectedResourceId) ?? null
  const effectiveRules = computeEffectiveRules(selectedResource, settings)

  const [partySize, setPartySize] = useState(settings.minPartySize)
  const [submitting, setSubmitting] = useState(false)
  const [confirmedReservation, setConfirmedReservation] = useState<{
    id: string
    startAt: string
    partySize: number
  } | null>(null)

  // Form fields
  const [customerName, setCustomerName] = useState("")
  const [customerEmail, setCustomerEmail] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({})

  // Fetch slots when entering the "slot" step
  useEffect(() => {
    if (!selectedDate || step !== "slot") return
    setLoadingSlots(true)
    setSlots([])
    setSelectedSlot(null)
    getAvailability(
      establishmentId,
      selectedDate,
      resourceMode === "PICK_RESOURCE_FIRST" ? selectedResourceId : null
    ).then((result) => {
      setSlots((result.slots ?? []) as SlotInfo[])
      setLoadingSlots(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, step])

  // Fetch available rooms when entering the "room" step (PICK_TIME_FIRST)
  useEffect(() => {
    if (resourceMode !== "PICK_TIME_FIRST" || !selectedSlot || step !== "room") return
    setLoadingRooms(true)
    getResourcesForSlot(
      establishmentId,
      normalizeDateInput(selectedSlot.startAt as unknown as Date | string),
      partySize
    ).then((result) => {
      setAvailableRooms(result.resources ?? [])
      setLoadingRooms(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlot, step])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedSlot) return

    setSubmitting(true)
    const result = await createReservation({
      establishmentId,
      startAt: normalizeDateInput(selectedSlot.startAt as unknown as Date | string),
      partySize,
      customerName,
      customerEmail,
      customerPhone: customerPhone || undefined,
      customFieldValues,
      slotId: selectedSlot.slotId ?? null,
      resourceId: selectedResourceId ?? selectedSlot.resourceId ?? null,
    })
    setSubmitting(false)

    if (result.error) {
      toast.error(result.error)
      if (result.error.includes("complet")) {
        setStep("slot")
        setLoadingSlots(true)
        getAvailability(
          establishmentId,
          selectedDate,
          resourceMode === "PICK_RESOURCE_FIRST" ? selectedResourceId : null
        ).then((r) => {
          setSlots((r.slots ?? []) as SlotInfo[])
          setLoadingSlots(false)
        })
      }
    } else if (result.reservation) {
      setConfirmedReservation({
        id: result.reservation.id,
        startAt: result.reservation.startAt as unknown as string,
        partySize: result.reservation.partySize,
      })
      setStep("confirmed")
    }
  }

  function resetWidget() {
    setStep(resourceMode === "PICK_RESOURCE_FIRST" ? "resource" : "date")
    setSelectedDate("")
    setSelectedSlot(null)
    setSelectedResourceId(null)
    setAvailableRooms([])
    setCustomerName("")
    setCustomerEmail("")
    setCustomerPhone("")
    setCustomFieldValues({})
    setConfirmedReservation(null)
  }

  // ── CONFIRMED ──────────────────────────────────────────────────────────────
  if (step === "confirmed" && confirmedReservation) {
    return (
      <div className="border border-green-200 bg-green-50 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-green-700">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-semibold">Réservation confirmée !</span>
        </div>
        <div className="text-sm text-green-800 space-y-1">
          <p>{formatDateFR(confirmedReservation.startAt)} à {formatTime(confirmedReservation.startAt)}</p>
          <p>{confirmedReservation.partySize} personne{confirmedReservation.partySize > 1 ? "s" : ""}</p>
        </div>
        {settings.confirmationMessage && (
          <p className="text-sm text-green-700 border-t border-green-200 pt-2">
            {settings.confirmationMessage}
          </p>
        )}
        <Button variant="outline" size="sm" className="border-green-300 text-green-700" onClick={resetWidget}>
          Nouvelle réservation
        </Button>
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-4">
      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
        <CalendarCheck className="h-4 w-4" />
        Réserver
      </h3>

      {settings.cancellationPolicyText && (
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          {settings.cancellationPolicyText}
        </p>
      )}

      {/* ── STEP: Resource (PICK_RESOURCE_FIRST) ──────────────────────────── */}
      {step === "resource" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Choisissez une ressource :</p>
          {resources.length === 0 ? (
            <p className="text-sm text-gray-400">Aucune ressource disponible.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {resources.map((r) => {
                const imgUrl = (r as unknown as { imageUrl?: string | null }).imageUrl
                const desc = (r as unknown as { description?: string | null }).description
                return (
                  <button
                    key={r.id}
                    onClick={() => {
                      setSelectedResourceId(r.id)
                      setStep("date")
                    }}
                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-900 hover:bg-gray-50 text-left transition-colors"
                  >
                    {imgUrl ? (
                      <img
                        src={imgUrl.startsWith("/uploads/") ? imgUrl.replace("/uploads/", "/api/uploads/") : imgUrl}
                        alt={r.name}
                        className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <Warehouse className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">{r.name}</p>
                        <span className="text-xs text-gray-400">{r.capacity} pl.</span>
                      </div>
                      {desc && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{desc}</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── STEP: Date ──────────────────────────────────────────────────────── */}
      {step === "date" && (
        <div className="space-y-3">
          {resourceMode === "PICK_RESOURCE_FIRST" && selectedResourceId && (
            <button
              onClick={() => setStep("resource")}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {resources.find((r) => r.id === selectedResourceId)?.name ?? "Ressource"}
            </button>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Choisissez une date</Label>
            <input
              type="date"
              min={getTodayStr()}
              max={getMaxDateStr(effectiveRules.bookingWindowDays)}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
            />
          </div>
          <Button
            className="w-full"
            disabled={!selectedDate}
            onClick={() => setStep("slot")}
          >
            Voir les créneaux disponibles
          </Button>
        </div>
      )}

      {/* ── STEP: Slot ──────────────────────────────────────────────────────── */}
      {step === "slot" && (
        <div className="space-y-3">
          <button
            onClick={() => setStep("date")}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {selectedDate ? formatDateFR(selectedDate) : "Retour"}
          </button>

          {/* Party size */}
          <div className="flex items-center gap-3">
            <Users className="h-4 w-4 text-gray-400" />
            <Label className="text-sm text-gray-600">Nombre de personnes :</Label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="w-7 h-7 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center text-sm"
                onClick={() => setPartySize((p) => Math.max(effectiveRules.minPartySize, p - 1))}
              >
                −
              </button>
              <span className="text-sm font-medium w-4 text-center">{partySize}</span>
              <button
                type="button"
                className="w-7 h-7 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center text-sm"
                onClick={() => setPartySize((p) => Math.min(effectiveRules.maxPartySize, p + 1))}
              >
                +
              </button>
            </div>
          </div>

          {loadingSlots ? (
            <div className="flex items-center justify-center py-6 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Chargement des créneaux…
            </div>
          ) : slots.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              Aucun créneau disponible ce jour
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {slots.map((slot) => {
                const available = slot.isAvailable && slot.remainingCapacity >= partySize
                return (
                  <button
                    key={`${slot.startAt}-${slot.resourceId ?? "global"}`}
                    disabled={!available}
                    onClick={() => {
                      setSelectedSlot(slot)
                      if (resourceMode === "PICK_TIME_FIRST") {
                        setStep("room")
                      } else {
                        setStep("form")
                      }
                    }}
                    className={`flex flex-col items-center py-2 px-1 rounded-lg border text-sm transition-colors ${
                      available
                        ? "border-gray-200 hover:border-gray-900 hover:bg-gray-50 text-gray-900 cursor-pointer"
                        : "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed"
                    }`}
                  >
                    <Clock className="h-3.5 w-3.5 mb-0.5 opacity-50" />
                    {formatTime(slot.startAt)}
                    <span className="text-[10px] text-gray-400 mt-0.5">
                      {available ? `${slot.remainingCapacity} pl.` : "Complet"}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── STEP: Room (PICK_TIME_FIRST) ────────────────────────────────────── */}
      {step === "room" && selectedSlot && (
        <div className="space-y-3">
          <button
            onClick={() => setStep("slot")}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {formatTime(selectedSlot.startAt)} · {partySize} pers.
          </button>
          <p className="text-sm text-gray-600">Choisissez une ressource pour ce créneau :</p>
          {loadingRooms ? (
            <div className="flex items-center justify-center py-6 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Chargement des ressources…
            </div>
          ) : availableRooms.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              Aucune ressource disponible pour ce créneau
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {availableRooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => {
                    setSelectedResourceId(room.id)
                    setStep("form")
                  }}
                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-900 hover:bg-gray-50 text-left transition-colors"
                >
                  {room.imageUrl ? (
                    <img
                      src={room.imageUrl.startsWith("/uploads/") ? room.imageUrl.replace("/uploads/", "/api/uploads/") : room.imageUrl}
                      alt={room.name}
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <Warehouse className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{room.name}</p>
                    <p className="text-xs text-gray-400">
                      {room.remainingCapacity} place{room.remainingCapacity > 1 ? "s" : ""} restante{room.remainingCapacity > 1 ? "s" : ""}
                    </p>
                    {room.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{room.description}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── STEP: Form ─────────────────────────────────────────────────────── */}
      {step === "form" && selectedSlot && (
        <form onSubmit={handleSubmit} className="space-y-3">
          <button
            type="button"
            onClick={() => {
              if (resourceMode === "PICK_TIME_FIRST") {
                setStep("room")
              } else {
                setStep("slot")
              }
            }}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {formatTime(selectedSlot.startAt)} · {partySize} pers.
          </button>

          <div className="space-y-2">
            <Label htmlFor="customerName" className="text-xs">Nom complet *</Label>
            <Input
              id="customerName"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Jean Dupont"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="customerEmail" className="text-xs">Email *</Label>
            <Input
              id="customerEmail"
              type="email"
              required
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="jean@email.fr"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="customerPhone" className="text-xs">Téléphone</Label>
            <Input
              id="customerPhone"
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="06 00 00 00 00"
              className="h-9 text-sm"
            />
          </div>

          {/* Champs personnalisés */}
          {settings.customFieldDefs.map((field) => (
            <div key={field.id} className="space-y-2">
              <Label className="text-xs">
                {field.label}
                {field.required && " *"}
              </Label>
              {field.type === "TEXTAREA" ? (
                <textarea
                  required={field.required}
                  value={customFieldValues[field.id] ?? ""}
                  onChange={(e) =>
                    setCustomFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400 min-h-[70px]"
                />
              ) : field.type === "SELECT" ? (
                <select
                  required={field.required}
                  value={customFieldValues[field.id] ?? ""}
                  onChange={(e) =>
                    setCustomFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                >
                  <option value="">Choisir…</option>
                  {((field.optionsJson as string[]) ?? []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : field.type === "CHECKBOX" ? (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    required={field.required}
                    checked={customFieldValues[field.id] === "true"}
                    onChange={(e) =>
                      setCustomFieldValues((prev) => ({
                        ...prev,
                        [field.id]: e.target.checked ? "true" : "false",
                      }))
                    }
                    className="h-4 w-4"
                  />
                  {field.label}
                </label>
              ) : (
                <Input
                  type={
                    field.type === "NUMBER"
                      ? "number"
                      : field.type === "EMAIL"
                      ? "email"
                      : field.type === "PHONE"
                      ? "tel"
                      : "text"
                  }
                  required={field.required}
                  value={customFieldValues[field.id] ?? ""}
                  onChange={(e) =>
                    setCustomFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                  }
                  className="h-9 text-sm"
                />
              )}
            </div>
          ))}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                Réservation en cours…
              </>
            ) : (
              "Confirmer la réservation"
            )}
          </Button>

          {!isAuthenticated && (
            <p className="text-xs text-gray-400 text-center">
              Vous pouvez réserver sans compte.
            </p>
          )}
        </form>
      )}
    </div>
  )
}
