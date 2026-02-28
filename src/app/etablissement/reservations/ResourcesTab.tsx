"use client"

import { useState } from "react"
import { toast } from "sonner"
import { createResource, updateResource, deleteResource } from "@/app/actions/slots"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Trash2, Edit3, Loader2, ToggleLeft, ToggleRight, Warehouse } from "lucide-react"

type Resource = {
  id: string
  name: string
  capacity: number
  isActive: boolean
}

interface ResourcesTabProps {
  initialResources: Resource[]
  onResourcesChange?: (resources: Resource[]) => void
}

export function ResourcesTab({ initialResources, onResourcesChange }: ResourcesTabProps) {
  const [resources, setResources] = useState<Resource[]>(initialResources)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState("")
  const [formCapacity, setFormCapacity] = useState("10")
  const [saving, setSaving] = useState(false)

  function openCreate() {
    setEditingId(null)
    setFormName("")
    setFormCapacity("10")
    setShowForm(true)
  }

  function openEdit(r: Resource) {
    setEditingId(r.id)
    setFormName(r.name)
    setFormCapacity(String(r.capacity))
    setShowForm(true)
  }

  async function handleSave() {
    if (!formName.trim()) return toast.error("Nom requis")
    setSaving(true)

    const data = { name: formName.trim(), capacity: parseInt(formCapacity), isActive: true }
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
      toast.success(editingId ? "Salle modifiée" : "Salle créée")
      setShowForm(false)

      if (editingId && "resource" in result && result.resource) {
        const updated = resources.map((r) =>
          r.id === editingId ? { ...r, name: formName.trim(), capacity: parseInt(formCapacity) } : r
        )
        setResources(updated)
        onResourcesChange?.(updated)
      } else if ("resource" in result && result.resource) {
        const next = [...resources, result.resource as Resource]
        setResources(next)
        onResourcesChange?.(next)
      }
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cette salle ? Les créneaux associés seront mis à jour.")) return
    const result = await deleteResource(id)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Salle supprimée")
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
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900">Salles / Ressources</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Utile pour les escape games, salles de sport, etc. où plusieurs groupes
            peuvent réserver en parallèle avec des capacités différentes.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Ajouter
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
          <h4 className="text-sm font-medium text-gray-900">
            {editingId ? "Modifier la salle" : "Nouvelle salle"}
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Nom</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Salle A, Salle Bleue…"
                className="h-8 text-sm"
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
          <p className="text-sm text-gray-400">Aucune salle configurée</p>
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
                <span className="font-medium text-sm text-gray-900">{r.name}</span>
                <span className="ml-2 text-xs text-gray-400">{r.capacity} place{r.capacity > 1 ? "s" : ""}</span>
                {!r.isActive && <span className="ml-2 text-xs text-gray-400">(inactif)</span>}
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
