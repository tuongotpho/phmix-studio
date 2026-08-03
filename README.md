# pH-mix v2.5.0

pH-mix is a professional assessment mixer and question bank management tool, built with Node.js/Express, TypeScript, and Firebase.

## Features
- **Smart Docx Parsing**: Extracts questions, answers, math formulas, and images directly from Word documents.
- **Advanced Shuffling**: Deterministic shuffling using Fisher-Yates and Mulberry32 algorithms.
- **Firebase Auth & Firestore**: Role-based access control (Basic, Pro, Admin).
- **TNMaker Integration**: Generates grading QR codes compatible with the TNMaker app.

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

## Environment Variables
Create a `.env` file based on `.env.example`:
- `ADMIN_EMAIL`: Email address of the primary admin.
- `PORT`: (Managed by platform, typically 3000)
- `FIREBASE_PROJECT_ID`: Firebase project ID.
- `TELEGRAM_BOT_TOKEN`: (Optional) For admin notifications.

## Architecture & Structure
- **Frontend**: Pure HTML/JS/CSS (no frameworks) interacting with Firebase SDKs directly (`/gui` and `/landing`).
- **Backend API**: Express.js + TypeScript (`/src`), structured into Routes, Middlewares, Controllers, and Services.
- **Core Engine**: A standalone docx parsing and deterministic shuffling engine (`/src/shuffler`).
- **Auth Flow**: Uses Firebase Authentication on the client side, producing a JWT. The backend uses the official Firebase Admin approach (via JWKS validation) to verify the token in the `Authorization` header, caching user roles with LRU maps for performance.
- **Admin API** (`/src/routes/admin.routes.ts`): user management runs server-side through the Firebase Admin SDK, because security rules deliberately forbid clients from reading or writing other users' profiles. Endpoints: `GET /api/admin/users`, `POST /api/admin/users/:uid/role`, `POST /api/admin/users/:uid/admin`, `DELETE /api/admin/users/:uid`. Deleting a user removes both the Authentication account and the Firestore profile.

### Project IDs
Auth, Firestore and Storage live in **`phmix-studio`**; Hosting lives in **`phmix-web`**. `FIREBASE_PROJECT_ID` must match `firebaseConfig.projectId` in `gui/index.html` — if they differ, every ID token fails verification and PRO users silently drop to `guest`. Verify the running value with `GET /ping`.

### Admin privileges
Admin rights come from the Firebase custom claim `admin`, granted server-side — never by the client. On startup the server grants that claim to `ADMIN_EMAIL` (idempotent). This requires the Cloud Run service account to hold:
- **Firebase Authentication Admin** — set custom claims, delete users
- **Cloud Datastore User** — read/write Firestore

Newly promoted admins must sign in again (or call `getIdToken(true)`) before the claim appears in their token.

## Security Rules
Firestore and Storage are governed by least-privilege security rules:
- Users can only read/write their own profile and uploaded files. A self-created profile is forced to `status: 'pending'` — tier upgrades are server-side only.
- Questions/Exams/Curriculums can only be created with `ownerId` equal to the caller's UID; reads are restricted to owners, super admins, or documents explicitly marked public.

Rules deploy to the **default** project in `.firebaserc` (`phmix-studio`):
```bash
firebase deploy --only firestore:rules,storage
```

## Deployment
1. Setup Firebase Hosting & App Hosting / Cloud Run for the Express server.
2. The project includes a GitHub Action (`.github/workflows/firebase-hosting.yml`) which automatically runs `npm install`, `npm run build`, `npm run test`, and deploys to Firebase Hosting on push to the main branch.

## License
MIT License.
