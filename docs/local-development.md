# Run QCMS locally

[README](../README.md) | **Local Dev**

Run project commands from the repository root, where `package.json` is located.

## Prerequisites

- Node.js 22.22.2 or newer supported LTS version, and npm.
- A running local PostgreSQL server and a database for QCMS.

Create the database and a database user using your preferred PostgreSQL tool.
The user must be able to apply migrations to that database. If you use Prisma's
`migrate dev` workflow, also configure access to a shadow database or allow the
user to create databases.

## Install and configure

```bash
npm ci
```

Copy `.env.example` to `.env` if you do not already have one. Replace the
placeholders with your own values:

| Variable | What to configure |
| --- | --- |
| `DATABASE_URL` | Connection URL for your local database, including user, password, host, port, and database name. |
| `NODE_ENV` | Set to `development`. |
| `SESSION_SECRET` | A strong random secret for sessions. |
| `OTP_HASH_SECRET` | A separate strong random secret for OTP hashing. |
| `EMAIL_SENDER_ADDRESS` | Gmail sender address used by the current SMTP configuration. |
| `EMAIL_APP_PASSWORD` | App password for that sender account. |
| `SEED_ACTOR_EMAIL` | Optional for manually running `seed:settings`. The setup UI initializes settings directly using the new owner’s ID. |

The database user's password is separate from the administrator's QCMS login
password. Keep `.env` private and out of version control.

## Initialize the application

Apply migrations and generate the client first:

```bash
npx prisma migrate deploy
npx prisma generate
```

For a **new installation with no staff accounts**, generate a setup token from an
interactive terminal on the application server:

```bash
npm run setup:token
```

This operator-only command displays the token once. Give it privately to the
center owner; never put it in a URL, source control, CI output, or shared logs.
It expires after 30 minutes. Generating another token invalidates the previous one.
After ten failed token comparisons, the operator must generate a new token.

Start the app as described below and open `/setup`. Use HTTPS in production.
The owner enters the token, name, email, and a password of 8–128 characters.
The server creates the single superadmin and initializes permissions and missing
settings in one transaction. No separate seeds are needed for this flow. Settings
use the new account's ID as `setById`. Sign in normally after setup succeeds.

Setup is permanently closed after completion, including after a restart. It does
not reopen when an account is deleted. Upgrading a database that already contains
staff marks setup completed automatically; it does not promote existing accounts.

### Recover a missing superadmin

First-time installation uses the setup UI. If no superadmin exists, an operator
with application-server access can create a replacement with a new, unused email:

```bash
npm run superadmin:recover
```

Run this command interactively from the repository root with development dependencies
installed. It asks for the name, email, and password; password input is hidden.
The script starts a Nest application context and calls `SetupService` directly.
The service checks for an existing superadmin and uses the same transactional
initialization as the setup UI. No recovery HTTP endpoint is exposed.

The script refuses to overwrite accounts or create a second superadmin, even if
an existing superadmin is deleted or inactive. It does not reset an existing owner's
password. Existing accounts are not silently promoted. Keep server/database access
restricted to authorized operators. Recovery is audited and does not reopen setup.

The CLI also writes `SEED_ACTOR_EMAIL` to `.env` after success for optional future
settings seeding. If that write fails, follow its warning; the account and settings
already exist, so do not repeat creation. The UI does not modify `.env`.

### Optional maintenance seeds

```bash
npm run seed:permissions
npm run seed:settings
```

The settings seed requires `SEED_ACTOR_EMAIL` in `.env` for an active, non-deleted
staff member. It inserts only missing defaults. Permissions retain their IDs when
resource/action pairs match. These commands do not create or reset accounts.

### Scope of the current setup implementation

- `isSuperAdmin` is set only by initialization/recovery code, never by staff DTOs.
- A database constraint allows at most one superadmin across all staff records.
- Job titles are descriptive enums; choosing ADMIN or SUPERADMIN does not elevate
  an account. The owner receives an administrative role with the current catalog.
- Last-admin/deletion safeguards and automatic access to future permissions are
  not implemented by this setup change. Endpoint permission enforcement remains
  a separate authorization task; the session guard verifies authentication.
- Setup does not yet verify email ownership or enroll MFA.

## Run and stop the app

```bash
npm run start:dev
```

Open `http://localhost:3000/auth/signIn` and sign in with your admin credentials.
If you configured `PORT`, use that port instead.

This command runs Nest and the CSS watcher. If the CSS watcher is already running
separately, use `npx nest start --watch`. Press **Ctrl+C** to stop the app.
Start and stop PostgreSQL using the tool you used to set it up. Stopping the app
does not stop the database.

The mail service sends OTPs through the configured Gmail SMTP transport. Configure
`EMAIL_SENDER_ADDRESS` and `EMAIL_APP_PASSWORD` in `.env` for email flows to work.

## Inspect data

Use your preferred database client with the connection details from `.env`, or run:

```bash
npx prisma studio
```

Open the URL printed by Prisma and press Ctrl+C to stop Studio. Changes made in
Studio affect your database.

## Common setup issues

- **Cannot connect to PostgreSQL:** check that it is running and that `DATABASE_URL`
  matches your local connection details.
- **Setup page is unavailable:** the token may be expired/locked, or setup is already completed. On a fresh installation, the operator can issue another token. Existing installations must use the explicit recovery route described above.
- **Settings seed cannot find an account:** create the admin first and check that
  `SEED_ACTOR_EMAIL` matches its email.
- **Port already in use:** stop the existing app instance or configure another `PORT`.
