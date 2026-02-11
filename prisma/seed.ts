import { PrismaClient, ActivityStatus, MediaKind } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Seeding database...")

  // Clean existing data
  await prisma.activityStatEvent.deleteMany()
  await prisma.favorite.deleteMany()
  await prisma.media.deleteMany()
  await prisma.activity.deleteMany()
  await prisma.establishment.deleteMany()
  await prisma.user.deleteMany()
  await prisma.promoCode.deleteMany()
  await prisma.activityTypeConfig.deleteMany()
  await prisma.videoCategoryConfig.deleteMany()
  await prisma.staticPage.deleteMany()

  // Seed activity types
  const activityTypes = [
    { slug: "BOWLING", label: "Bowling", emoji: "🎳", sortOrder: 1 },
    { slug: "ESCAPE_GAME", label: "Escape Game", emoji: "🔐", sortOrder: 2 },
    { slug: "BAR_DANSANT", label: "Bar/pub/club", emoji: "💃", sortOrder: 3 },
    { slug: "KARAOKE", label: "Karaoké", emoji: "🎤", sortOrder: 4 },
    { slug: "LASER_GAME", label: "Laser Game", emoji: "🔫", sortOrder: 5 },
    { slug: "CINEMA", label: "Cinéma", emoji: "🎬", sortOrder: 6 },
    { slug: "TRAMPOLINE_PARK", label: "Trampoline Park", emoji: "🤸", sortOrder: 7 },
    { slug: "KARTING", label: "Karting", emoji: "🏎️", sortOrder: 8 },
    { slug: "REALITE_VIRTUELLE", label: "Réalité virtuelle", emoji: "🥽", sortOrder: 9 },
    { slug: "QUIZ_GAME", label: "Quiz Game", emoji: "🧩", sortOrder: 10 },
    { slug: "MINIGOLF", label: "Minigolf", emoji: "⛳", sortOrder: 11 },
    { slug: "ESCALADE", label: "Escalade", emoji: "🧗", sortOrder: 12 },
    { slug: "PATINOIRE", label: "Patinoire", emoji: "⛸️", sortOrder: 13 },
    { slug: "SPA_BIEN_ETRE", label: "Spa & Bien-être", emoji: "🧖", sortOrder: 14 },
    { slug: "ATELIER", label: "Atelier", emoji: "🎨", sortOrder: 15 },
    { slug: "DEGUSTATION", label: "Dégustation", emoji: "🍷", sortOrder: 16 },
    { slug: "COMEDY_CLUB", label: "Comedy Club", emoji: "🎭", sortOrder: 17 },
    { slug: "MUSEE_EXPO", label: "Musée & Expo", emoji: "🏛️", sortOrder: 18 },
    { slug: "CONCERT_SPECTACLE", label: "Concert & Spectacle", emoji: "🎵", sortOrder: 19 },
  ]

  for (const at of activityTypes) {
    await prisma.activityTypeConfig.create({ data: at })
  }
  console.log("🏷️  Seeded", activityTypes.length, "activity types")

  // Seed video categories
  const videoCategories = [
    { slug: "teaser", label: "Teaser", sortOrder: 1 },
    { slug: "ambiance", label: "Ambiance", sortOrder: 2 },
    { slug: "cours", label: "Cours / Tutorial", sortOrder: 3 },
    { slug: "evenement", label: "Événement", sortOrder: 4 },
    { slug: "autre", label: "Autre", sortOrder: 5 },
  ]

  for (const vc of videoCategories) {
    await prisma.videoCategoryConfig.create({ data: vc })
  }
  console.log("🎬 Seeded", videoCategories.length, "video categories")

  // Seed static/legal pages
  const staticPages = [
    { slug: "mentions-legales", title: "Mentions légales" },
    { slug: "politique-confidentialite", title: "Politique de confidentialité" },
    { slug: "politique-cookies", title: "Politique cookies" },
    { slug: "cgu", title: "Conditions générales d'utilisation" },
    { slug: "cgv", title: "Conditions générales de vente" },
    { slug: "contact", title: "Contact" },
  ]

  for (const sp of staticPages) {
    await prisma.staticPage.create({
      data: { slug: sp.slug, title: sp.title, content: "" },
    })
  }
  console.log("📄 Seeded", staticPages.length, "static pages")

  console.log("🧹 Cleaned existing data")

  // Create admin user
  const adminUser = await prisma.user.create({
    data: {
      email: "admin@test.com",
      passwordHash: await bcrypt.hash("admin123", 12),
      name: "Administrateur",
      role: "ADMIN",
    },
  })
  console.log("👑 Created admin user: admin@test.com / admin123")

  // Create promo codes
  const promoCode1 = await prisma.promoCode.create({
    data: {
      code: "BIENVENUE2024",
      description: "Code de bienvenue - 30 jours supplementaires",
      extraTrialDays: 30,
      isActive: true,
    },
  })

  const promoCode2 = await prisma.promoCode.create({
    data: {
      code: "ETE2024",
      description: "Offre ete - 60 jours supplementaires",
      extraTrialDays: 60,
      maxRedemptions: 100,
      expiresAt: new Date("2024-09-30"),
      isActive: true,
    },
  })

  const promoCode3 = await prisma.promoCode.create({
    data: {
      code: "VIP",
      description: "Code VIP - 90 jours supplementaires (limite 10 utilisations)",
      extraTrialDays: 90,
      maxRedemptions: 10,
      isActive: true,
    },
  })
  console.log("🏷️  Created 3 promo codes: BIENVENUE2024, ETE2024, VIP")

  // Create test user
  const testUser = await prisma.user.create({
    data: {
      email: "user@test.com",
      passwordHash: await bcrypt.hash("password123", 12),
      name: "Jean Dupont",
      role: "USER",
    },
  })
  console.log("👤 Created test user: user@test.com / password123")

  // Calculate trial end dates - exactly 60 days (2 months)
  const trialEndsAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)

  // Create establishment 1 (Paris)
  const establishment1 = await prisma.user.create({
    data: {
      email: "bowling.paris@test.com",
      passwordHash: await bcrypt.hash("password123", 12),
      role: "ESTABLISHMENT",
      establishment: {
        create: {
          name: "Bowling Stadium Paris",
          phone: "01 23 45 67 89",
          website: "https://bowlingparis.example.com",
          address: "15 Boulevard de la Madeleine",
          city: "Paris",
          zipCode: "75008",
          country: "France",
          lat: 48.8699,
          lng: 2.3241,
          subscriptionStatus: "TRIALING",
          trialEndsAt,
        },
      },
    },
    include: { establishment: true },
  })
  console.log("🏢 Created establishment: bowling.paris@test.com / password123")

  // Create establishment 2 (Boulogne)
  const establishment2 = await prisma.user.create({
    data: {
      email: "loisirs.boulogne@test.com",
      passwordHash: await bcrypt.hash("password123", 12),
      role: "ESTABLISHMENT",
      establishment: {
        create: {
          name: "Loisirs & Fun Boulogne",
          phone: "01 98 76 54 32",
          website: "https://loisirsboulogne.example.com",
          address: "45 Rue du Chateau",
          city: "Boulogne-Billancourt",
          zipCode: "92100",
          country: "France",
          lat: 48.8332,
          lng: 2.2406,
          subscriptionStatus: "TRIALING",
          trialEndsAt,
          usedPromoCodeId: promoCode1.id, // This one used a promo code
        },
      },
    },
    include: { establishment: true },
  })
  console.log("🏢 Created establishment: loisirs.boulogne@test.com / password123")

  // Create establishment 3 (Lyon) - with expired trial
  const expiredTrialDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
  const establishment3 = await prisma.user.create({
    data: {
      email: "escape.lyon@test.com",
      passwordHash: await bcrypt.hash("password123", 12),
      role: "ESTABLISHMENT",
      establishment: {
        create: {
          name: "Mystery Escape Lyon",
          phone: "04 12 34 56 78",
          address: "25 Rue de la Republique",
          city: "Lyon",
          zipCode: "69002",
          country: "France",
          lat: 45.7640,
          lng: 4.8357,
          subscriptionStatus: "CANCELED",
          trialEndsAt: expiredTrialDate,
        },
      },
    },
    include: { establishment: true },
  })
  console.log("🏢 Created establishment (expired trial): escape.lyon@test.com / password123")

  // Placeholder images from Unsplash
  const bowlingImages = [
    "https://images.unsplash.com/photo-1545239705-1564e58b9e4a?w=800",
    "https://images.unsplash.com/photo-1580757468214-c73f7062a5cb?w=800",
  ]
  const escapeImages = [
    "https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?w=800",
  ]
  const laserImages = [
    "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=800",
  ]

  // Create 1 activity per establishment (1:1 constraint)

  // Activity for Establishment 1 (Paris Bowling)
  const activity1 = await prisma.activity.create({
    data: {
      establishmentId: establishment1.establishment!.id,
      type: "BOWLING",
      title: "Bowling Stadium Paris - 16 pistes",
      description:
        "Venez découvrir notre bowling moderne avec 16 pistes professionnelles, éclairages néon et système de score automatique. Parfait pour des soirées entre amis ou des anniversaires. Bar et restauration sur place.",
      address: "15 Boulevard de la Madeleine",
      city: "Paris",
      zipCode: "75008",
      lat: 48.8699,
      lng: 2.3241,
      minPeople: 2,
      maxPeople: 6,
      durationMinutes: 90,
      priceFrom: 12.5,
      scheduleText: "Lundi - Jeudi : 14h - 00h\nVendredi - Samedi : 14h - 02h\nDimanche : 10h - 00h",
      tags: ["famille", "amis", "soirée", "anniversaire"],
      status: ActivityStatus.PUBLISHED,
      viewCount: 45,
    },
  })

  // Add images to activity 1
  for (const imageUrl of bowlingImages) {
    await prisma.media.create({
      data: {
        activityId: activity1.id,
        kind: MediaKind.IMAGE,
        url: imageUrl,
      },
    })
  }
  console.log("✅ Created activity for Bowling Stadium Paris")

  // Activity for Establishment 2 (Boulogne Laser)
  const activity2 = await prisma.activity.create({
    data: {
      establishmentId: establishment2.establishment!.id,
      type: "LASER_GAME",
      title: "Laser Quest Boulogne",
      description:
        "Le plus grand labyrinthe laser de l'Ouest parisien ! 800m² de parcours avec effets spéciaux, fumée et musique. Parties de 20 minutes intenses. Idéal pour enterrements de vie de célibataire et team building.",
      address: "45 Rue du Chateau",
      city: "Boulogne-Billancourt",
      zipCode: "92100",
      lat: 48.8332,
      lng: 2.2406,
      minPeople: 6,
      maxPeople: 30,
      durationMinutes: 60,
      priceFrom: 15,
      scheduleText: "Mercredi : 14h - 22h\nSamedi - Dimanche : 10h - 22h\nVacances scolaires : 10h - 22h",
      tags: ["action", "équipe", "adrénaline", "team-building"],
      status: ActivityStatus.PUBLISHED,
      viewCount: 32,
    },
  })

  // Add images to activity 2
  for (const imageUrl of laserImages) {
    await prisma.media.create({
      data: {
        activityId: activity2.id,
        kind: MediaKind.IMAGE,
        url: imageUrl,
      },
    })
  }
  console.log("✅ Created activity for Laser Quest Boulogne")

  // Activity for Establishment 3 (Lyon Escape) - DRAFT status since trial expired
  const activity3 = await prisma.activity.create({
    data: {
      establishmentId: establishment3.establishment!.id,
      type: "ESCAPE_GAME",
      title: "L'Enigme du Vieux Lyon",
      description:
        "Plongez dans les mystères du Vieux Lyon ! Résolvez les énigmes cachées dans les traboules et découvrez le secret de la Renaissance lyonnaise. Scénario immersif avec décors historiques.",
      address: "25 Rue de la République",
      city: "Lyon",
      zipCode: "69002",
      lat: 45.7640,
      lng: 4.8357,
      minPeople: 2,
      maxPeople: 6,
      durationMinutes: 60,
      priceFrom: 28,
      scheduleText: "Tous les jours : 10h - 22h",
      tags: ["énigmes", "histoire", "équipe", "immersif"],
      status: ActivityStatus.DRAFT, // Draft because trial expired
      viewCount: 12,
    },
  })

  // Add images to activity 3
  for (const imageUrl of escapeImages) {
    await prisma.media.create({
      data: {
        activityId: activity3.id,
        kind: MediaKind.IMAGE,
        url: imageUrl,
      },
    })
  }
  console.log("✅ Created activity for Mystery Escape Lyon (draft)")

  // Add some favorites for the test user
  await prisma.favorite.create({
    data: {
      userId: testUser.id,
      activityId: activity1.id,
    },
  })
  await prisma.favorite.create({
    data: {
      userId: testUser.id,
      activityId: activity2.id,
    },
  })
  console.log("❤️  Added favorites for test user")

  // Add some sample analytics events
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Impressions for activity 1
  for (let i = 0; i < 50; i++) {
    await prisma.activityStatEvent.create({
      data: {
        activityId: activity1.id,
        type: "IMPRESSION",
        sessionId: `session-${i}`,
        createdAt: new Date(lastWeek.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000),
      },
    })
  }

  // Clicks for activity 1
  for (let i = 0; i < 15; i++) {
    await prisma.activityStatEvent.create({
      data: {
        activityId: activity1.id,
        type: "CLICK",
        sessionId: `session-${i}`,
        createdAt: new Date(lastWeek.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000),
      },
    })
  }

  // Impressions for activity 2
  for (let i = 0; i < 30; i++) {
    await prisma.activityStatEvent.create({
      data: {
        activityId: activity2.id,
        type: "IMPRESSION",
        sessionId: `session-${100 + i}`,
        createdAt: new Date(lastWeek.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000),
      },
    })
  }

  // Clicks for activity 2
  for (let i = 0; i < 10; i++) {
    await prisma.activityStatEvent.create({
      data: {
        activityId: activity2.id,
        type: "CLICK",
        sessionId: `session-${100 + i}`,
        createdAt: new Date(lastWeek.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000),
      },
    })
  }
  console.log("📊 Added sample analytics events")

  // Increment promo code redemption count for establishment 2
  await prisma.promoCode.update({
    where: { id: promoCode1.id },
    data: { redeemedCount: 1 },
  })

  console.log("")
  console.log("🎉 Seeding completed!")
  console.log("")
  console.log("📝 Test accounts:")
  console.log("   Admin: admin@test.com / admin123")
  console.log("   User: user@test.com / password123")
  console.log("   Establishment 1: bowling.paris@test.com / password123 (active trial)")
  console.log("   Establishment 2: loisirs.boulogne@test.com / password123 (used promo code)")
  console.log("   Establishment 3: escape.lyon@test.com / password123 (expired trial)")
  console.log("")
  console.log("🏷️  Promo codes:")
  console.log("   BIENVENUE2024: +30 days (1 redemption)")
  console.log("   ETE2024: +60 days (max 100, expires 2024-09-30)")
  console.log("   VIP: +90 days (max 10)")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
