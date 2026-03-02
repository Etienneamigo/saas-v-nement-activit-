"use client"

/**
 * Composant FavoriteButton réutilisable.
 * - Optimistic UI (état local immédiat, rollback si erreur)
 * - CTA login si utilisateur non connecté
 * - Variantes: "icon" (cœur seul), "pill" (cœur + texte)
 * - z-index correct pour ne pas bloquer le scroll
 */

import { useState, useEffect } from "react"
import { toggleFavorite } from "@/app/actions/favorites"
import { toast } from "sonner"
import { Heart, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface FavoriteButtonProps {
  activityId: string
  isFavorited?: boolean
  isAuthenticated?: boolean
  variant?: "icon" | "pill"
  size?: "sm" | "md"
  className?: string
  /** Callback appelé après toggle réussi */
  onToggle?: (isFavorited: boolean) => void
}

export function FavoriteButton({
  activityId,
  isFavorited: initialFavorited = false,
  isAuthenticated = false,
  variant = "icon",
  size = "md",
  className,
  onToggle,
}: FavoriteButtonProps) {
  const [isFavorited, setIsFavorited] = useState(initialFavorited)
  const [isLoading, setIsLoading] = useState(false)

  // Sync avec la prop parent (ex: même activité dans le feed — plusieurs vidéos)
  useEffect(() => {
    if (!isLoading) setIsFavorited(initialFavorited)
  }, [initialFavorited]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    if (!isAuthenticated) {
      toast("Connectez-vous pour ajouter en favoris", {
        action: {
          label: "Se connecter",
          onClick: () => {
            window.location.href = "/auth/connexion"
          },
        },
      })
      return
    }

    // Optimistic UI
    const newState = !isFavorited
    setIsFavorited(newState)
    setIsLoading(true)

    const result = await toggleFavorite(activityId)
    setIsLoading(false)

    if (result.error) {
      // Rollback
      setIsFavorited(!newState)
      toast.error(result.error)
    } else {
      onToggle?.(newState)
      if (newState) {
        toast.success("Ajouté aux favoris")
      } else {
        toast.success("Retiré des favoris")
      }
    }
  }

  const iconSize = size === "sm" ? "h-4 w-4" : "h-5 w-5"

  if (variant === "pill") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          isFavorited
            ? "bg-red-50 text-red-600 hover:bg-red-100"
            : "bg-white/80 text-gray-700 hover:bg-white",
          "shadow-sm backdrop-blur-sm",
          className
        )}
        aria-label={isFavorited ? "Retirer des favoris" : "Ajouter aux favoris"}
        aria-pressed={isFavorited}
      >
        {isLoading ? (
          <Loader2 className={cn(iconSize, "animate-spin")} />
        ) : (
          <Heart
            className={cn(iconSize, isFavorited ? "fill-current" : "")}
          />
        )}
        <span>{isFavorited ? "Favori" : "Favori"}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      className={cn(
        "flex items-center justify-center rounded-full transition-all",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        size === "sm" ? "h-8 w-8" : "h-10 w-10",
        isFavorited
          ? "bg-red-50/90 text-red-500 hover:bg-red-100/90"
          : "bg-white/80 text-gray-500 hover:bg-white hover:text-red-400",
        "shadow-sm backdrop-blur-sm",
        className
      )}
      aria-label={isFavorited ? "Retirer des favoris" : "Ajouter aux favoris"}
      aria-pressed={isFavorited}
    >
      {isLoading ? (
        <Loader2 className={cn(iconSize, "animate-spin")} />
      ) : (
        <Heart
          className={cn(iconSize, isFavorited ? "fill-current text-red-500" : "")}
        />
      )}
    </button>
  )
}
