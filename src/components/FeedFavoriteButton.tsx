"use client"

import { useState } from "react"
import { Heart } from "lucide-react"
import { toggleFavorite } from "@/app/actions/favorites"
import { toast } from "sonner"

interface FeedFavoriteButtonProps {
  activityId: string
  initialFavorited: boolean
  isAuthenticated: boolean
}

export function FeedFavoriteButton({ activityId, initialFavorited, isAuthenticated }: FeedFavoriteButtonProps) {
  const [isFavorited, setIsFavorited] = useState(initialFavorited)
  const [isLoading, setIsLoading] = useState(false)

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault() // Ne pas naviguer vers la page activité
    e.stopPropagation()

    if (!isAuthenticated) {
      toast.error("Connectez-vous pour ajouter aux favoris")
      return
    }

    // Optimistic UI
    const previous = isFavorited
    setIsFavorited(!isFavorited)
    setIsLoading(true)

    const result = await toggleFavorite(activityId)
    setIsLoading(false)

    if (result.error) {
      // Rollback
      setIsFavorited(previous)
      toast.error(result.error)
    } else {
      setIsFavorited(result.isFavorited ?? false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      aria-label={isFavorited ? "Retirer des favoris" : "Ajouter aux favoris"}
      className={`flex-shrink-0 p-1.5 rounded-full transition-colors ${
        isFavorited
          ? "text-red-500 hover:text-red-600"
          : "text-gray-300 hover:text-gray-500"
      } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <Heart
        className={`h-4 w-4 transition-transform ${isFavorited ? "fill-current scale-110" : ""}`}
      />
    </button>
  )
}
