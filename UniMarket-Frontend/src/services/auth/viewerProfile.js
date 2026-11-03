/**
 * Turns GET /api/auth/me (and optionally the public profile GET /api/users/{id}) into the profile shape the header,
 * account menu and profile card use. Only fields the backend provides are filled; unknown numbers are null
 * (shown as "–"), never invented.
 *
 * Affiliation (V003): an official campus (university · campus) or a SELF-DECLARED university name, which is shown as
 * self-declared and never as verified. `emailVerified` means the email address was confirmed with a one-time code;
 * it is not a student-verification status.
 */
export function toViewerProfile(user, publicProfile) {
  if (!user) return undefined
  const affiliation = user.affiliation ?? {}
  const rating = publicProfile?.rating
  return {
    id: user.id,
    name: user.fullName,
    email: user.email,
    role: user.role,
    isAdmin: user.role === 'ADMIN',
    emailVerified: Boolean(user.emailVerified),
    memberSince: user.memberSince,
    universityName: affiliation.universityName ?? user.university ?? null,
    campusName: affiliation.campusName ?? user.campusName ?? null,
    affiliationSource: affiliation.source ?? (user.campusId ? 'OFFICIAL_CAMPUS' : 'NONE'),
    homeZone: user.homeZone ?? null,
    programme: null,
    rating: {
      average: rating?.average != null ? Number(rating.average) : null,
      count: rating?.count ?? 0,
    },
    stats: {
      activeListings: publicProfile ? publicProfile.activeListings : null,
      completedSales: null,
      completedPurchases: null,
    },
    isBackendUser: true,
  }
}

/**
 * "University · campus" for an official campus, or "University (self-declared)" for a typed name (V003).
 * Never a verification claim.
 * @param {(key: string, vars?: object) => string} t
 */
export function affiliationLabel(t, profile) {
  if (!profile?.universityName) return null
  if (profile.affiliationSource === 'SELF_DECLARED') return t('{name} (self-declared)', { name: profile.universityName })
  return profile.campusName ? `${profile.universityName} · ${profile.campusName}` : profile.universityName
}
