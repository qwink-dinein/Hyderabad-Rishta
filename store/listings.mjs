// Store listing text (Google Play + Apple App Store) in English, Urdu and Telugu.
// Single source for ASO_STRATEGY.md; `node store/check.mjs` verifies every field against the store limits.
// Urdu and Telugu need a native speaker's review before they are submitted.
const features_en = [
  '• Discover Muslim bride and groom profiles',
  '• Create and manage your marriage biodata — one short question at a time',
  '• Explore profiles by age, area, education, profession, marital status and mother tongue',
  '• Send and receive marriage interest requests',
  '• Shortlist profiles you like',
  '• Share contact details only with consent — your number is never shown on your profile',
  '• Control who sees your photos, income and family details',
  '• Use the app in English, Urdu or Telugu',
];
export const LISTINGS = {
  'en-IN': {
    play: {
      title: 'Hyderabad Rishta – Matrimony',
      short: 'Muslim rishta & matrimony for Hyderabad. Make your biodata, connect privately.',
      full: [
        'Find meaningful Muslim marriage connections with Hyderabad Rishta.',
        '',
        'Explore bride and groom profiles, discover suitable proposals, create your marriage biodata and connect with families through a dedicated Muslim matrimonial platform, starting with Hyderabad.',
        '',
        'FEATURES',
        ...features_en,
        '',
        'PRIVACY FIRST',
        'Your phone number is never shown on your profile. A number is shared only when its owner offers it and the other person accepts. Choose whether your photos are visible to everyone, only to people you approve, or no one. Block or report any profile at any time.',
        '',
        'FOR FAMILIES',
        'Parents, brothers, sisters and relatives can create a biodata for someone, with their knowledge and consent. Every question is worded for the right person.',
        '',
        'WHAT IT COSTS',
        'Creating and publishing your biodata is currently free. Boost — extra visibility for a set number of days — is optional and paid, with the price shown before you pay. No automatic renewals.',
        '',
        'HONEST BY DESIGN',
        'Hyderabad Rishta does not verify identities. Involve your family, verify details and meet safely.',
        '',
        'Start your marriage search with Hyderabad Rishta.',
      ].join('\n'),
    },
    appStore: {
      name: 'Hyderabad Rishta',
      subtitle: 'Muslim Matrimony & Biodata',
      // 100 chars, comma-separated, no spaces after commas; no competitor names, no words already in name/subtitle.
      keywords: 'nikah,shaadi,marriage,muslim rishta,bride,groom,proposal,telangana,urdu,nri,matrimonial,family',
      promo: 'Create your marriage biodata in minutes. Your phone number stays private until you choose to share it.',
    },
  },
  ur: {
    play: {
      title: 'حیدرآباد رشتہ – مسلم رشتے',
      short: 'حیدرآباد کے مسلم رشتے۔ اپنا بایوڈیٹا بنائیں اور رازداری کے ساتھ رابطہ کریں۔',
      full: [
        'حیدرآباد رشتہ کے ساتھ مسلم شادی کے لیے مناسب رشتے تلاش کریں۔',
        '',
        'دلہن اور دولہا کے پروفائل دیکھیں، اپنا بایوڈیٹا بنائیں اور خاندانوں سے رابطہ کریں — ایک مخصوص مسلم ازدواجی پلیٹ فارم پر، حیدرآباد سے آغاز۔',
        '',
        '• مسلم دلہن اور دولہا کے پروفائل',
        '• آسان سوالات کے ذریعے بایوڈیٹا',
        '• عمر، علاقہ، تعلیم، پیشہ اور مادری زبان کے لحاظ سے تلاش',
        '• رشتے کی دلچسپی بھیجیں اور وصول کریں',
        '• پسندیدہ پروفائل محفوظ کریں',
        '• رابطہ صرف رضامندی سے — آپ کا نمبر پروفائل پر کبھی نہیں دکھایا جاتا',
        '• تصاویر کون دیکھے، یہ آپ طے کریں',
        '• اردو، انگریزی اور تیلگو میں',
        '',
        'حیدرآباد رشتہ شناخت کی تصدیق نہیں کرتا۔ اپنے خاندان کو شامل رکھیں اور محفوظ طریقے سے ملیں۔',
      ].join('\n'),
    },
  },
  te: {
    play: {
      title: 'హైదరాబాద్ రిష్తా – ముస్లిం',
      short: 'హైదరాబాద్ ముస్లిం సంబంధాలు. బయోడేటా తయారు చేసి, గోప్యంగా కనెక్ట్ అవ్వండి.',
      full: [
        'హైదరాబాద్ రిష్తాతో ముస్లిం వివాహ సంబంధాలను కనుగొనండి.',
        '',
        'వధువు, వరుల ప్రొఫైల్స్ చూడండి, మీ బయోడేటా తయారు చేయండి, కుటుంబాలతో కనెక్ట్ అవ్వండి — హైదరాబాద్‌తో మొదలయ్యే ముస్లిం మ్యాట్రిమోనియల్ ప్లాట్‌ఫారమ్.',
        '',
        '• ముస్లిం వధువు, వరుల ప్రొఫైల్స్',
        '• సులభమైన ప్రశ్నలతో బయోడేటా',
        '• వయస్సు, ప్రాంతం, విద్య, వృత్తి, మాతృభాష ఆధారంగా శోధన',
        '• ఆసక్తి అభ్యర్థనలు పంపండి, స్వీకరించండి',
        '• నచ్చిన ప్రొఫైల్స్ షార్ట్‌లిస్ట్ చేయండి',
        '• సమ్మతితోనే సంప్రదింపు — మీ నంబర్ ప్రొఫైల్‌లో ఎప్పుడూ కనిపించదు',
        '• మీ ఫోటోలు ఎవరు చూడాలో మీరే నిర్ణయించండి',
        '• తెలుగు, ఉర్దూ, ఇంగ్లీష్‌లో',
        '',
        'హైదరాబాద్ రిష్తా గుర్తింపును ధృవీకరించదు. మీ కుటుంబాన్ని భాగస్వామ్యం చేసి, సురక్షితంగా కలవండి.',
      ].join('\n'),
    },
  },
};
export const LIMITS = { play: { title: 30, short: 80, full: 4000 }, appStore: { name: 30, subtitle: 30, keywords: 100, promo: 170 } };
