# Production readiness checklist

Record the owner and evidence for each staging check before accepting real payments or creator documents.

- [ ] Deploy a commit with passing CI. Build assets, serve Laravel from `public/` over HTTPS, disable production debug mode, and configure credentials through the hosting environment.
- [ ] Back up the database, private media, and application key. Test restoring them together, including access to encrypted data.
- [ ] Run a supervised queue worker and invoke `php artisan schedule:run` every minute. Verify scanning, scheduled publishing, reminders, and wallet renewals. Alert on failed jobs and missed scheduler runs.
- [ ] Exercise Verify.mn and QPay with staging credentials. Test callbacks, polling, retries, and failed or expired payments.
- [ ] Reconcile provider records with wallet credits and charges, refunds, creator earnings, and payout decisions. Assign ownership for discrepancies.
- [ ] Confirm that creator documents and paid media are private. Enforce admin 2FA and document who can access identity documents and how retention and deletion are handled.
- [ ] Verify the moderation configuration. Exercise scanner failures, report review, removal, and appeals. Assign an escalation contact.
- [ ] Smoke-test mobile checkout and Studio in both languages. Confirm error alerts and rehearse rollback.
