/**
 * Templates et envoi d'emails pour les réservations.
 */

import { sendEmail } from "@/lib/email"

interface ReservationEmailData {
  customerName: string
  customerEmail: string
  establishmentName: string
  establishmentAddress?: string | null
  establishmentCity?: string | null
  activityTitle?: string | null
  startAt: Date
  endAt: Date
  partySize: number
  cancellationPolicyText?: string | null
  reservationId: string
}

function formatDateTimeFR(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }) + " à " + date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

export async function sendReservationConfirmationEmail(
  data: ReservationEmailData
): Promise<void> {
  const baseUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000"
  const myReservationsUrl = `${baseUrl}/profil/reservations`

  const addressLine = [data.establishmentAddress, data.establishmentCity]
    .filter(Boolean)
    .join(", ")

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Réservation confirmée</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #333; margin-bottom: 5px;">WADELO</h1>
        <p style="color: #666; margin: 0; font-size: 14px;">Votre réservation est confirmée !</p>
      </div>

      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
          <span style="font-size: 20px;">✅</span>
          <h2 style="margin: 0; color: #15803d;">Réservation confirmée</h2>
        </div>
        <p style="margin: 0 0 4px; font-size: 14px; color: #166534;">
          Bonjour <strong>${data.customerName}</strong>, votre réservation a bien été enregistrée.
        </p>
      </div>

      <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
        <h3 style="margin: 0 0 16px; font-size: 16px; color: #111827;">Détails de votre réservation</h3>

        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 40%;">Établissement</td>
            <td style="padding: 8px 0; font-size: 14px; font-weight: 600;">${data.establishmentName}</td>
          </tr>
          ${data.activityTitle ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Activité</td>
            <td style="padding: 8px 0; font-size: 14px;">${data.activityTitle}</td>
          </tr>
          ` : ""}
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Date et heure</td>
            <td style="padding: 8px 0; font-size: 14px; font-weight: 600;">${formatDateTimeFR(data.startAt)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Personnes</td>
            <td style="padding: 8px 0; font-size: 14px;">${data.partySize} personne${data.partySize > 1 ? "s" : ""}</td>
          </tr>
          ${addressLine ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px; vertical-align: top;">Adresse</td>
            <td style="padding: 8px 0; font-size: 14px;">${addressLine}</td>
          </tr>
          ` : ""}
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Référence</td>
            <td style="padding: 8px 0; font-size: 12px; color: #9ca3af;">${data.reservationId}</td>
          </tr>
        </table>
      </div>

      ${data.cancellationPolicyText ? `
      <div style="background: #fafafa; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <h4 style="margin: 0 0 8px; font-size: 14px; color: #374151;">Politique d'annulation</h4>
        <p style="margin: 0; font-size: 13px; color: #6b7280;">${data.cancellationPolicyText}</p>
      </div>
      ` : ""}

      <div style="text-align: center; margin: 24px 0;">
        <a href="${myReservationsUrl}"
           style="display: inline-block; background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">
          Voir mes réservations
        </a>
      </div>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
      <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
        Cet email a été envoyé automatiquement par Wadelo. Ne pas répondre à cet email.
      </p>
    </body>
    </html>
  `

  await sendEmail({
    to: data.customerEmail,
    subject: `Réservation confirmée — ${data.establishmentName}`,
    html,
  })
}

export async function sendReservationNotificationToEstablishment(
  notificationEmail: string,
  data: ReservationEmailData
): Promise<void> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>Nouvelle réservation</title></head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2>Nouvelle réservation reçue</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr><td style="padding: 6px 0; color: #666; width: 40%;">Client</td><td style="padding: 6px 0; font-weight: 600;">${data.customerName}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Email</td><td style="padding: 6px 0;">${data.customerEmail}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Date</td><td style="padding: 6px 0; font-weight: 600;">${formatDateTimeFR(data.startAt)}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Personnes</td><td style="padding: 6px 0;">${data.partySize}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Référence</td><td style="padding: 6px 0; font-size: 12px; color: #9ca3af;">${data.reservationId}</td></tr>
      </table>
    </body>
    </html>
  `

  await sendEmail({
    to: notificationEmail,
    subject: `Nouvelle réservation — ${data.customerName} · ${formatDateTimeFR(data.startAt)}`,
    html,
  })
}
