# QCMS — Quran Center Management System

> An Arabic-first, right-to-left web application that gives a Quran memorisation centre one auditable record per student — replacing paper registers, notebooks and separate fee ledgers with a single system.

---

## Table of Contents

- [About](#about)
- [Scope](#scope)
- [Getting Started](#getting-started)
- [Database](#database)
- [Branching & Workflow](#branching--workflow)
- [Documentation](#documentation)

---

## About

Quran memorisation centres commonly run on paper: a teacher's register for the halaqa, a notebook of who recited what, a separate fee ledger, and a mental record of which student needs watching. None of these records connect to each other, so a simple question — has this student finished the Juz' he's being tested on — can take an afternoon to answer.

QCMS is a single-tenant, single-centre web application that puts one auditable record behind each student. It covers registration by national ID, terms/halaqas/activities, daily attendance, memorisation and review against a canonical Quran reference, page-by-page Tasmee' assessment, Juz' tests and certification, manual financial recording, and a daily report the supervising sheikh shares with families.

Two decisions shape the system more than any other:

- **No fixed roles.** A job title is just a label — authority comes entirely from granted permissions, each scoped to exactly where it applies (centre-wide, an assigned class, an assigned activity, or the account's own record). A teacher who also collects fees needs one account, not two.
- **No guardian channel.** The system never contacts a guardian directly. The centre decided that one daily report shared through the group they already run serves transparency better than automated messages nobody reads.

## Scope

**In scope:** registration and intake, students, terms/halaqas/activities, attendance, memorisation and review, Tasmee' assessment, Juz' progress and tests, finance, access control, reporting, and core operations (audit trail, backups, bulk import).

**Out of scope for this phase:** native mobile apps, a guardian portal, automated guardian messaging, online payment gateway integration, multi-tenant/multi-branch operation, public rankings, automated speech recognition, and real-time protocols (e.g. WebSockets).

Full requirement-level detail lives in the SRS — see [Documentation](#documentation).

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20.x
- [PostgreSQL](https://www.postgresql.org/) (local install or Docker)
- npm

### Installation

```bash
git clone https://github.com/AmroAlqashat/qcms.git
cd qcms
npm ci
```

### Environment variables

```bash
cp .env.example .env
# then fill in the values in .env
```

### Running locally

```bash
npm run start:dev
```

The app starts in watch mode and restarts automatically on file changes.

## Database

Schema lives in `prisma/schema.prisma`.

```bash
# Generate the Prisma Client
npx prisma generate

# Apply migrations (creates the database schema)
npx prisma migrate dev

# Inspect the database with a local GUI
npx prisma studio
```

## Branching & Workflow

- All work happens on a feature branch, merged into `main` via pull request.
- `main` is protected: checks must pass before merging.

## Documentation

- **SRS (Software Requirements Specification)** — the full requirements baseline this project is built against.
