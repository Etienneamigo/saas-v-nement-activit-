"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { getUserReservations, cancelUserReservation } from "@/app/actions/slots"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  CalendarCheck,
  MapPin,
  Users,
  Clock,
  XCircle,
  Loader2,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"

type Reservation = Awaited<ReturnType<typeof getUserReservations>>["reservations"][number]

function formatDateFR(date: Date | string) {
  return new Date(date).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function formatTimeFR(date: Date | string) {
  return new Date(date).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function canCancel(reservation: Reservation): boolean {
  if (reservation.status !== "CONFIRMED") return false
  if (!reservation.settings.cancellationEnabled) return false
  const deadline = new Date(
    new Date(reservation.startAt).getTime() -
      reservation.settings.cancellationDeadlineHours * 3600 * 1000
  )
  return new Date() < deadline
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "CONFIRMED":
      return <Badge className="bg-green-100 text-green-700 border-0">Confirmée</Badge>
    case "CANCELLED":
      return <Badge className="bg-gray-100 text-gray-500 border-0">Annulée</Badge>
    case "NO_SHOW":
      return <Badge className="bg-orange-100 text-orange-600 border-0">Non présenté</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function ReservationCard({
  reservation,
  onCancel,
}: {
  reservation: Reservation
  onCancel: (id: string) => void
}) {
  const [cancelling, setCancelling] = useState(false)

  async function handleCancel() {
    if (!confirm("Annuler cette réservation ?")) return
    setCancelling(true)
    const result = await cancelUserReservation(reservation.id)
    setCancelling(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Réservation annulée")
      onCancel(reservation.id)
    }
  }

  const isPast = new Date(reservation.startAt) < new Date()

  return (
    <div className={`border rounded-xl p-4 space-y-3 ${isPast ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900">
              {reservation.establishment.activity?.title || reservation.establishment.name}
            </h3>
            <StatusBadge status={reservation.status} />
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{reservation.establishment.name}</p>
        </div>
        <Link href={`/activite/${reservation.establishment.activity?.title ? "" : ""}`}>
          <ChevronRight className="h-5 w-5 text-gray-300 mt-1" />
        </Link>
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
        <span className="flex items-center gap-1.5">
          <CalendarCheck className="h-4 w-4 text-gray-400" />
          {formatDateFR(reservation.startAt)}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-gray-400" />
          {formatTimeFR(reservation.startAt)} – {formatTimeFR(reservation.endAt)}
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="h-4 w-4 text-gray-400" />
          {reservation.partySize} personne{reservation.partySize > 1 ? "s" : ""}
        </span>
        {(reservation.establishment.address || reservation.establishment.city) && (
          <span className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-gray-400" />
            {[reservation.establishment.address, reservation.establishment.city]
              .filter(Boolean)
              .join(", ")}
          </span>
        )}
      </div>

      {reservation.resource && (
        <p className="text-xs text-gray-500">Salle : {reservation.resource.name}</p>
      )}

      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-gray-400 font-mono">{reservation.id}</p>
        {canCancel(reservation) && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={cancelling}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            {cancelling ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
            )}
            Annuler
          </Button>
        )}
      </div>
    </div>
  )
}

export function MyReservationsClient() {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming")
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)
    getUserReservations(tab).then((result) => {
      setReservations(result.reservations ?? [])
      setIsLoading(false)
    })
  }, [tab])

  function handleCancel(id: string) {
    setReservations((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mes réservations</h1>
        <p className="text-gray-500 text-sm mt-1">
          Consultez et gérez toutes vos réservations.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-6 w-fit">
        <button
          onClick={() => setTab("upcoming")}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            tab === "upcoming"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          À venir
        </button>
        <button
          onClick={() => setTab("past")}
          className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
            tab === "past"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Passées
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-xl p-4 animate-pulse space-y-3">
              <div className="h-4 bg-gray-100 rounded w-48" />
              <div className="h-3 bg-gray-100 rounded w-64" />
              <div className="h-3 bg-gray-100 rounded w-32" />
            </div>
          ))}
        </div>
      ) : reservations.length === 0 ? (
        <div className="text-center py-16">
          {tab === "upcoming" ? (
            <>
              <CalendarCheck className="h-12 w-12 mx-auto text-gray-200 mb-4" />
              <p className="text-gray-500 font-medium">Aucune réservation à venir</p>
              <p className="text-gray-400 text-sm mt-1">
                Explorez des activités et réservez votre prochaine sortie !
              </p>
              <Button asChild className="mt-4">
                <Link href="/recherche">Découvrir des activités</Link>
              </Button>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-12 w-12 mx-auto text-gray-200 mb-4" />
              <p className="text-gray-500 font-medium">Aucune réservation passée</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {reservations.map((r) => (
            <ReservationCard key={r.id} reservation={r} onCancel={handleCancel} />
          ))}
        </div>
      )}
    </div>
  )
}
