// One rule for "can people register for this activity now?", used by the
// staff detail page and the public apply page so they never disagree.
// Open only when all are true: registration enabled, the close date not
// reached (or none set), and the activity not started yet.
export function isRegistrationOpen(activity: {
  isFormEnabled: boolean;
  formClosesAt: Date | null;
  date: Date;
}) {
  const now = new Date();
  return (
    activity.isFormEnabled &&
    (!activity.formClosesAt || activity.formClosesAt > now) &&
    activity.date > now
  );
}
