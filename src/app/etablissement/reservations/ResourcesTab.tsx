"use client"

import { useState, useRef } from "react"
import { toast } from "sonner"
import { createResource, updateResource, deleteResource } from "@/app/actions/slots"
import { saveReservationSettings } from "@/app/actions/reservations"
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
import { Plus, Trash2, Edit3, Loader2, ToggleLeft, ToggleRight, Warehouse, Save, Settings2, Upload, X, ImageIcon } from "lucide-react"
import { safeParseInt } from "@/lib/parse-utils"

/** Sentinel value for "use default" in Select (Radix does not support value="") */
const SELECT_DEFAULT = "__default__"

type Resource = {
  id: string
  name: string
  capacity: number
  isActive: boolean
  description: string | null
  imageUrl: string | null
  useCustomRules: boolean
  minPartySizeOverride: number | null
  maxPartySizeOverride: number | null
  slotDurationMinutesOverride: number | null
  bookingWindowDaysOverride: number | null
}

interface DefaultRules {
  slotDurationMinutes: number
  capacityPerSlot: number
  minPartySize: number
  maxPartySize: number
  bookingWindowDays: number
}

interface ResourcesTabProps {
  initialResources: Resource[]
  defaultRules: DefaultRules
  onDefaultRulesChange?: (rules: DefaultRules) => void
  onResourcesChange?: (resources: Resource[]) => void
}

export function ResourcesTab({ initialResources, defaultRules, onDefaultRulesChange, onResourcesChange }: ResourcesTabProps) {
  const [resources, setResources] = useState<Resource[]>(initialResources)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingDefaults, setSavingDefaults] = useState(false)

  // Default rules state
  const [defSlotDuration, setDefSlotDuration] = useState(String(defaultRules.slotDurationMinutes))
  const [defCapacity, setDefCapacity] = useState(String(defaultRules.capacityPerSlot))
  const [defMinParty, setDefMinParty] = useState(String(defaultRules.minPartySize))
  const [defMaxParty, setDefMaxParty] = useState(String(defaultRules.maxPartySize))
  const [defBookingWindow, setDefBookingWindow] = useState(String(defaultRules.bookingWindowDays))

  // Resource form state
  const [formName, setFormName] = useState("")
  const [formCapacity, setFormCapacity] = useState("10")
  const [formDescription, setFormDescription] = useState("")
  const [formImageUrl, setFormImageUrl] = useState("")
  const [formUseCustomRules, setFormUseCustomRules] = useState(false)
  const [formMinParty, setFormMinParty] = useState("")
  const [formMaxParty, setFormMaxParty] = useState("")
  const [formSlotDuration, setFormSlotDuration] = useState("")
  const [formBookingWindow, setFormBookingWindow] = useState("")
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  function resetForm() {
    setFormName("")
    setFormCapacity("10")
    setFormDescription("")
    setFormImageUrl("")
    setFormUseCustomRules(false)
    setFormMinParty("")
    setFormMaxParty("")
    setFormSlotDuration("")
    setFormBookingWindow("")
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingImage(true)
    try {
      // Try Cloudflare Images first, fallback to local upload
      const duRes = await fetch("/api/cloudflare/images/direct-upload", { method: "POST" })
      const duData = await duRes.json()

      if (duRes.ok) {
        // Cloudflare path
        const uploadForm = new FormData()
        uploadForm.append("file", file)
        const uploadRes = await fetch(duData.uploadURL, { method: "POST", body: uploadForm })
        if (!uploadRes.ok) {
          toast.error("Erreur lors de l'upload de l'image")
          setIsUploadingImage(false)
          return
        }
        // Build Cloudflare delivery URL
        const cfResult = await uploadRes.json()
        const variants = cfResult?.result?.variants
        const url = Array.isArray(variants) && variants.length > 0 ? variants[0] : null
        if (url) {
          setFormImageUrl(url)
          toast.success("Image uploadée")
        } else {
          toast.error("Erreur: pas d'URL retournée par Cloudflare")
        }
      } else {
        // Local fallback
        const formData = new FormData()
        formData.append("file", file)
        const response = await fetch("/api/upload", { method: "POST", body: formData })
        const data = await response.json()
        if (!response.ok) {
          toast.error(data.error || "Erreur lors de l'upload")
        } else {
          setFormImageUrl(data.url)
          toast.success("Image uploadée")
        }
      }
    } catch {
      toast.error("Erreur lors de l'upload de l'image")
    }
    setIsUploadingImage(false)
    if (imageInputRef.current) imageInputRef.current.value = ""
  }

  function openCreate() {
    setEditingId(null)
    resetForm()
    setShowForm(true)
  }

  function openEdit(r: Resource) {
    setEditingId(r.id)
    setFormName(r.name)
    setFormCapacity(String(r.capacity))
    setFormDescription(r.description ?? "")
    setFormImageUrl(r.imageUrl ?? "")
    setFormUseCustomRules(r.useCustomRules)
    setFormMinParty(r.minPartySizeOverride != null ? String(r.minPartySizeOverride) : "")
    setFormMaxParty(r.maxPartySizeOverride != null ? String(r.maxPartySizeOverride) : "")
    setFormSlotDuration(r.slotDurationMinutesOverride != null ? String(r.slotDurationMinutesOverride) : "")
    setFormBookingWindow(r.bookingWindowDaysOverride != null ? String(r.bookingWindowDaysOverride) : "")
    setShowForm(true)
  }

  async function handleSaveDefaults() {
    setSavingDefaults(true)
    const rules = {
      slotDurationMinutes: safeParseInt(defSlotDuration) ?? defaultRules.slotDurationMinutes,
      capacityPerSlot: safeParseInt(defCapacity) ?? defaultRules.capacityPerSlot,
      minPartySize: safeParseInt(defMinParty) ?? defaultRules.minPartySize,
      maxPartySize: safeParseInt(defMaxParty) ?? defaultRules.maxPartySize,
      bookingWindowDays: safeParseInt(defBookingWindow) ?? defaultRules.bookingWindowDays,
    }
    onDefaultRulesChange?.(rules)
    toast.success("Pensez à enregistrer dans l'onglet Paramètres pour persister ces changements")
    setSavingDefaults(false)
  }

  async function handleSave() {
    if (!formName.trim()) return toast.error("Nom requis")
    setSaving(true)

    const slotDurationValue = formSlotDuration === SELECT_DEFAULT ? "" : formSlotDuration
    const data = {
      name: formName.trim(),
      capacity: safeParseInt(formCapacity) ?? 1,
      isActive: true,
      description: formDescription.trim() || null,
      imageUrl: formImageUrl.trim() || null,
      useCustomRules: formUseCustomRules,
      minPartySizeOverride: formUseCustomRules ? (safeParseInt(formMinParty) ?? null) : null,
      maxPartySizeOverride: formUseCustomRules ? (safeParseInt(formMaxParty) ?? null) : null,
      slotDurationMinutesOverride: formUseCustomRules ? (safeParseInt(slotDurationValue) ?? null) : null,
      bookingWindowDaysOverride: formUseCustomRules ? (safeParseInt(formBookingWindow) ?? null) : null,
    }

    let result
    if (editingId) {
      result = await updateResource(editingId, data)
    } else {
      result = await createResource(data)
    }
    setSaving(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(editingId ? "Ressource modifiée" : "Ressource créée")
      setShowForm(false)

      if (editingId && "resource" in result && result.resource) {
        const updated = resources.map((r) =>
          r.id === editingId ? { ...r, ...data } : r
        )
        setResources(updated)
        onResourcesChange?.(updated)
      } else if ("resource" in result && result.resource) {
        const newResource = { ...(result.resource as Resource), ...data, id: (result.resource as Resource).id }
        const next = [...resources, newResource]
        setResources(next)
        onResourcesChange?.(next)
      }
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cette ressource ? Les créneaux associés seront mis à jour.")) return
    const result = await deleteResource(id)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Ressource supprimée")
      const next = resources.filter((r) => r.id !== id)
      setResources(next)
      onResourcesChange?.(next)
    }
  }

  async function handleToggle(r: Resource) {
    const result = await updateResource(r.id, {
      name: r.name,
      capacity: r.capacity,
      isActive: !r.isActive,
      description: r.description,
      imageUrl: r.imageUrl,
      useCustomRules: r.useCustomRules,
      minPartySizeOverride: r.minPartySizeOverride,
      maxPartySizeOverride: r.maxPartySizeOverride,
      slotDurationMinutesOverride: r.slotDurationMinutesOverride,
      bookingWindowDaysOverride: r.bookingWindowDaysOverride,
    })
    if (result.error) {
      toast.error(result.error)
    } else {
      const next = resources.map((res) =>
        res.id === r.id ? { ...res, isActive: !res.isActive } : res
      )
      setResources(next)
      onResourcesChange?.(next)
    }
  }

  return (
    <div className="space-y-6">
      {/* Default Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Règles par défaut
          </CardTitle>
          <CardDescription>
            Ces règles s&apos;appliquent à toutes les ressources sauf celles avec des règles personnalisées.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Durée d&apos;un créneau (minutes)</Label>
              <Select value={defSlotDuration} onValueChange={setDefSlotDuration}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[15, 30, 45, 60, 90, 120, 180, 240].map((v) => (
                    <SelectItem key={v} value={String(v)}>{v} min</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Capacité par créneau</Label>
              <Input type="number" min="1" value={defCapacity} onChange={(e) => setDefCapacity(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Taille min du groupe</Label>
              <Input type="number" min="1" value={defMinParty} onChange={(e) => setDefMinParty(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Taille max du groupe</Label>
              <Input type="number" min="1" value={defMaxParty} onChange={(e) => setDefMaxParty(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Fenêtre de réservation (jours)</Label>
              <Input type="number" min="1" max="365" value={defBookingWindow} onChange={(e) => setDefBookingWindow(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={handleSaveDefaults} disabled={savingDefaults}>
              <Save className="h-3.5 w-3.5 mr-1" />
              Appliquer
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resources header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900">Ressources</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Gérez vos ressources réservables (salles, pistes, terrains, tables…).
            Chaque ressource peut hériter des règles par défaut ou avoir ses propres règles.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Ajouter
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="border border-gray-200 rounded-xl p-4 space-y-4 bg-gray-50">
          <h4 className="text-sm font-medium text-gray-900">
            {editingId ? "Modifier la ressource" : "Nouvelle ressource"}
          </h4>

          {/* Basic fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Nom *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Salle A, Piste 1, Terrain B…"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Capacité *</Label>
              <Input
                type="number" min="1"
                value={formCapacity}
                onChange={(e) => setFormCapacity(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* Description & Image */}
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Description de la ressource…"
              className="w-full border border-gray-200 rounded text-sm p-2 min-h-[60px] focus:outline-none focus:border-gray-400 bg-white"
            />
          </div>
          {/* Image upload */}
          <div className="space-y-1">
            <Label className="text-xs">Image</Label>
            {formImageUrl ? (
              <div className="flex items-center gap-3">
                <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                  <img
                    src={formImageUrl.startsWith("/uploads/") ? formImageUrl.replace("/uploads/", "/api/uploads/") : formImageUrl}
                    alt="Aperçu"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="h-7 text-xs"
                  >
                    {isUploadingImage ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
                    Remplacer
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setFormImageUrl("")}
                    className="h-7 text-xs text-red-500 hover:text-red-600"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Supprimer
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={isUploadingImage}
                className="w-full border-2 border-dashed border-gray-200 rounded-lg py-4 flex flex-col items-center gap-1 hover:border-gray-400 transition-colors cursor-pointer"
              >
                {isUploadingImage ? (
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-gray-400" />
                )}
                <span className="text-xs text-gray-400">
                  {isUploadingImage ? "Upload en cours…" : "Cliquez pour uploader une image"}
                </span>
              </button>
            )}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleImageUpload}
            />
          </div>

          {/* Custom rules toggle */}
          <div className="border-t border-gray-200 pt-3 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formUseCustomRules}
                onChange={(e) => setFormUseCustomRules(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <div>
                <span className="text-sm font-medium">Règles personnalisées</span>
                <p className="text-xs text-gray-400">
                  {formUseCustomRules
                    ? "Ces règles s'appliquent à cette ressource uniquement."
                    : "Cette ressource utilise les règles par défaut."}
                </p>
              </div>
            </label>

            {formUseCustomRules ? (
              <div className="grid grid-cols-2 gap-3 p-3 border border-blue-100 rounded-lg bg-blue-50/50">
                <div className="space-y-1">
                  <Label className="text-xs">Durée créneau (min)</Label>
                  <Select value={formSlotDuration || SELECT_DEFAULT} onValueChange={(v) => setFormSlotDuration(v === SELECT_DEFAULT ? "" : v)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={`Par défaut (${defSlotDuration})`} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SELECT_DEFAULT}>Par défaut ({defSlotDuration} min)</SelectItem>
                      {[15, 30, 45, 60, 90, 120, 180, 240].map((v) => (
                        <SelectItem key={v} value={String(v)}>{v} min</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Taille min groupe</Label>
                  <Input
                    type="number" min="1"
                    value={formMinParty}
                    onChange={(e) => setFormMinParty(e.target.value)}
                    placeholder={`Par défaut (${defMinParty})`}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Taille max groupe</Label>
                  <Input
                    type="number" min="1"
                    value={formMaxParty}
                    onChange={(e) => setFormMaxParty(e.target.value)}
                    placeholder={`Par défaut (${defMaxParty})`}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fenêtre résa (jours)</Label>
                  <Input
                    type="number" min="1" max="365"
                    value={formBookingWindow}
                    onChange={(e) => setFormBookingWindow(e.target.value)}
                    placeholder={`Par défaut (${defBookingWindow})`}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 p-3 border border-gray-100 rounded-lg bg-white opacity-60">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-400">Durée créneau</Label>
                  <p className="text-sm text-gray-400">{defSlotDuration} min</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-400">Taille min groupe</Label>
                  <p className="text-sm text-gray-400">{defMinParty}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-400">Taille max groupe</Label>
                  <p className="text-sm text-gray-400">{defMaxParty}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-400">Fenêtre résa</Label>
                  <p className="text-sm text-gray-400">{defBookingWindow} jours</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              {editingId ? "Modifier" : "Créer"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>
              Annuler
            </Button>
          </div>
        </div>
      )}

      {/* Resources list */}
      {resources.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl">
          <Warehouse className="h-8 w-8 mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">Aucune ressource configurée</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Sans ressources, la capacité est globale par créneau.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
          {resources.map((r) => (
            <div
              key={r.id}
              className={`flex items-center gap-3 px-4 py-3 ${!r.isActive ? "opacity-50 bg-gray-50" : "bg-white"}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-gray-900">{r.name}</span>
                  <span className="text-xs text-gray-400">{r.capacity} place{r.capacity > 1 ? "s" : ""}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    r.useCustomRules
                      ? "bg-blue-50 text-blue-600"
                      : "bg-gray-100 text-gray-500"
                  }`}>
                    {r.useCustomRules ? "Personnalisé" : "Par défaut"}
                  </span>
                  {!r.isActive && <span className="text-xs text-gray-400">(inactif)</span>}
                </div>
                {r.description && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{r.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleToggle(r)}
                  title={r.isActive ? "Désactiver" : "Activer"}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  {r.isActive ? (
                    <ToggleRight className="h-4 w-4 text-green-500" />
                  ) : (
                    <ToggleLeft className="h-4 w-4 text-gray-400" />
                  )}
                </button>
                <button
                  onClick={() => openEdit(r)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <Edit3 className="h-3.5 w-3.5 text-gray-400" />
                </button>
                <button
                  onClick={() => handleDelete(r.id)}
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
}
