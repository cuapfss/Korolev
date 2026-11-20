# KOROLEV — backend foundation

This directory contains the initial Supabase database schema for the client portal and studio administration.

## Apply

1. Create a Supabase project.
2. Open **SQL Editor** and run `schema.sql`.
3. Configure authentication providers and redirect URLs.
4. Create a private Storage bucket for project files and apply storage policies before enabling uploads.
5. Keep the Supabase service-role key and payment-provider secrets on the server only. Never put them in `script.js` or other public files.

## Data model included

- Profiles with client/staff/admin roles
- Projects, memberships, stages, progress and deadlines
- Project chat messages and file metadata
- Payment records in RUB, USD and EUR (manual or provider-backed)
- Contracts, invoices, acts and proposals with client confirmation timestamps
- In-app, email, Telegram and browser-push notification records
- Promo codes, personal discounts and audit log

## Important limitations

This is a database foundation, not a finished client portal. The public site is hosted on GitHub Pages, which cannot safely run privileged backend code. Authentication, Google/Telegram login, payment checkout, PDF generation, chat delivery, email, push, scheduled backups and role administration still need trusted server-side functions and provider setup.

The database stores payment records and provider references only. Card details must remain with the payment provider. A payment provider may charge transaction fees even when the hosting tier is free.

Supabase free quotas and backup capabilities can change. Do not promise hourly recovery or indefinite retention until a separate backup process has been configured and tested. The requested hourly critical-data backup and daily full backup need scheduled exports to a separate destination.

No staff/admin accounts should be created by changing a profile role from the browser. Role assignment must use a trusted administrative process.

## Email registration (first live feature)

1. In Supabase, open **Authentication → Providers → Email** and make sure Email is enabled.
2. In **Authentication → URL Configuration**, add the deployed account page to the allowed redirect URLs:
   `https://cuapfss.github.io/Korolev/account.html`
   Set the site URL to `https://cuapfss.github.io/Korolev`.
3. Open **Project Settings → API** and copy the Project URL and the publishable/anon public key.
4. Put those two public values into `supabase/config.js`. This file is intentionally a browser config; never paste a `service_role` key here.
5. Run `schema.sql` in the SQL Editor to create the user profile automatically when a new account is created.
6. Test registration with an email address you can access. If email confirmation is enabled, the user must confirm the message before signing in.

The current account page implements email/password sign-up, sign-in, session restore and sign-out. Google and Telegram sign-in are not enabled yet; they require separate provider configuration. Project data, chat, uploads, payment processing and admin authorization are later steps and must not be considered live just because account registration works.
