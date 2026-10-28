import { ageFromDob, displayNameFor } from './format';
import type { ConsentScopes, Profile, ProfileType, PublicProfile, User, Visibility } from './types';

export const NO_CONSENT: ConsentScopes = { photos: false, phone: false, fullBiodata: false };
export const FULL_ACCESS: ConsentScopes = { photos: true, phone: true, fullBiodata: true };

export function profileTypeOf(profile: Profile): ProfileType {
  // Looking for a groom ⇒ this profile is a bride, and vice versa.
  return profile.biodata.basic.lookingFor === 'groom' ? 'bride' : 'groom';
}

export function isBoostActive(profile: Pick<Profile, 'boostUntil'>, now = new Date()): boolean {
  return !!profile.boostUntil && new Date(profile.boostUntil).getTime() > now.getTime();
}

function allowed(vis: Visibility, consented: boolean): boolean {
  if (vis === 'public') return true;
  if (vis === 'onConsent') return consented;
  return false;
}

/**
 * THE single gatekeeper for field-level visibility.
 * Every API response that contains another user's biodata must pass through here, so hidden
 * fields are never serialised — not merely hidden in the UI (PRD §9.3).
 *
 * @param scopes consent the owner has explicitly granted to this viewer (after an accepted request)
 * @param owner  only needed when phone consent was granted
 */
export function projectProfile(
  profile: Profile,
  scopes: ConsentScopes = NO_CONSENT,
  owner?: Pick<User, 'countryCode' | 'phone'>,
  now = new Date(),
): PublicProfile {
  const { basic, location, career, religion, family, preferences, privacy, photos } = profile.biodata;
  const photosVisible = allowed(privacy.photoVisibility, scopes.photos || scopes.fullBiodata);
  const incomeVisible = allowed(privacy.incomeVisibility, scopes.fullBiodata);
  const familyVisible = allowed(privacy.familyVisibility, scopes.fullBiodata);

  const { income, employer, ...careerPublic } = career;
  return {
    id: profile.id,
    profileType: profileTypeOf(profile),
    displayName: scopes.fullBiodata ? basic.fullName : displayNameFor(basic.fullName, privacy.displayName),
    age: ageFromDob(basic.dob, now),
    heightCm: basic.heightCm,
    maritalStatus: basic.maritalStatus,
    motherTongue: basic.motherTongue,
    aboutMe: basic.aboutMe,
    createdFor: basic.createdFor,
    photos: photosVisible ? photos : [],
    photosHidden: !photosVisible && photos.length > 0,
    location: { ...location },
    career: {
      ...careerPublic,
      ...(incomeVisible && income && income !== 'undisclosed' ? { income } : {}),
      ...(scopes.fullBiodata && employer ? { employer } : {}),
    },
    religion: { ...religion },
    family: familyVisible ? { ...family } : undefined,
    familyHidden: !familyVisible,
    preferences: { ...preferences },
    boosted: isBoostActive(profile, now),
    publishedAt: profile.publishedAt,
    contact: scopes.phone && owner ? { countryCode: owner.countryCode, phone: owner.phone } : undefined,
    granted: { ...scopes },
  };
}

/** Merge consent records (a grantor may update scopes over time; latest wins). */
export function mergeScopes(list: ConsentScopes[]): ConsentScopes {
  return list.reduce(
    (acc, s) => ({ photos: acc.photos || s.photos, phone: acc.phone || s.phone, fullBiodata: acc.fullBiodata || s.fullBiodata }),
    { ...NO_CONSENT },
  );
}
