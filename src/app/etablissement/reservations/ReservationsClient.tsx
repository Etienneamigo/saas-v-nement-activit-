"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  saveReservationSettings,
  saveReservationOverride,
  deleteReservationOverride,
  cancelReservation,
} from "@/app/actions/reservations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CalendarCheck,
  Save,
  Plus,
  Trash2,
  Settings,
  List,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Eye,
  Calendar,
  Warehouse,
} from "lucide-react"
import type {
  ReservationSettings,
  WeeklySchedule,
  ReservationOverride,
  Reservation,
  ReservationCustomFieldDef,
  ReservationResource,
} from "@prisma/client"
import { SlotsTab } from "./SlotsTab"
import { ResourcesTab } from "./ResourcesTab"

type SettingsWithRelations = ReservationSettings & {
  weeklySchedule: WeeklySchedule[]
  customFieldDefs: ReservationCustomFieldDef[]
}

type ReservationWithRelations = Reservation & {
  user: { email: string; name: string | null } | null
  customValues: Array<{
    fieldDef: ReservationCustomFieldDef
    value: string
  }>
}

interface Props {
  initialSettings: SettingsWithRelations | null
  initialOverrides: ReservationOverride[]
  initialReservations: ReservationWithRelations[]
  initialResources: ReservationResource[]
}

const DAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"]
const CUSTOM_FIELD_TYPES = [
  { value: "TEXT", label: "Texte court" },
  { value: "TEXTAREA", label: "Texte long" },
  { value: "NUMBER", label: "Nombre" },
  { value: "SELECT", label: "Choix (liste)" },
  { value: "PHONE", label: "Téléphone" },
  { value: "EMAIL", label: "Email" },
  { value: "CHECKBOX", label: "Case à cocher" },
]

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(date))
}

export function ReservationsClient({ initialSettings, initialOverrides, initialReservations, initialResources }: Props) {
  const [tab, setTab] = useState<"settings" | "slots" | "resources" | "list">("settings")
  const [resources, setResources] = useState(initialResources)
  const [isSaving, setIsSaving] = useState(false)

  // Settings form state
  const [enabled, setEnabled] = useState(initialSettings?.enabled ?? false)
  const [showExternalLinkAlso, setShowExternalLinkAlso] = useState(initialSettings?.showExternalLinkAlso ?? false)
  const [resourceSelectionMode, setResourceSelectionMode] = useState<"HIDDEN" | "PICK_RESOURCE_FIRST" | "PICK_TIME_FIRST">(
    (initialSettings as unknown as { resourceSelectionMode?: "HIDDEN" | "PICK_RESOURCE_FIRST" | "PICK_TIME_FIRST" })?.resourceSelectionMode ?? "HIDDEN"
  )
  const [timezone, setTimezone] = useState(initialSettings?.timezone ?? "Europe/Paris")
  const [slotDuration, setSlotDuration] = useState(String(initialSettings?.slotDurationMinutes ?? 60))
  const [capacity, setCapacity] = useState(String(initialSettings?.capacityPerSlot ?? 10))
  const [minParty, setMinParty] = useState(String(initialSettings?.minPartySize ?? 1))
  const [maxParty, setMaxParty] = useState(String(initialSettings?.maxPartySize ?? 10))
  const [minNotice, setMinNotice] = useState(String(initialSettings?.minNoticeMinutes ?? 120))
  const [bookingWindow, setBookingWindow] = useState(String(initialSettings?.bookingWindowDays ?? 30))
  const [cancellationEnabled, setCancellationEnabled] = useState(initialSettings?.cancellationEnabled ?? true)
  const [cancellationDeadline, setCancellationDeadline] = useState(String(initialSettings?.cancellationDeadlineHours ?? 24))
  const [confirmationMsg, setConfirmationMsg] = useState(initialSettings?.confirmationMessage ?? "")
  const [cancellationPolicy, setCancellationPolicy] = useState(initialSettings?.cancellationPolicyText ?? "")

  // Weekly schedule: record dayOfWeek → [{start,end}]
  const buildInitialSchedule = () => {
    const s: Record<string, Array<{ start: string; end: string }>> = {}
    for (let d = 0; d <= 6; d++) {
      const entry = initialSettings?.weeklySchedule.find((ws) => ws.dayOfWeek === d)
      s[String(d)] = (entry?.openRanges as Array<{ start: string; end: string }>) ?? []
    }
    return s
  }
  const [schedule, setSchedule] = useState(buildInitialSchedule)

  // Custom fields
  const [customFields, setCustomFields] = useState<
    Array<{ id?: string; label: string; type: string; required: boolean; optionsJson: string[]; order: number }>
  >(
    initialSettings?.customFieldDefs.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      required: f.required,
      optionsJson: (f.optionsJson as string[]) ?? [],
      order: f.order,
    })) ?? []
  )

  // Overrides
  const [overrides, setOverrides] = useState(initialOverrides)
  const [newOverrideDate, setNewOverrideDate] = useState("")
  const [newOverrideClosed, setNewOverrideClosed] = useState(true)

  // Reservations list
  const [reservations, setReservations] = useState(initialReservations)

  // ─── Save Settings ────────────────────────────────────────────────────────
  async function handleSaveSettings() {
    setIsSaving(true)
    const result = await saveReservationSettings({
      enabled,
      showExternalLinkAlso,
      resourceSelectionMode,
      timezone,
      slotDurationMinutes: parseInt(slotDuration),
      capacityPerSlot: parseInt(capacity),
      minPartySize: parseInt(minParty),
      maxPartySize: parseInt(maxParty),
      minNoticeMinutes: parseInt(minNotice),
      bookingWindowDays: parseInt(bookingWindow),
      cancellationEnabled,
      cancellationDeadlineHours: parseInt(cancellationDeadline),
      confirmationMessage: confirmationMsg || undefined,
      cancellationPolicyText: cancellationPolicy || undefined,
      weeklySchedule: schedule,
      customFieldDefs: customFields,
    })
    setIsSaving(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Paramètres de réservation enregistrés")
    }
  }

  // ─── Schedule helpers ─────────────────────────────────────────────────────
  function addRange(day: string) {
    setSchedule((prev) => ({
      ...prev,
      [day]: [...(prev[day] ?? []), { start: "09:00", end: "18:00" }],
    }))
  }

  function removeRange(day: string, idx: number) {
    setSchedule((prev) => ({
      ...prev,
      [day]: prev[day].filter((_, i) => i !== idx),
    }))
  }

  function updateRange(day: string, idx: number, key: "start" | "end", value: string) {
    setSchedule((prev) => ({
      ...prev,
      [day]: prev[day].map((r, i) => (i === idx ? { ...r, [key]: value } : r)),
    }))
  }

  // ─── Custom fields helpers ────────────────────────────────────────────────
  function addCustomField() {
    setCustomFields((prev) => [
      ...prev,
      { label: "", type: "TEXT", required: false, optionsJson: [], order: prev.length },
    ])
  }

  function removeCustomField(idx: number) {
    setCustomFields((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateCustomField(idx: number, key: string, value: unknown) {
    setCustomFields((prev) => prev.map((f, i) => (i === idx ? { ...f, [key]: value } : f)))
  }

  // ─── Override helpers ─────────────────────────────────────────────────────
  async function handleAddOverride() {
    if (!newOverrideDate) return toast.error("Sélectionnez une date")
    const result = await saveReservationOverride({ date: newOverrideDate, isClosed: newOverrideClosed })
    if (result.error) return toast.error(result.error)
    toast.success("Exception enregistrée")
    setNewOverrideDate("")
    // Reload overrides from server — simplest: refresh
    const updated = await fetch(`/api/establishments/0/reservations/settings`).catch(() => null)
    if (!updated) {
      setOverrides((prev) => [
        ...prev.filter((o) => o.date.toString() !== new Date(newOverrideDate).toString()),
        { id: crypto.randomUUID(), establishmentId: "", date: new Date(newOverrideDate), isClosed: newOverrideClosed, customOpenRanges: null, customCapacity: null },
      ])
    }
  }

  async function handleDeleteOverride(date: string) {
    const result = await deleteReservationOverride(date)
    if (result.error) return toast.error(result.error)
    toast.success("Exception supprimée")
    setOverrides((prev) => prev.filter((o) => o.date.toISOString().split("T")[0] !== date))
  }

  // ─── Cancel reservation ───────────────────────────────────────────────────
  async function handleCancelReservation(id: string) {
    const result = await cancelReservation(id)
    if (result.error) return toast.error(result.error)
    toast.success("Réservation annulée")
    setReservations((prev) => prev.map((r) => r.id === id ? { ...r, status: "CANCELLED" as const } : r))
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarCheck className="h-6 w-6" />
            Réservations
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Configurez votre système de réservation native
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-100 overflow-x-auto">
        {[
          { key: "settings", label: "Paramètres", icon: Settings },
          { key: "slots", label: "Créneaux", icon: Calendar },
          { key: "resources", label: "Ressources", icon: Warehouse },
          { key: "list", label: "Réservations reçues", icon: List },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key as "settings" | "slots" | "resources" | "list")}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              tab === key
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── SETTINGS TAB ─────────────────────────────────────────────────── */}
      {tab === "settings" && (
        <div className="space-y-6">
          {/* Activation */}
          <Card>
            <CardHeader>
              <CardTitle>Activation</CardTitle>
              <CardDescription>Activer ou désactiver le système de réservation native</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm font-medium">Activer les réservations natives</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showExternalLinkAlso}
                  onChange={(e) => setShowExternalLinkAlso(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm">Afficher aussi le lien de réservation externe (si configuré)</span>
              </label>
              <div className="space-y-2 pt-2">
                <Label>Mode de sélection de ressource (côté client)</Label>
                <Select value={resourceSelectionMode} onValueChange={(v) => setResourceSelectionMode(v as "HIDDEN" | "PICK_RESOURCE_FIRST" | "PICK_TIME_FIRST")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HIDDEN">Automatique (client ne choisit pas)</SelectItem>
                    <SelectItem value="PICK_RESOURCE_FIRST">Client choisit d&apos;abord la ressource</SelectItem>
                    <SelectItem value="PICK_TIME_FIRST">Client choisit d&apos;abord le créneau, puis la ressource</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400">
                  {resourceSelectionMode === "HIDDEN" && "La ressource est assignée automatiquement. Idéal pour les bowling, pistes identiques…"}
                  {resourceSelectionMode === "PICK_RESOURCE_FIRST" && "Le client sélectionne d'abord une ressource puis voit ses disponibilités. Idéal pour les escape games."}
                  {resourceSelectionMode === "PICK_TIME_FIRST" && "Le client choisit un créneau puis sélectionne parmi les ressources disponibles."}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Configuration générale */}
          <Card>
            <CardHeader>
              <CardTitle>Configuration générale</CardTitle>
              <CardDescription>Paramètres globaux qui s&apos;appliquent à toutes les réservations</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Délai minimum (minutes avant)</Label>
                <Input
                  type="number" min="0"
                  value={minNotice}
                  onChange={(e) => setMinNotice(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Europe/Paris">Europe/Paris</SelectItem>
                    <SelectItem value="Europe/London">Europe/London</SelectItem>
                    <SelectItem value="America/New_York">America/New_York</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Horaires hebdomadaires */}
          <Card>
            <CardHeader>
              <CardTitle>Horaires d&apos;ouverture</CardTitle>
              <CardDescription>Définissez vos horaires par jour de semaine</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                <div key={day} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 w-28">{DAYS_FR[day]}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => addRange(String(day))}
                      className="text-xs text-gray-500 hover:text-gray-900"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Ajouter
                    </Button>
                  </div>
                  {(schedule[String(day)] ?? []).length === 0 ? (
                    <p className="text-xs text-gray-400 ml-28 italic">Fermé</p>
                  ) : (
                    (schedule[String(day)] ?? []).map((range, idx) => (
                      <div key={idx} className="flex items-center gap-2 ml-28">
                        <Input
                          type="time"
                          value={range.start}
                          onChange={(e) => updateRange(String(day), idx, "start", e.target.value)}
                          className="w-28 h-8 text-sm"
                        />
                        <span className="text-gray-400 text-sm">–</span>
                        <Input
                          type="time"
                          value={range.end}
                          onChange={(e) => updateRange(String(day), idx, "end", e.target.value)}
                          className="w-28 h-8 text-sm"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-400 hover:text-red-500"
                          onClick={() => removeRange(String(day), idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Exceptions */}
          <Card>
            <CardHeader>
              <CardTitle>Exceptions / Fermetures</CardTitle>
              <CardDescription>Dates fermées ou horaires spéciaux ponctuels</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Input
                  type="date"
                  value={newOverrideDate}
                  onChange={(e) => setNewOverrideDate(e.target.value)}
                  className="w-44"
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={newOverrideClosed}
                    onChange={(e) => setNewOverrideClosed(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Fermé
                </label>
                <Button type="button" size="sm" variant="outline" onClick={handleAddOverride}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Ajouter
                </Button>
              </div>

              {overrides.length > 0 && (
                <div className="divide-y divide-gray-100">
                  {overrides.map((o) => (
                    <div key={o.id} className="flex items-center justify-between py-2">
                      <span className="text-sm text-gray-700">
                        {new Date(o.date).toLocaleDateString("fr-FR")}
                        {" "}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${o.isClosed ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"}`}>
                          {o.isClosed ? "Fermé" : "Horaires custom"}
                        </span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-gray-400 hover:text-red-500"
                        onClick={() => handleDeleteOverride(new Date(o.date).toISOString().split("T")[0])}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Champs personnalisés */}
          <Card>
            <CardHeader>
              <CardTitle>Champs personnalisés</CardTitle>
              <CardDescription>Informations demandées au client lors de la réservation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {customFields.map((field, idx) => (
                <div key={idx} className="p-3 border border-gray-100 rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Label du champ"
                      value={field.label}
                      onChange={(e) => updateCustomField(idx, "label", e.target.value)}
                      className="flex-1 h-8 text-sm"
                    />
                    <Select value={field.type} onValueChange={(v) => updateCustomField(idx, "type", v)}>
                      <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CUSTOM_FIELD_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-1.5 text-xs text-gray-500 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => updateCustomField(idx, "required", e.target.checked)}
                        className="h-3.5 w-3.5"
                      />
                      Requis
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-gray-400 hover:text-red-500"
                      onClick={() => removeCustomField(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {field.type === "SELECT" && (
                    <div className="space-y-1">
                      <Label className="text-xs">Options (une par ligne)</Label>
                      <textarea
                        className="w-full border border-gray-200 rounded text-xs p-2 min-h-[60px] focus:outline-none focus:border-gray-400"
                        value={field.optionsJson.join("\n")}
                        onChange={(e) => updateCustomField(idx, "optionsJson", e.target.value.split("\n").filter(Boolean))}
                        placeholder="Option 1&#10;Option 2&#10;Option 3"
                      />
                    </div>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addCustomField}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Ajouter un champ
              </Button>
            </CardContent>
          </Card>

          {/* Messages */}
          <Card>
            <CardHeader>
              <CardTitle>Messages & Politique</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Message de confirmation</Label>
                <textarea
                  className="w-full border border-gray-200 rounded text-sm p-3 min-h-[80px] focus:outline-none focus:border-gray-400"
                  value={confirmationMsg}
                  onChange={(e) => setConfirmationMsg(e.target.value)}
                  placeholder="Merci pour votre réservation ! Nous vous attendons..."
                />
              </div>
              <div className="space-y-2">
                <Label>Politique d&apos;annulation</Label>
                <textarea
                  className="w-full border border-gray-200 rounded text-sm p-3 min-h-[80px] focus:outline-none focus:border-gray-400"
                  value={cancellationPolicy}
                  onChange={(e) => setCancellationPolicy(e.target.value)}
                  placeholder="Annulation gratuite jusqu'à 24h avant..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cancellationEnabled}
                    onChange={(e) => setCancellationEnabled(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">Autoriser les annulations</span>
                </label>
                <div className="space-y-2">
                  <Label className="text-xs">Délai annulation (heures avant)</Label>
                  <Input
                    type="number" min="0"
                    value={cancellationDeadline}
                    onChange={(e) => setCancellationDeadline(e.target.value)}
                    className="h-8"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSaveSettings} disabled={isSaving}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </div>
      )}

      {/* ── RESERVATIONS LIST TAB ─────────────────────────────────────────── */}
      {tab === "list" && (
        <div className="space-y-4">
          {reservations.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <CalendarCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Aucune réservation pour le moment</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {reservations.map((r) => (
                <div key={r.id} className="py-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge status={r.status} />
                      <span className="text-sm font-medium text-gray-900">
                        {r.customerName}
                        {" "}
                        <span className="text-gray-400 font-normal">({r.partySize} pers.)</span>
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {formatDateTime(r.startAt)} → {new Date(r.endAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    {r.customerEmail && (
                      <p className="text-xs text-gray-400 mt-0.5">{r.customerEmail}</p>
                    )}
                    {r.customValues.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {r.customValues.map((cv) => (
                          <p key={cv.fieldDef.id} className="text-xs text-gray-500">
                            <span className="font-medium">{cv.fieldDef.label}:</span> {cv.value}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  {r.status === "CONFIRMED" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 text-xs"
                      onClick={() => handleCancelReservation(r.id)}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                      Annuler
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SLOTS TAB ────────────────────────────────────────────────────── */}
      {tab === "slots" && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            <strong>Note :</strong> Une fois des créneaux persistés créés, ils ont la priorité sur la
            génération automatique. Les paramètres (onglet Paramètres) servent de base pour la
            génération initiale.
          </div>
          <SlotsTab
            resources={resources.map((r) => ({ id: r.id, name: r.name, capacity: r.capacity }))}
            schedule={schedule}
          />
        </div>
      )}

      {/* ── RESOURCES TAB ────────────────────────────────────────────────── */}
      {tab === "resources" && (
        <ResourcesTab
          initialResources={resources.map((r) => ({
            id: r.id,
            name: r.name,
            capacity: r.capacity,
            isActive: r.isActive,
            description: (r as Record<string, unknown>).description as string | null ?? null,
            imageUrl: (r as Record<string, unknown>).imageUrl as string | null ?? null,
            useCustomRules: (r as Record<string, unknown>).useCustomRules as boolean ?? false,
            minPartySizeOverride: (r as Record<string, unknown>).minPartySizeOverride as number | null ?? null,
            maxPartySizeOverride: (r as Record<string, unknown>).maxPartySizeOverride as number | null ?? null,
            slotDurationMinutesOverride: (r as Record<string, unknown>).slotDurationMinutesOverride as number | null ?? null,
            bookingWindowDaysOverride: (r as Record<string, unknown>).bookingWindowDaysOverride as number | null ?? null,
          }))}
          defaultRules={{
            slotDurationMinutes: parseInt(slotDuration),
            capacityPerSlot: parseInt(capacity),
            minPartySize: parseInt(minParty),
            maxPartySize: parseInt(maxParty),
            bookingWindowDays: parseInt(bookingWindow),
          }}
          onDefaultRulesChange={(rules) => {
            setSlotDuration(String(rules.slotDurationMinutes))
            setCapacity(String(rules.capacityPerSlot))
            setMinParty(String(rules.minPartySize))
            setMaxParty(String(rules.maxPartySize))
            setBookingWindow(String(rules.bookingWindowDays))
          }}
          onResourcesChange={(updated) =>
            setResources(updated.map((r) => ({
              ...r,
              establishmentId: resources[0]?.establishmentId ?? "",
              createdAt: resources.find((x) => x.id === r.id)?.createdAt ?? new Date(),
              updatedAt: new Date(),
            })))
          }
        />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    CONFIRMED: { icon: CheckCircle2, label: "Confirmé", className: "text-green-600 bg-green-50" },
    CANCELLED: { icon: XCircle, label: "Annulé", className: "text-red-600 bg-red-50" },
    NO_SHOW: { icon: AlertCircle, label: "No-show", className: "text-orange-600 bg-orange-50" },
  }[status] ?? { icon: Eye, label: status, className: "text-gray-600 bg-gray-50" }

  const { icon: Icon, label, className } = config

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${className}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}
