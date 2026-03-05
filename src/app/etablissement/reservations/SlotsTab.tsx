"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import {
  getSlots,
  createSlot,
  updateSlot,
  deleteSlot,
  toggleSlotActive,
  generateSlots,
  duplicateSlot,
} from "@/app/actions/slots"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Plus,
  Trash2,
  Edit3,
  Copy,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Calendar,
  ChevronDown,
  ChevronUp,
  CalendarPlus,
  AlertTriangle,
} from "lucide-react"

type Slot = {
  id: string
  startAt: Date
  endAt: Date
  capacity: number
  isActive: boolean
  source: string
  resourceId: string | null
  resource: { id: string; name: string } | null
  _count: { reservations: number }
}

type Resource = { id: string; name: string; capacity: number }
type ScheduleRange = { start: string; end: string }

/** Returns true if at least one day has a valid open range (start !== end, non-empty) */
function hasValidScheduleRanges(schedule: Record<string, ScheduleRange[]>): boolean {
  return Object.values(schedule).some((ranges) =>
    ranges.some((r) => r.start !== r.end)
  )
}

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })
}
function formatTime(d: Date | string) {
  return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
}
function toDatetimeLocal(d: Date | string) {
  const dt = new Date(d)
  const off = dt.getTimezoneOffset()
  const local = new Date(dt.getTime() - off * 60000)
  return local.toISOString().slice(0, 16)
}

// Group slots by date (YYYY-MM-DD)
function groupByDate(slots: Slot[]) {
  const map = new Map<string, Slot[]>()
  for (const s of slots) {
    const key = new Date(s.startAt).toISOString().split("T")[0]
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(s)
  }
  return map
}

interface SlotsTabProps {
  resources: Resource[]
  schedule?: Record<string, ScheduleRange[]>
}

export function SlotsTab({ resources, schedule }: SlotsTabProps) {
  const [slots, setSlots] = useState<Slot[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [viewDate, setViewDate] = useState(() => new Date().toISOString().split("T")[0])
  const [generating, setGenerating] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingSlot, setEditingSlot] = useState<Slot | null>(null)
  const [duplicatingSlot, setDuplicatingSlot] = useState<Slot | null>(null)
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())

  // Form state
  const [formStart, setFormStart] = useState("")
  const [formEnd, setFormEnd] = useState("")
  const [formCapacity, setFormCapacity] = useState("10")
  const [formResourceId, setFormResourceId] = useState("")
  const [saving, setSaving] = useState(false)

  // Duplicate form
  const [dupDates, setDupDates] = useState("")

  const canGenerate = schedule ? hasValidScheduleRanges(schedule) : true

  const dateFrom = viewDate
  const dateTo = (() => {
    const d = new Date(viewDate)
    d.setDate(d.getDate() + 13) // 2 weeks view
    return d.toISOString().split("T")[0]
  })()

  async function loadSlots() {
    setIsLoading(true)
    const result = await getSlots(dateFrom, dateTo + "T23:59:59")
    setSlots((result.slots ?? []) as Slot[])
    setIsLoading(false)
    // Auto-expand today
    const todayKey = new Date().toISOString().split("T")[0]
    setExpandedDates(new Set([todayKey, dateFrom]))
  }

  useEffect(() => {
    loadSlots()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate])

  async function handleGenerate() {
    setGenerating(true)
    const result = await generateSlots()
    setGenerating(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`${result.created} créneaux générés`)
      loadSlots()
    }
  }

  function openAddForm(date?: string) {
    const base = date ? `${date}T09:00` : `${dateFrom}T09:00`
    setFormStart(base)
    setFormEnd(date ? `${date}T10:00` : `${dateFrom}T10:00`)
    setFormCapacity("10")
    setFormResourceId("")
    setEditingSlot(null)
    setShowAddForm(true)
  }

  function openEditForm(slot: Slot) {
    setFormStart(toDatetimeLocal(slot.startAt))
    setFormEnd(toDatetimeLocal(slot.endAt))
    setFormCapacity(String(slot.capacity))
    setFormResourceId(slot.resourceId ?? "")
    setEditingSlot(slot)
    setShowAddForm(true)
  }

  async function handleSaveSlot() {
    setSaving(true)
    const data = {
      startAt: new Date(formStart).toISOString(),
      endAt: new Date(formEnd).toISOString(),
      capacity: parseInt(formCapacity),
      isActive: true,
      resourceId: formResourceId || null,
    }

    let result
    if (editingSlot) {
      result = await updateSlot(editingSlot.id, data)
    } else {
      result = await createSlot(data)
    }
    setSaving(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(editingSlot ? "Créneau modifié" : "Créneau créé")
      setShowAddForm(false)
      setEditingSlot(null)
      loadSlots()
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce créneau ?")) return
    const result = await deleteSlot(id)
    if (result.error) toast.error(result.error)
    else {
      toast.success("Créneau supprimé")
      setSlots((prev) => prev.filter((s) => s.id !== id))
    }
  }

  async function handleToggle(id: string) {
    const result = await toggleSlotActive(id)
    if (result.error) toast.error(result.error)
    else {
      setSlots((prev) =>
        prev.map((s) => (s.id === id ? { ...s, isActive: result.slot?.isActive ?? s.isActive } : s))
      )
    }
  }

  async function handleDuplicate(slot: Slot) {
    if (!dupDates.trim()) return toast.error("Entrez des dates (YYYY-MM-DD, une par ligne)")
    const dates = dupDates.trim().split(/[\n,]+/).map((d) => d.trim()).filter(Boolean)
    const result = await duplicateSlot({ slotId: slot.id, targetDates: dates })
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`${result.created} créneaux dupliqués`)
      setDuplicatingSlot(null)
      setDupDates("")
      loadSlots()
    }
  }

  function toggleDate(key: string) {
    setExpandedDates((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const grouped = groupByDate(slots)
  const dateKeys = Array.from(grouped.keys()).sort()

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-gray-500">Semaine du</Label>
          <input
            type="date"
            value={viewDate}
            onChange={(e) => setViewDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => openAddForm()}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Ajouter un créneau
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={generating || !canGenerate}
          className="text-blue-600 border-blue-200 hover:bg-blue-50"
          title={!canGenerate ? "Définissez vos horaires d'ouverture avant de générer des créneaux." : undefined}
        >
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
          )}
          Générer depuis paramètres
        </Button>
      </div>

      {!canGenerate && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 inline mr-2" />
          Définissez vos horaires d&apos;ouverture avant de générer des créneaux.
          Rendez-vous dans l&apos;onglet <strong>Paramètres</strong> pour configurer vos plages horaires.
        </div>
      )}

      {/* Add/Edit form */}
      {showAddForm && (
        <div className="border border-gray-200 rounded-xl p-4 space-y-4 bg-gray-50">
          <h4 className="font-medium text-sm text-gray-900">
            {editingSlot ? "Modifier le créneau" : "Nouveau créneau"}
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Début</Label>
              <input
                type="datetime-local"
                value={formStart}
                onChange={(e) => setFormStart(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fin</Label>
              <input
                type="datetime-local"
                value={formEnd}
                onChange={(e) => setFormEnd(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Capacité</Label>
              <Input
                type="number"
                min="1"
                value={formCapacity}
                onChange={(e) => setFormCapacity(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            {resources.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Salle (optionnel)</Label>
                <select
                  value={formResourceId}
                  onChange={(e) => setFormResourceId(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                >
                  <option value="">Aucune (capacité globale)</option>
                  {resources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.capacity} pl.)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSaveSlot} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              {editingSlot ? "Modifier" : "Créer"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowAddForm(false)
                setEditingSlot(null)
              }}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}

      {/* Duplicate modal */}
      {duplicatingSlot && (
        <div className="border border-blue-200 rounded-xl p-4 space-y-3 bg-blue-50">
          <h4 className="font-medium text-sm text-blue-900">
            Dupliquer &quot;{formatTime(duplicatingSlot.startAt)}&quot; sur d&apos;autres jours
          </h4>
          <div className="space-y-1">
            <Label className="text-xs text-blue-800">Dates cibles (YYYY-MM-DD, une par ligne ou virgule)</Label>
            <textarea
              value={dupDates}
              onChange={(e) => setDupDates(e.target.value)}
              placeholder={"2026-03-01\n2026-03-08\n2026-03-15"}
              className="w-full border border-blue-200 rounded-lg px-2 py-1.5 text-sm min-h-[80px]"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => handleDuplicate(duplicatingSlot)}>
              Dupliquer
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDuplicatingSlot(null)
                setDupDates("")
              }}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}

      {/* Slots list */}
      {isLoading ? (
        <div className="text-center py-8">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" />
        </div>
      ) : dateKeys.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-200 rounded-xl">
          <Calendar className="h-10 w-10 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm font-medium">Aucun créneau sur cette période</p>
          <p className="text-gray-400 text-xs mt-1">
            Générez des créneaux depuis vos paramètres ou ajoutez-en manuellement.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {dateKeys.map((dateKey) => {
            const daySlots = grouped.get(dateKey) ?? []
            const expanded = expandedDates.has(dateKey)
            const dateLabel = new Date(dateKey + "T12:00:00").toLocaleDateString("fr-FR", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })

            return (
              <div key={dateKey} className="border border-gray-100 rounded-xl overflow-hidden">
                {/* Day header */}
                <button
                  onClick={() => toggleDate(dateKey)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-sm text-gray-900 capitalize">{dateLabel}</span>
                    <span className="text-xs text-gray-400">
                      {daySlots.length} créneau{daySlots.length > 1 ? "x" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        openAddForm(dateKey)
                      }}
                      className="p-1 rounded hover:bg-gray-200 transition-colors"
                      title="Ajouter un créneau ce jour"
                    >
                      <CalendarPlus className="h-3.5 w-3.5 text-gray-500" />
                    </button>
                    {expanded ? (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Day slots */}
                {expanded && (
                  <div className="divide-y divide-gray-50">
                    {daySlots.map((slot) => (
                      <div
                        key={slot.id}
                        className={`flex items-center gap-3 px-4 py-3 ${!slot.isActive ? "opacity-50 bg-gray-50" : ""}`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              {formatTime(slot.startAt)} – {formatTime(slot.endAt)}
                            </span>
                            <span className="text-xs text-gray-400">
                              {slot.capacity} pl.
                            </span>
                            {slot.resource && (
                              <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                                {slot.resource.name}
                              </span>
                            )}
                            {slot.source === "MANUAL" && (
                              <span className="text-xs bg-orange-50 text-orange-500 px-1.5 py-0.5 rounded">
                                Manuel
                              </span>
                            )}
                            {slot._count.reservations > 0 && (
                              <span className="text-xs text-green-600 font-medium">
                                {slot._count.reservations} rés.
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleToggle(slot.id)}
                            title={slot.isActive ? "Désactiver" : "Activer"}
                            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            {slot.isActive ? (
                              <ToggleRight className="h-4 w-4 text-green-500" />
                            ) : (
                              <ToggleLeft className="h-4 w-4 text-gray-400" />
                            )}
                          </button>
                          <button
                            onClick={() => openEditForm(slot)}
                            title="Modifier"
                            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            <Edit3 className="h-3.5 w-3.5 text-gray-400" />
                          </button>
                          <button
                            onClick={() => {
                              setDuplicatingSlot(slot)
                              setDupDates("")
                            }}
                            title="Dupliquer sur d'autres jours"
                            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            <Copy className="h-3.5 w-3.5 text-gray-400" />
                          </button>
                          <button
                            onClick={() => handleDelete(slot.id)}
                            title="Supprimer"
                            className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-400" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
