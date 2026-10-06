# Visitor push alerts

Deploy the backend and frontend together using the existing deployment process. The backend installs `web-push` from its lockfile. No separate notification service or environment variables are required: VAPID keys and admin device subscriptions are persisted in PostgreSQL. The database account needs permission to create the three `visitor_push_*` / `visitor_alert_sessions` tables on first use. Keep this database across deployments so device subscriptions continue working.

Sign in as admin on each desired device, open the dashboard, choose **Enable visitor alerts**, and allow notifications. Use **Send test alert** to verify actual delivery. For iPhone/iPad, add the HTTPS site to the Home Screen, open it from that icon, then sign in and enable alerts. Notifications require browser and operating-system permission.

A visible visitor page sends an anonymous random browser identifier on arrival and once per minute. After 30 minutes of inactivity, arrival counts as a new visit. Navigation and refreshes do not generate repeated alerts; signed-in admins are excluded. No name, IP address, query string, or visited page is included in alerts. Session records expire after a day. This detects browsers running JavaScript; it is not an exact count of people currently online. Delivery depends on the device/browser push service. Visitor notifications expire after two minutes and are limited to ten new-visit alerts per minute per backend process to limit floods.

Disable alerts from the dashboard on each device to remove its subscription. Expired subscriptions are removed after delivery returns 404 or 410. Subscription management and tests require a valid admin portal token; public requests cannot select notification recipients or notification text.

Validation: `node --test routes/visitorAlerts.test.js` in backend and `npm run build` in frontend. Test actual device delivery after deployment; local automated checks do not confirm push-service delivery.
