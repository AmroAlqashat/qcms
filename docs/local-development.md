# Run QCMS locally

Run project commands from the repository root, where `package.json` is located.

## Prerequisites

- Node.js 22 and npm.
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
| `SEED_ACTOR_EMAIL` | Automatically written to `.env` after successful admin creation. No manual setup is needed for a fresh installation. |

The database user's password is separate from the administrator's QCMS login
password. Keep `.env` private and out of version control.

## Initialize the application

With PostgreSQL running and `.env` configured, run these commands in order:

```bash
npx prisma migrate deploy
npx prisma generate
npm run seed:permissions
npm run admin:create
npm run seed:settings
```

1. **Migrate:** create the application tables.
2. **Generate:** generate Prisma Client.
3. **Permissions:** populate the permission catalog.
4. **Admin:** enter your administrator's email, name, and password at the prompts.
   After the account is created, the script saves its normalized email as
   `SEED_ACTOR_EMAIL` in `.env`, preserving the other configuration values.
5. **Settings:** initialize missing defaults, attributed to that administrator.
   The script reads `SEED_ACTOR_EMAIL` directly from `.env`.

If updating `.env` fails, the account still exists. Follow the warning to set
`SEED_ACTOR_EMAIL` manually, then run the settings seed; do not rerun admin creation.
Only the email is written to `.env`, never the admin login password. An existing
`SEED_ACTOR_EMAIL` value is replaced after successful account creation.

For an already initialized database, skip admin creation and set
`SEED_ACTOR_EMAIL` manually if it is missing or does not match the intended active
account. Permission and settings
seeds can be rerun: existing permission IDs are retained for unchanged
resource/action pairs, and existing settings are preserved. Neither seed resets
passwords. New permissions are not automatically assigned to an existing admin role.

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

The current development mail service prints OTP codes in the app terminal rather
than sending email.

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
- **Admin creation reports an empty catalog:** run the permissions seed first.
- **Settings seed cannot find an account:** create the admin first and check that
  `SEED_ACTOR_EMAIL` matches its email.
- **Port already in use:** stop the existing app instance or configure another `PORT`.
