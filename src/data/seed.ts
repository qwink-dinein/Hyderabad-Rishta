import { DEFAULT_PRICING } from '@/domain/pricing';
import { PHONE_CONSENT_TEXT } from '@/domain/connections';
import type { PhoneOffer, Announcement, Biodata, ContactRequest, ConsentRecord, Profile, User, ViewEvent } from '@/domain/types';

/**
 * Seed data: 32 CLEARLY FICTIONAL profiles. No real people, no real photos.
 * Every "About me" starts with "[Demo]". Deterministic so tests are stable.
 */

export const DEMO_OTP = '123456';
export const DEMO_ADMIN_PHONE = '9000000000';
export const DEMO_USER_PHONE = '9000000001';
export const DEMO_SUBADMIN_PHONE = '9000000009';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const BRIDE_NAMES = ['Ayesha', 'Fatima', 'Zainab', 'Mariam', 'Sana', 'Hafsa', 'Noor', 'Amina', 'Sara', 'Iqra', 'Mehwish', 'Rukhsar', 'Huma', 'Nida', 'Samreen', 'Farheen'];
const GROOM_NAMES = ['Imran', 'Faisal', 'Arif', 'Sameer', 'Yusuf', 'Bilal', 'Hamza', 'Owais', 'Zaid', 'Adnan', 'Rizwan', 'Salman', 'Tariq', 'Irfan', 'Junaid', 'Kashif'];
const SURNAMES = ['Siddiqui', 'Qureshi', 'Ansari', 'Khan', 'Hussaini', 'Farooqui', 'Baig', 'Mirza', 'Shaikh', 'Quadri', 'Razvi', 'Hashmi'];
const LOCALITIES = ['Tolichowki', 'Mehdipatnam', 'Banjara Hills', 'Malakpet', 'Toli Chowki', 'Charminar', 'Masab Tank', 'Attapur', 'Gachibowli', 'Kondapur', 'Saidabad', 'Asif Nagar'];
const CITY_SETS: [string, string, string, string?][] = [
  ['India', 'Telangana', 'Hyderabad', 'Hyderabad'],
  ['India', 'Telangana', 'Hyderabad', 'Hyderabad'],
  ['India', 'Telangana', 'Hyderabad', 'Rangareddy'],
  ['India', 'Telangana', 'Secunderabad', 'Medchal–Malkajgiri'],
  ['India', 'Telangana', 'Warangal', 'Warangal'],
  ['India', 'Andhra Pradesh', 'Kurnool', 'Kurnool'],
  ['India', 'Karnataka', 'Bengaluru', 'Bengaluru Urban'],
  ['United Arab Emirates', 'Dubai', 'Dubai'],
  ['Saudi Arabia', 'Makkah', 'Jeddah'],
  ['United States', 'Texas', 'Dallas'],
  ['United Kingdom', 'England', 'London'],
  ['India', 'Maharashtra', 'Pune', 'Pune'],
];
const EDU = ['bachelors', 'masters', 'bachelors', 'professional', 'doctorate', 'diploma', 'islamic', 'masters', 'other'];
const EDU_OTHER = ['Hafiz-e-Quran with B.Com', 'Aalimah course', 'Chartered Accountant (Inter)'];
const PROF_GROOM = ['it', 'engineering', 'healthcare', 'business', 'finance', 'government', 'it', 'skilled', 'other'];
const PROF_BRIDE = ['it', 'healthcare', 'education', 'homemaker', 'student', 'finance', 'it', 'education', 'other'];
const PROF_OTHER = ['Calligraphy artist', 'Unani physician', 'Interior designer'];
const TONGUES = ['urdu', 'urdu', 'dakhini', 'urdu', 'telugu', 'hindi', 'urdu', 'english'];
const MASLAK: [string | undefined, string | undefined][] = [
  ['sunni', 'hanafi'], ['sunni', 'shafii'], ['shia', 'ithna_ashari'], ['sunni', 'ahle_hadith'], ['sunni', 'deobandi'], ['sunni', 'barelvi'], [undefined, undefined], ['prefer_not', undefined],
];
const INCOME = ['5to10', '10to20', 'undisclosed', '3to5', '20to35', 'undisclosed', '35to50', 'lt3'];

const pick = <T,>(arr: T[], r: () => number) => arr[Math.floor(r() * arr.length)];

export interface SeedData {
  users: User[];
  profiles: Profile[];
  requests: ContactRequest[];
  consents: ConsentRecord[];
  phoneOffers: PhoneOffer[];
  views: ViewEvent[];
  announcements: Announcement[];
}

export function buildSeed(now = new Date('2026-10-01T09:00:00Z')): SeedData {
  const r = rng(42);
  const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000).toISOString();
  const users: User[] = [
    { id: 'u_admin', countryCode: '+91', phone: DEMO_ADMIN_PHONE, role: 'master', language: 'en', createdAt: iso(90) },
    { id: 'u_sub', countryCode: '+91', phone: DEMO_SUBADMIN_PHONE, role: 'admin', language: 'en', createdAt: iso(80) },
  ];
  const profiles: Profile[] = [];

  for (let i = 0; i < 32; i++) {
    const isBride = i % 2 === 0;
    const first = isBride ? BRIDE_NAMES[(i / 2) % BRIDE_NAMES.length | 0] : GROOM_NAMES[((i - 1) / 2) % GROOM_NAMES.length | 0];
    const surname = pick(SURNAMES, r);
    const age = isBride ? 21 + Math.floor(r() * 10) : 24 + Math.floor(r() * 12);
    const year = now.getUTCFullYear() - age;
    const month = 1 + Math.floor(r() * 9);
    const day = 1 + Math.floor(r() * 27);
    const [country, state, city, district] = CITY_SETS[i % CITY_SETS.length];
    const education = EDU[i % EDU.length];
    const profession = (isBride ? PROF_BRIDE : PROF_GROOM)[i % 9];
    const userId = i === 1 ? 'u_demo' : `u_${i}`;
    const marital = i % 11 === 5 ? 'divorced' : i % 13 === 7 ? 'widowed' : 'never_married';
    const biodata: Biodata = {
      basic: {
        createdFor: pick(['self', 'self', isBride ? 'daughter' : 'son', isBride ? 'sister' : 'brother', 'relative'], r),
        lookingFor: isBride ? 'groom' : 'bride',
        fullName: `${first} ${surname}`,
        dob: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        heightCm: isBride ? 150 + Math.floor(r() * 20) : 165 + Math.floor(r() * 22),
        maritalStatus: marital,
        children: marital === 'never_married' ? undefined : i % 3 === 0 ? 0 : 1,
        motherTongue: TONGUES[i % TONGUES.length],
        aboutMe: `[Demo] Fictional profile for testing. ${isBride ? 'She' : 'He'} values family, deen and kindness, and enjoys ${pick(['reading', 'cooking', 'travelling', 'calligraphy', 'cricket', 'volunteering'], r)}.`,
      },
      photos: [],
      location: {
        country,
        state,
        district,
        city,
        locality: country === 'India' && city === 'Hyderabad' ? pick(LOCALITIES, r) : undefined,
        nativePlace: pick(['Hyderabad', 'Gulbarga', 'Bidar', 'Kurnool', 'Nizamabad'], r),
        nationality: 'Indian',
        livingAbroad: country !== 'India',
        willingToRelocate: pick(['yes', 'no', 'maybe', undefined] as (string | undefined)[], r),
      },
      career: {
        education,
        educationOther: education === 'other' ? EDU_OTHER[i % EDU_OTHER.length] : undefined,
        educationDetails: pick(['Osmania University', 'JNTU Hyderabad', 'Maulana Azad National Urdu University', 'University of Hyderabad', undefined] as (string | undefined)[], r),
        profession,
        professionOther: profession === 'other' ? PROF_OTHER[i % PROF_OTHER.length] : undefined,
        professionDetails: pick(['Software engineer', 'Teacher', 'Doctor (MBBS)', 'Accountant', 'Pharmacist', undefined] as (string | undefined)[], r),
        employmentType: pick(['private', 'government', 'self_employed', undefined] as (string | undefined)[], r),
        employer: pick(['Fictional Tech Pvt Ltd', 'Demo Hospital', undefined] as (string | undefined)[], r),
        income: INCOME[i % INCOME.length],
        workLocation: city,
      },
      religion: {
        maslak: MASLAK[i % MASLAK.length][0],
        subMaslak: MASLAK[i % MASLAK.length][1],
        namaz: pick(['regularly', 'mostly', 'sometimes', undefined] as (string | undefined)[], r),
        fasting: pick(['regularly', 'mostly', undefined] as (string | undefined)[], r),
        hajj: pick(['no', 'yes', undefined] as (string | undefined)[], r),
        umrah: pick(['yes', 'no', undefined] as (string | undefined)[], r),
        compatibilityImportance: pick(['very', 'somewhat', undefined] as (string | undefined)[], r),
      },
      family: {
        familyType: pick(['nuclear', 'joint', undefined] as (string | undefined)[], r),
        familyValues: pick(['traditional', 'moderate', undefined] as (string | undefined)[], r),
        fatherOccupation: pick(['Retired government employee', 'Business', 'Teacher', undefined] as (string | undefined)[], r),
        motherOccupation: pick(['Homemaker', 'Teacher', undefined] as (string | undefined)[], r),
        siblings: 2,
        brothers: 1,
        sisters: 1,
        residence: city,
      },
      preferences: {
        ageMin: isBride ? age : age - 8,
        ageMax: isBride ? age + 8 : age,
        maritalStatus: ['never_married'],
        education: [],
        profession: [],
        countries: [],
        states: [],
        cities: [],
        motherTongues: [],
      },
      privacy: {
        displayName: i % 3 === 0 ? 'initials' : 'first',
        photoVisibility: 'onConsent',
        incomeVisibility: i % 4 === 0 ? 'public' : 'hidden',
        familyVisibility: i % 5 === 0 ? 'onConsent' : 'public',
        acceptContactRequests: true,
      },
    };
    users.push({ id: userId, countryCode: '+91', phone: i === 1 ? DEMO_USER_PHONE : `90000001${String(i).padStart(2, '0')}`, role: 'user', language: 'en', createdAt: iso(60 - i) });
    const status = i === 30 ? 'pending' : i === 31 ? 'draft' : 'published';
    profiles.push({
      id: `p_${i}`,
      userId,
      biodata,
      status,
      publishedAt: status === 'published' ? iso(i) : undefined,
      boostUntil: i % 7 === 2 ? new Date(now.getTime() + 5 * 86400000).toISOString() : undefined,
      createdAt: iso(60 - i),
      updatedAt: iso(i),
      lastStep: 7,
    });
  }

  // u_demo (p_1, a groom):
  //  r_1  incoming interest WITH a phone-number offer (pending) → try Accept to see the number revealed
  //  r_2  accepted conversation where the other side already shared her number
  //  r_3  outgoing interest sent 3 days ago, still unanswered → the Poke reminder is available
  const exp = (createdDaysAgo: number) => new Date(now.getTime() + (14 - createdDaysAgo) * 86400000).toISOString();
  const requests: ContactRequest[] = [
    { id: 'r_1', fromUserId: 'u_0', fromProfileId: 'p_0', toUserId: 'u_demo', toProfileId: 'p_1', message: '[Demo] Assalamu alaikum. Our family found your profile suitable. Happy to talk if you are comfortable.', status: 'pending', createdAt: iso(1), expiresAt: exp(1), pokes: [] },
    { id: 'r_2', fromUserId: 'u_4', fromProfileId: 'p_4', toUserId: 'u_demo', toProfileId: 'p_1', status: 'accepted', createdAt: iso(5), respondedAt: iso(4), expiresAt: exp(5), pokes: [] },
    { id: 'r_3', fromUserId: 'u_demo', fromProfileId: 'p_1', toUserId: 'u_6', toProfileId: 'p_6', message: '[Demo] Assalamu alaikum, I would be happy to connect if you are interested.', status: 'pending', createdAt: iso(3), expiresAt: exp(3), pokes: [] },
  ];
  const consents: ConsentRecord[] = [
    { id: 'c_1', requestId: 'r_2', grantorUserId: 'u_4', grantorProfileId: 'p_4', granteeUserId: 'u_demo', scopes: { photos: true, phone: false, fullBiodata: true }, createdAt: iso(4), updatedAt: iso(4) },
  ];
  const phoneOffers: PhoneOffer[] = [
    { id: 'po_1', requestId: 'r_1', fromUserId: 'u_0', toUserId: 'u_demo', status: 'offered', withInterest: true, consentText: PHONE_CONSENT_TEXT, consentAt: iso(1), createdAt: iso(1) },
    { id: 'po_2', requestId: 'r_2', fromUserId: 'u_4', toUserId: 'u_demo', status: 'accepted', withInterest: false, consentText: PHONE_CONSENT_TEXT, consentAt: iso(4), createdAt: iso(4), respondedAt: iso(4) },
  ];
  const views: ViewEvent[] = ['u_0', 'u_2', 'u_4', 'u_6', 'u_0'].map((v, k) => ({ profileId: 'p_1', viewerUserId: v, at: iso(k) }));
  const announcements: Announcement[] = [
    {
      id: 'a_welcome',
      title: { en: 'Welcome to Hyderabad Rishta', ur: 'حیدرآباد رشتہ میں خوش آمدید', te: 'హైదరాబాద్ రిష్తాకు స్వాగతం' },
      body: {
        en: 'Complete your biodata to start discovering profiles. Your mobile number stays private until you choose to share it.',
        ur: 'پروفائلز دیکھنے کے لیے اپنا بایوڈیٹا مکمل کریں۔ آپ کا موبائل نمبر اس وقت تک نجی رہتا ہے جب تک آپ خود شیئر نہ کریں۔',
        te: 'ప్రొఫైల్స్ చూడటానికి మీ బయోడేటాను పూర్తి చేయండి. మీరు షేర్ చేసే వరకు మీ మొబైల్ నంబర్ గోప్యంగా ఉంటుంది.',
      },
      priority: 'normal',
      deepLink: '/biodata',
      segment: 'all',
      status: 'draft',
      pushEnabled: false,
      createdBy: 'u_admin',
      createdAt: iso(2),
      updatedAt: iso(2),
    },
  ];
  return { users, profiles, requests, consents, phoneOffers, views, announcements };
}

/** Demo starts with approval OFF so a single tester can publish and send requests immediately; admins can turn it on. */
export const SEED_PRICING = { ...DEFAULT_PRICING, requireApproval: false };
