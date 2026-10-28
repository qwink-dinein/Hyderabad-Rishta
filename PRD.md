# Product Requirements Document (PRD)
## Muslim Matrimony App — "Hyderabad Rishta" | MVP Version 1.1

> Living document. The requirements below are the product owner's PRD (v1.1), kept verbatim in substance.
> The **Implementation status** table is maintained by engineering and updated every working session.
> Related docs: [Architecture.md](Architecture.md) · [Tasks.md](Tasks.md) · [Phases.md](Phases.md) · [design.md](design.md) · [Memory.md](Memory.md)

**Platforms:** iOS, Android, Web · **Stack:** React Native, Expo (SDK 58), TypeScript, Supabase · **Languages:** English, Urdu (RTL), Telugu
**Primary objective:** Enable users and families to create matrimonial biodata, discover suitable profiles, shortlist prospects, and exchange contact information with mutual consent.

---

## Implementation status (last updated: 2026-10-28)

Legend: ✅ done & tested · 🟡 done on demo backend / partially · ⏳ planned (see Phases.md)

| § | Requirement | Status | Notes |
|---|---|---|---|
| 3 | Mobile OTP login, country codes, new vs returning, resend limits | 🟡 | Full flow + limits on the **demo** backend (OTP `123456`, clearly labelled). Real SMS via Supabase Auth phone provider = Phase 2. |
| 4 | EN / UR (RTL) / TE, instant switch, persisted, fallbacks | ✅ | i18next; per-key English fallback; CI test enforces translation coverage. Admin console is English-only (internal). UR/TE copy needs native-speaker review. |
| 5 | Landing page, carousel, CTAs, language selector, reduced motion | ✅ | Original vector art (no stock people photos). No fabricated testimonials/counts/badges. |
| 6 | Biodata wizard (7 steps), progress, save & continue, validation, preview | ✅ | Zod schemas per step; age from DOB; min age 18 (bride) / 21 (groom). |
| 6.2 | Optional photos (0–3) upload/preview/replace/remove/progress | 🟡 | Works on web/iOS/Android; demo stores compressed images locally. Private Supabase Storage + signed URLs = Phase 2. |
| 6.4 | "Other" education/profession → required specify field, searchable | ✅ | Unit + E2E tested. |
| 6.1+ | **Owner addition:** number of children when not never married | ✅ | Required, 0–15. |
| 6.5+ | **Owner addition:** maslak dropdown with sub-maslak (schools) | ✅ | Searchable filter for both. |
| 6.8 | Privacy controls (name, photos, income, family, requests) | ✅ | Enforced in the single projection function (client demo + SQL). |
| 7 | Preview & publication workflow + statuses | ✅ | Draft / Pending / Published / Paused / Rejected (+ admin note). |
| 8 | Dynamic pricing (free/paid/disabled per bride/groom), boosts, audit | ✅ | One config drives all copy; orders snapshot terms; payments are **simulated** & labelled. Real gateway = Phase 2. |
| 9 | Discovery, filters, chips, counts, pagination, empty states | ✅ | Optional-field filters never exclude missing data unless "strict". Hidden fields can't be probed by filters. |
| 9.3 | Search privacy (no phone, no hidden fields in responses) | ✅ | Tested in Jest and in PostgreSQL RLS tests. |
| 10 | Premium cards + 7-section profile details; no "ID verified" | ✅ | |
| 11 | Shortlist (optimistic, persisted, private) | ✅ | |
| 12 | Contact requests, preview, accept/decline, separate consent, report/block | ✅ | Acceptance reveals nothing; consent per scope (photos/phone/full biodata). |
| 13 | Dashboard metrics from recorded events | ✅ | Owner views excluded; 30-min view de-dupe. |
| 14 | Notification centre + admin announcements + honest analytics | 🟡 | In-app inbox, segments, schedule, expiry, multilingual, recipient report (audited). **Push delivery** = Phase 2 (reported as "not configured", never faked). |
| 15 | Admin dashboard (moderation, users, pricing, orders, reports, audit) | ✅ | All admin calls authorised server-side. |
| 15+ | **Owner addition:** full admin rights, one-click approval switch, master + sub-admins, lost-phone recovery, Trash | ✅ | Architecture §9; demo + Postgres + E2E tested. |
| 16 | Privacy & safety (deactivate, delete, block, report, rate limits) | ✅ | Legal pages are **drafts** pending lawyer review. |
| 17 | Supabase schema, RLS, RPCs | 🟡 | Migration + RLS tested on PostgreSQL 16. App ↔ Supabase adapter = Phase 2. |
| 18 | iOS / Android / Web, localhost, Expo Go, README, ≥30 seed profiles | ✅ | 32 fictional profiles. |
| 19 | Tests for critical workflows | ✅ | 52 Jest tests + Playwright E2E journeys + SQL RLS tests. |

---

## 1. Product Overview
Build a premium, mobile-first Muslim matrimony application that replaces manual WhatsApp biodata-sharing with a structured digital platform.

The MVP must support: mobile OTP registration and login; biodata creation and editing; optional profile photographs; profile publication and admin-controlled pricing; profile discovery and detailed search filters; shortlisting and contact requests; consent-based sharing of private information; notifications and admin announcements; admin profile management and announcement analytics; English, Urdu, and Telugu throughout the application.

Prioritise a reliable core experience, user privacy, and ease of use over advanced features.

## 2. User Roles
- **2.1 Matrimony user** — create and manage biodata, browse profiles, shortlist, send and receive contact requests, manage privacy settings, receive notifications.
- **2.2 Administrator** — manage users and profiles, configure publication and boost pricing, moderate reports, publish announcements, review operational metrics.
- **2.3 Profile representative** — a user creating biodata for a son, daughter, sibling, or relative. A profile-creation option, not a separate account role.

## 3. Registration and Login
- Register and log in using mobile number and OTP; support country codes.
- Identify new and returning users; take new users directly to biodata creation.
- Allow language selection before registration; save language preference.
- Support logout and account settings.
- Handle invalid OTPs, resend limits, loading states, and errors.

Production authentication must use a real configured authentication provider. Demo authentication must be clearly labelled.

## 4. Multilingual Support
Support English, Urdu (right-to-left layout) and Telugu.
- Translate navigation, forms, buttons, validation messages, filters, profile details, pricing, notifications, and announcements.
- Language selector on the landing page; change anytime in Settings or the application header.
- Apply language changes immediately without logging out; persist the preference.
- Suitable fonts and layouts for all three languages; fallback translations where unavailable.

Language preference must not automatically translate or alter user-written biodata and introductory messages without their consent.

## 5. Landing Page and Design
Premium landing page with a tasteful carousel featuring Muslim marriage, nikah ceremonies, couples, and family-oriented imagery. Include: clear headline and supporting text; "Find Your Match" and "Create Your Biodata" actions; language selector; smooth carousel transitions; mobile-responsive design; accessible controls and reduced-motion support.

Design system: Deep Emerald `#123D32` · Warm Ivory `#F8F4EB` · Champagne Gold `#C6A66B` · Sage Mist `#E6EEE7` · Porcelain White `#FFFFFF` · Charcoal `#24342D`. Refined typography, elegant biodata cards, attractive form fields, subtle animations, accessible colour contrast. Sound effects must be optional and subtle.

Do not fabricate testimonials, user counts, success stories, or verification badges.

## 6. Biodata Creation
Manageable sections with a progress indicator, save-and-continue, validation, and a preview before publication.

### 6.1 Basic information
| Field | Required? |
|---|---|
| Profile created for: self, son, daughter, brother, sister, relative, other | Yes |
| Looking for: bride or groom | Yes |
| Full name | Yes |
| Date of birth | Yes |
| Age, calculated from date of birth | Yes |
| Height | Yes |
| Marital status | Yes |
| Mother tongue | Yes |
| About me | No |
| Profile photographs, maximum 3 | No |

Age must be calculated from date of birth rather than independently entered.

### 6.2 Profile photographs
Photo upload at the top of the form; up to three; whole section optional; upload, preview, removal, replacement; attractive placeholder when absent; upload progress and validation errors; stored securely with visibility preferences applied. Users must be able to publish without photographs.

### 6.3 Location and residence
| Field | Required? |
|---|---|
| Country of residence | Yes |
| State or province | Yes |
| District | No |
| City | Yes |
| Town or locality | No |
| Native place | No |
| Nationality | No |
| Currently living abroad | No |
| Willing to relocate | No |

Use structured location values wherever available; permit manual entry. Do not expose a precise home address publicly.

### 6.4 Education and career
| Field | Required? |
|---|---|
| Highest education | Yes |
| Education details | No |
| Profession | Yes |
| Profession details | No |
| Employment type | No |
| Employer or organisation | No |
| Annual income | No |
| Work location | No |

**Education options:** High school, Diploma, Bachelor's, Master's, Doctorate, Professional qualification, Islamic education, Other.
**Profession options:** IT, Engineering, Healthcare, Education, Finance, Government, Business, Skilled profession, Homemaker, Student, Not currently employed, Other.

"Other" for education shows "Please specify your education"; for profession "Please specify your profession". Required only when "Other" is selected. Custom values saved, displayed, searchable; form data preserved during navigation; admins can manage predefined options without invalidating existing custom values. Income optional with a "prefer not to disclose" choice.

### 6.5 Religious background (all optional)
Maslak or sect (with Other); namaz practices; fasting practices; Hajj performed; Umrah performed; dargah visits; religious expectations; importance of religious compatibility. "Prefer not to say" where appropriate. Neutral wording; no compatibility scores based on assumptions about religious practice.

### 6.6 Family background (all optional)
Family type (Nuclear, Joint, Other); family values (Traditional, Moderate, Other, Prefer not to say); father's occupation; mother's occupation; number of siblings / brothers / sisters; family residence; description. Do not collect unnecessary identifying information about family members.

### 6.7 Partner preferences (optional)
Preferred age range, height range, marital status, education, profession, country, state, district/city/town, mother tongue, religious compatibility preferences, relocation preference, additional expectations. Multi-select where relevant. Used in search and discovery but must not automatically exclude profiles unless the user chooses strict filtering.

### 6.8 Privacy and contact preferences
Mobile number from authentication, private by default; display-name preference; public photo visibility; public income visibility; public family-detail visibility; contact-request availability; consent-based contact sharing. Owners control which fields are public and which are shared only after a request is accepted **and** separate consent is given.

## 7. Profile Preview and Publication
Complete preview before publication; return and edit; statuses Draft, Pending Approval, Published, Paused, Rejected; admins approve/reject/request corrections; users notified of status changes. Workflow respects the active admin configuration.

## 8. Dynamic Pricing and Boosts
Admins configure publication and boost fees separately for brides and grooms; each fee Free / Paid (configurable amount) / Disabled; boost duration configurable (initially 7 days).
- All pricing displays use the same active configuration; no hardcoded prices.
- Correct amount for the user's profile type; free features bypass payment; paid features show an order summary first.
- No automatic renewal; existing orders keep original terms and price; pricing changes recorded in an audit history; simulated payments never treated as real.

Copy (generated dynamically from config):
- Both free: "Create your biodata, publish your profile, and browse matches for free. Your boost is also free for the configured duration. No payment required and no automatic renewal."
- Publication free, boost paid: "Creating and publishing your biodata is free. Browse profiles for free and boost your profile for the configured duration at the displayed price. No automatic renewal."
- Publication paid, boost free: "Your profile publication fee is displayed below. Your boost is free for the configured duration. No automatic renewal."
- Both paid: clearly display both charges and the browsing policy.

## 9. Discover Profiles and Search Filters
### 9.1 Essential filters
| Category | Filters |
|---|---|
| Basic | Bride/groom, age range, height range, marital status |
| Location | Country, state, district, city, town/locality |
| Language | Mother tongue |
| Education | Highest education incl. custom Other values |
| Career | Profession incl. custom Other values, employment type |
| Income | Optional income range, only where disclosed |
| Religion | Relevant religious preferences and disclosed practices |
| Family | Selected family preferences |
| Relocation | Willingness to relocate |
| Discovery | Recently published, currently boosted, shortlisted status |

### 9.2 Filter behaviour
Searchable dropdowns; dependent location selections; multi-select; min/max ranges; Apply and Clear All; removable chips; matching count; filters preserved when returning from a profile; useful empty states; pagination/incremental loading; never exclude for missing optional data unless explicitly requested. Boosted is a promotional label, not a compatibility claim.

### 9.3 Search privacy
Never return mobile numbers through discovery; exclude restricted fields; apply field-level visibility; do not include hidden information in API responses just because the UI hides it.

## 10. Biodata Cards and Profile Details
Cards: photo or placeholder; display name or privacy-safe identifier; age and height; city and state; education; profession; selected disclosed details; shortlist; view profile; boosted label.
Details sections: 1 Personal · 2 Location · 3 Education & career · 4 Religious background · 5 Family background · 6 Partner preferences · 7 Contact (only where authorised).
Remove the "ID verified" option and all related badges, labels, and filters.

## 11. Shortlist
Add, remove, view all; persisted; no access to another user's shortlist.

## 12. Contact Requests
Optional introductory message (helper: "Introduce yourself and share anything you feel comfortable disclosing, such as your background or preferred way to connect. Your message is optional."). Preview before sending; sender may voluntarily include contact info with clear privacy guidance; accept/decline; both parties notified; acceptance alone reveals nothing restricted; after acceptance the owner separately consents to photo / mobile / full biodata; backend-enforced; report and block.

## 13. User Dashboard and Profile Reach
Publication status; profile views; unique viewers; shortlist count; requests received; accepted; boost status and expiry. From recorded events only; exclude owner's own views; never reveal anonymous viewers; helpful empty states and explanations.

## 14. Notifications and Admin Announcements
User notifications for requests, accept/decline, contact shared, approval/rejection/corrections, publication & boost, payments, account & safety, announcements. In-app centre with unread count, mark read, mark all read, deep links.
Admins create/edit drafts, schedule, publish, archive; target all or segments; title, body, optional image, priority, expiry, deep link; EN/UR/TE versions; push where configured; audience preview. Durable — available in the inbox even if offline at publish time.
Analytics: targeted users; in-app availability; push requests submitted; confirmed push outcomes where available; unique viewers; unread users; click-throughs; failed/pending jobs. Views = actual interaction (never a push preview or background refresh). Authorised, audited recipient-level report. Report push honestly; distinguish delivery from availability and readership.

## 15. Admin Dashboard
Profile review & moderation; user management; publication status; pricing & boost config; boost duration; payments & orders; announcements & analytics; reports & safety; basic user/profile/revenue metrics; audit logs. All admin operations authorised on the backend.

### 15.1 Admin console additions (2026-10-28, owner request)
- **Profile ID everywhere:** every profile has a permanent, sequential ID (`HR-10001`, `HR-10002`, …). It is shown to members on cards and profile pages and to admins on every list, and tapping it in the admin console opens that member.
- **Find a member:** admins can search by profile ID, name, city or phone digits, from the dashboard or a dedicated screen. Phone searches are recorded in the audit log and results always show masked numbers. The member page holds every action in one place: approve, pause, request changes, delete the profile, suspend, reactivate or delete the account, delete requests, resolve reports and cancel pending orders.
- **Admin bell:** a bell with an unread count leads to Alerts. Admins are alerted to new reports, payments (received or failed), profiles waiting for approval, members deleting their account, and changes to the admin team or master role. Alerts never contain phone numbers, and urgent ones are marked "Action needed".

### 15.2 Relationship status on profile cards
Cards show your history with each person, so nobody re-sends blindly: **Connected**, **Interest sent**, **Sent you interest**, **Declined your interest**, **You declined**, **Interest expired** and **You withdrew**. During the 30-day cool-down after someone declines, the profile page replaces Express Interest with a short, respectful explanation, and the server enforces the same rule.

### 15.4 Boost guarantee & phone notifications (owner request, 2026-10-28)
**Boost.**
- An active, published boost is shown in **Featured** (Home and the top of Discover) to every member looking for that profile type. This holds whatever the viewer's filters or sort.
- It is never shown:
  - to the same type
  - to the owner
  - across a block
  - while the profile is paused, unpublished or deleted
  - while the owner's account is suspended or deactivated
- Several boosts rotate fairly: each viewer gets a different order every day, so no boosted profile is permanently buried.
- Main search results stay honest: filters still apply there.
- The owner sees proof: whether the boost is currently visible, how many members have seen it in Featured, and an "ending soon" (24 h) and "ended" notice, each sent once.
- Members can never grant themselves a boost. Boosts come only from paid or free boost orders, and the database wipes any boost fields a client tries to set.

**Push.**
- Every action on a member's profile notifies them in the app and on their phones:
  - new interest, accepted or declined
  - number offered, accepted, declined or withdrawn
  - details shared, a reminder (poke), an interest expired
  - someone viewed the profile (anonymous, at most once per 6 h)
  - someone shortlisted it (anonymous, once per person)
  - approval or changes needed, published, boost started, ending or ended, payment, safety
  - announcements
- Lock-screen text is generic by default ("You have received a new interest"). Names appear only if the member turns that on. Phone numbers and message text never appear.
- Members control four groups (all phones, interests and connections, profile activity, announcements). Approvals, payments, boost and safety alerts are always sent.
- At most 12 optional pushes per hour; the in-app inbox still receives everything.
- A phone belongs to one account at a time: signing in elsewhere moves it, and logging out unbinds it. Dead phones are removed automatically.

### 15.3 Visual design
The visual, motion and sound specification is **Design PRD v1.0** (owner, 2026-10-28), summarised and tracked in `design.md`, with the approved reference in `docs/design/reference-ui.jpg`. Design changes never alter the behaviour defined in this PRD.

## 16. Privacy and Safety
Mobile numbers private by default; explicit consent before sharing; visibility settings; reporting and blocking; deactivation and deletion; secure image storage and access-controlled URLs; input validation and rate limiting; backend-enforced permissions; minimal sensitive data; privacy disclosures, terms, consent records.

## 17. Technical Architecture
React Native, Expo, TypeScript, Expo Router; React Native Web; Supabase Auth, PostgreSQL, Storage, Edge Functions; RLS; i18n with RTL; React Hook Form + Zod; TanStack Query; Expo Notifications with reliable server-side delivery. Models: users, profiles, photos, locations, preferences, shortlists, contact requests, consent records, pricing, orders, boosts, notifications, announcements, delivery attempts, view events, reports, blocks, audit events. Never expose privileged credentials; label credential-less integrations as development simulations.

## 18. Cross-Platform Requirements
iOS app; Android app; responsive web; localhost workflow; Expo Go workflow; migrations and environment config; README with exact commands; seed data with ≥30 clearly fictional profiles. Document features that require native development builds rather than Expo Go.

## 19. MVP Non-Functional Requirements
Secure authN/authZ; reliable persistence; responsive and accessible UI; Urdu RTL and Telugu fonts; loading/error/validation/empty states; reasonable performance; basic logging and error monitoring; automated tests for critical workflows; maintainable, documented code.

## 20. Out of Scope (MVP)
AI matching; audio/video calls; real-time chat; advanced compatibility scoring; subscriptions & auto-renewal; automated identity verification; complex family account hierarchies; advanced marketing automation.

## 21. MVP Success Metrics
Registrations; biodata completion rate; published profiles; discovery activity; shortlists per active user; requests sent and accepted; consent-based contact sharing; boost conversion; announcement unique-view rate; payment success rate; safety reports and complaints.

## 22. MVP Acceptance Criteria
Users can register and complete biodata · photos optional, up to three · "Other" fields work · profiles publish and are discoverable · filters work across stored fields · custom education/profession searchable · shortlists and requests persist · restricted contact requires explicit consent · admin pricing updates all screens · free mode never triggers payment · announcements in-app with accurate readership analytics · EN/UR/TE across core journeys · runs on web and mobile · critical tests pass · privacy policy, terms and production integrations ready.

**MVP principle:** Build a reliable platform that lets families create useful biodata, discover relevant matches, and establish contact safely. Launch the core workflows first, measure real usage, and expand only when the data justifies the complexity.

---

# Feature PRD: Express Interest, Consent-Based Contact Sharing & Poke (v1.0)

**Core principle:** expressing interest never requires sharing a phone number; accepting a request never automatically reveals the recipient's number.

| § | Requirement (owner's feature PRD, condensed) | Status | Where |
|---|---|---|---|
| 2 | Profile: primary **Express Interest** (+ supporting text), secondary **Add to Shortlist**; existing request shows its status instead of a duplicate; no numbers before consent | ✅ | `src/app/profile/[id].tsx` |
| 3 | “How would you like to connect?” — **A** Send an Introduction (number private) · **B** Offer to Share My Number (masked number, explicit consent checkbox, consent record + timestamp); optional sanitised message, preview + confirmation; withdraw offer before acceptance | ✅ | `src/app/request/[id].tsx` |
| 4 | Recipient inbox: photo/placeholder, name, age, location, details, message, offer notice; Accept · Decline · View Profile · Report | ✅ | `src/app/(tabs)/requests.tsx` |
| 5 | Case A reveals only the sender's offered number (Call · Copy · SMS); Case B reveals nothing; either side can later **Share My Number** which the other must accept; never both ways automatically; screenshot disclaimer; audit of who/when | ✅ | backend `respondToRequest`, `offerPhone`, `respondToPhoneOffer` |
| 6 | **Poke**: after 48 h, one per request, ≤ 2 per recipient per rolling 7 days, disabled after any non-pending status, opt-out respected, server rate-limited, status unchanged, guilt-free wording | ✅ | `src/domain/connections.ts#pokeEligibility` |
| 7 | Statuses Pending/Accepted/Declined/Withdrawn/Expired/Blocked; phone sharing has its own status (Not offered/Offered/Shared/Declined/Withdrawn/Expired) | ✅ | |
| 8 | Notifications for interest, accept/decline, offers (received/accepted/declined/withdrawn), poke, expiry — never containing numbers; no duplicates on retries | ✅ (push: Phase 2) | |
| 9 | Admin-configurable expiry (default 14 d); expired can't be accepted; re-send after expiry; block stops everything; deleted profiles stop interactions; withdraw-vs-accept and accept-vs-decline races resolved server-side; double taps safe | ✅ | row locks (SQL), idempotency keys |
| 10 | Admin: request counts & rates, config for expiry/reminders, audit of sharing, no casual browsing of numbers, no “ID verified” | ✅ | admin home “Connections”, Pricing & settings |
| 11 | Analytics events with idempotent ids and **no numbers**; acceptance, sharing, response time, poke→response, decline/block rates | ✅ | `analytics` (demo) / `analytics_events` (SQL) |
| 12 | Tests: two demo accounts — accept, decline, withdrawn offers, expiry, repeated pokes, blocking, simultaneous actions | ✅ | `__tests__/interest.test.ts` (21), `supabase/tests/30_interest.test.sql`, `e2e/interest.js` |

Design decision (not in the feature PRD, flagged for owner review): after a **decline**, the same sender can't re-send to that person for **30 days** (anti-harassment).
