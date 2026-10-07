import { BrevoClient } from "@getbrevo/brevo";
import { OTP_EXPIRY_MINUTES } from "../utils/otp";

// ---------------------------------------------------------------------------
// Brevo is the service that actually delivers the email.
//
// We create the client lazily (only when the first email is sent) instead of
// at the top of the file. That way the server can still start up even if the
// API key is missing — you just get an error when an email is attempted.
// ---------------------------------------------------------------------------
let client: BrevoClient | null = null;


function getClient(): BrevoClient {
  if (!client) {
    const apiKey = process.env.BREVO_API_KEY;

    if (!apiKey) {
      throw new Error("BREVO_API_KEY is missing. Check your server/.env file.");
    }

    client = new BrevoClient({ apiKey });
  }

  return client;
}

// ---------------------------------------------------------------------------
// WorkNest brand colours, in one place so every email matches the site.
// ---------------------------------------------------------------------------
const COLORS = {
  purple: "#6D4AFF",
  purpleLight: "#F2EEFF",
  dark: "#140A28",
  heading: "#161320",
  body: "#4B4757",
  muted: "#8B8798",
  border: "#ECEBF0",
  pageBg: "#F7F6FA",
  yellow: "#FFC93C",
  yellowText: "#463400",
};

// Email clients cannot load Google Fonts reliably, so we fall back to
// system fonts that look similar to Inter.
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// ---------------------------------------------------------------------------
// The shared email layout.
//
// Emails are built with <table> tags, not divs and flexbox. Outlook and other
// old clients simply ignore modern CSS, but every client supports tables.
// Styles must also be INLINE — <style> blocks get stripped by Gmail.
// ---------------------------------------------------------------------------
// The outer frame every WorkNest email shares: the page background, the
// white card, the dark header bar, and the small grey footer.
//
// Each email passes its own middle section in as `body`, so we only write
// this wrapper once.
function shell(options: {
  preheader: string; // the grey preview line shown in the inbox list
  body: string; // the rows unique to this particular email
  footerText: string;
}): string {
  const { preheader, body, footerText } = options;

  return `
<!DOCTYPE html>
<html>
  <body style="margin:0; padding:0; background-color:${COLORS.pageBg}; font-family:${FONT};">

    <!-- Hidden preview text. Shows in the inbox list, not in the email itself. -->
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">
      ${preheader}
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.pageBg}; padding:40px 16px;">
      <tr>
        <td align="center">

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; background-color:#ffffff; border-radius:20px; overflow:hidden; border:1px solid ${COLORS.border};">

            <!-- Purple header bar with the WorkNest name -->
            <tr>
              <td style="background-color:${COLORS.dark}; padding:24px 32px;">
                <span style="font-size:19px; font-weight:800; color:#ffffff; letter-spacing:-0.4px;">
                  Work<span style="color:${COLORS.purple};">Nest</span>
                </span>
              </td>
            </tr>

            <!-- Whatever this particular email wants to say -->
            ${body}

            <!-- Footer -->
            <tr>
              <td style="padding:28px 32px 32px;">
                <hr style="border:none; border-top:1px solid ${COLORS.border}; margin:0 0 18px;" />
                <p style="margin:0; font-size:12px; line-height:1.6; color:${COLORS.muted};">
                  ${footerText}
                </p>
              </td>
            </tr>
          </table>

          <p style="margin:20px 0 0; font-size:12px; color:${COLORS.muted};">
            &copy; ${new Date().getFullYear()} WorkNest
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}

// The heading block used at the top of every email body.
function headingRows(eyebrow: string, heading: string, intro: string): string {
  return `
            <tr>
              <td style="padding:36px 32px 8px;">
                <p style="margin:0 0 10px; font-size:11px; font-weight:600; color:${COLORS.purple}; letter-spacing:1.6px; text-transform:uppercase;">
                  ${eyebrow}
                </p>

                <h1 style="margin:0 0 14px; font-size:26px; line-height:1.25; letter-spacing:-0.8px; color:${COLORS.heading};">
                  ${heading}
                </h1>

                <p style="margin:0 0 28px; font-size:15px; line-height:1.6; color:${COLORS.body};">
                  ${intro}
                </p>
              </td>
            </tr>`;
}

// The light purple box holding the 6-digit code.
function otpRow(otp: string): string {
  return `
            <tr>
              <td style="padding:0 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.purpleLight}; border-radius:16px;">
                  <tr>
                    <td align="center" style="padding:26px 20px;">
                      <p style="margin:0 0 10px; font-size:11px; font-weight:600; color:${COLORS.purple}; letter-spacing:1.4px; text-transform:uppercase;">
                        Your code
                      </p>
                      <!-- letter-spacing makes the digits easy to read and copy -->
                      <p style="margin:0; font-size:34px; font-weight:800; letter-spacing:10px; color:${COLORS.heading};">
                        ${otp}
                      </p>
                    </td>
                  </tr>
                </table>

                <p style="margin:16px 0 0; font-size:13px; line-height:1.6; color:${COLORS.muted}; text-align:center;">
                  This code expires in ${OTP_EXPIRY_MINUTES} minutes.
                </p>
              </td>
            </tr>`;
}

// The soft yellow strip, used for a reassuring note.
function noticeRow(text: string): string {
  return `
            <tr>
              <td style="padding:28px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFCF2; border:1px solid #FFE7A3; border-radius:14px;">
                  <tr>
                    <td style="padding:14px 18px;">
                      <p style="margin:0; font-size:13px; line-height:1.6; color:${COLORS.yellowText};">
                        ${text}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`;
}

// A purple call-to-action button.
//
// Buttons in email are really just a coloured table cell with a link inside.
// A styled <button> would be ignored by most email clients.
function buttonRow(href: string, label: string): string {
  return `
            <tr>
              <td style="padding:0 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:999px; background-color:${COLORS.purple};">
                      <a href="${href}"
                         style="display:inline-block; padding:14px 30px; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:999px;">
                        ${label}
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`;
}

// A simple list of what the user can do next.
function bulletsRow(items: string[]): string {
  const rows = items
    .map(
      (item) => `
                  <tr>
                    <td style="padding:0 0 12px;">
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td valign="top" style="padding:6px 12px 0 0;">
                            <div style="width:7px; height:7px; border-radius:999px; background-color:${COLORS.purple};"></div>
                          </td>
                          <td style="font-size:14px; line-height:1.6; color:${COLORS.body};">
                            ${item}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>`
    )
    .join("");

  return `
            <tr>
              <td style="padding:26px 32px 4px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${rows}
                </table>
              </td>
            </tr>`;
}

// A label/value summary table, e.g. "Role: Frontend Engineer".
// Used by the application confirmation to echo back what was submitted.
function summaryRows(rows: [string, string][]): string {
  const cells = rows
    .map(
      ([label, value]) => `
                  <tr>
                    <td style="padding:9px 0; font-size:13px; color:${COLORS.muted}; white-space:nowrap;">
                      ${label}
                    </td>
                    <td align="right" style="padding:9px 0; font-size:13px; font-weight:600; color:${COLORS.heading};">
                      ${value}
                    </td>
                  </tr>`
    )
    .join("");

  return `
            <tr>
              <td style="padding:4px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${COLORS.border}; border-radius:16px;">
                  <tr>
                    <td style="padding:6px 18px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        ${cells}
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`;
}

// The full OTP email body — used by both the verification and reset emails.
function otpLayout(options: {
  preheader: string;
  eyebrow: string;
  heading: string;
  intro: string;
  otp: string;
  footerNote: string;
}): string {
  return shell({
    preheader: options.preheader,
    body:
      headingRows(options.eyebrow, options.heading, options.intro) +
      otpRow(options.otp) +
      noticeRow(options.footerNote),
    footerText:
      "Never share this code with anyone. WorkNest will never ask you for it by phone, chat, or email.",
  });
}

// ---------------------------------------------------------------------------
// The actual send. Everything else in this file just builds the HTML.
// ---------------------------------------------------------------------------
async function send(options: {
  to: string;
  name: string;
  subject: string;
  html: string;
  text: string;
}) {
  const senderEmail = process.env.BREVO_SENDER_EMAIL;

  if (!senderEmail) {
    throw new Error("BREVO_SENDER_EMAIL is missing. Check your server/.env file.");
  }

  await getClient().transactionalEmails.sendTransacEmail({
    sender: {
      name: process.env.BREVO_SENDER_NAME || "WorkNest",
      email: senderEmail,
    },
    to: [{ email: options.to, name: options.name }],
    subject: options.subject,
    htmlContent: options.html,
    textContent: options.text,
  });
}

// ---------------------------------------------------------------------------
// Email 1 — sent right after someone signs up.
// ---------------------------------------------------------------------------
export async function sendVerificationEmail(
  email: string,
  name: string,
  otp: string
) {
  const firstName = name.split(" ")[0];

  const html = otpLayout({
    preheader: `Your WorkNest verification code is ${otp}`,
    eyebrow: "Verify your email",
    heading: `Welcome to WorkNest, ${firstName}`,
    intro:
      "You're one step away. Enter the code below to verify your email address and start applying to roles.",
    otp,
    footerNote:
      "If you didn't create a WorkNest account, you can safely ignore this email.",
  });

  const text = [
    `Welcome to WorkNest, ${firstName}.`,
    "",
    `Your verification code is: ${otp}`,
    `It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
    "",
    "If you didn't create a WorkNest account, you can ignore this email.",
  ].join("\n");

  await send({
    to: email,
    name,
    subject: `${otp} is your WorkNest verification code`,
    html,
    text,
  });
}

// ---------------------------------------------------------------------------
// Email 2 — sent when someone uses "Forgot password?".
// ---------------------------------------------------------------------------
export async function sendPasswordResetEmail(
  email: string,
  name: string,
  otp: string
) {
  const firstName = name.split(" ")[0];

  const html = otpLayout({
    preheader: `Your WorkNest password reset code is ${otp}`,
    eyebrow: "Reset your password",
    heading: `Let's get you back in, ${firstName}`,
    intro:
      "Enter the code below to choose a new password. Your current password stays active until you finish.",
    otp,
    footerNote:
      "If you didn't ask to reset your password, ignore this email — your account is still secure.",
  });

  const text = [
    `Hi ${firstName},`,
    "",
    `Your password reset code is: ${otp}`,
    `It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
    "",
    "If you didn't request this, you can ignore this email.",
  ].join("\n");

  await send({
    to: email,
    name,
    subject: `${otp} is your WorkNest password reset code`,
    html,
    text,
  });
}

// ---------------------------------------------------------------------------
// Email 3 — the welcome email.
//
// Sent once, right after someone verifies their email address. We wait until
// verification rather than sending it at sign-up, so that:
//   1. They don't get two emails at the same moment (code + welcome)
//   2. We only welcome real, confirmed people
//
// This one has no code in it — it has a button instead.
// ---------------------------------------------------------------------------
export async function sendWelcomeEmail(email: string, name: string) {
  const firstName = name.split(" ")[0];

  // Where the button points. Falls back to localhost while developing.
  const appUrl = process.env.CLIENT_ORIGIN || "http://localhost:5190";
  const jobsUrl = `${appUrl}/find-jobs`;

  const html = shell({
    preheader: "Your WorkNest account is ready. Here's how to get started.",
    footerText:
      "You're receiving this because you created a WorkNest account. Questions? Just reply to this email.",
    body:
      headingRows(
        "You're in",
        `Welcome to WorkNest, ${firstName}`,
        "Your email is confirmed and your account is ready. Every role on WorkNest is a company actively hiring, and a real person on our team reviews every application."
      ) +
      buttonRow(jobsUrl, "Browse open roles") +
      bulletsRow([
        "<strong>Set up your profile once</strong> and reuse it on every application.",
        "<strong>Apply in one tap</strong> — no re-typing the same forty fields.",
        "<strong>Track your status in the open</strong> — submitted, reviewed, shortlisted, interviewing.",
      ]) +
      noticeRow(
        "A real person reads your application, scores it against the role, and updates you either way. No black hole."
      ),
  });

  const text = [
    `Welcome to WorkNest, ${firstName}.`,
    "",
    "Your email is confirmed and your account is ready.",
    "",
    `Browse open roles: ${jobsUrl}`,
    "",
    "- Set up your profile once and reuse it on every application.",
    "- Apply in one tap.",
    "- Track your status in the open.",
    "",
    "A real person reads every application and updates you either way.",
  ].join("\n");

  await send({
    to: email,
    name,
    subject: `Welcome to WorkNest, ${firstName}`,
    html,
    text,
  });
}

// ---------------------------------------------------------------------------
// Email 4 — sent the moment an application is submitted.
//
// This is the receipt. It's the difference between "did that go through?"
// and knowing exactly what was sent and what happens next — which is the
// whole promise on the WorkNest homepage.
// ---------------------------------------------------------------------------
export async function sendApplicationEmail(options: {
  email: string;
  name: string;
  jobTitle: string;
  companyName: string;
  location: string;
  expectedSalary: string;
}) {
  const { email, name, jobTitle, companyName, location, expectedSalary } =
    options;

  const firstName = name.split(" ")[0];
  const appUrl = process.env.CLIENT_ORIGIN || "http://localhost:5190";

  const appliedOn = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Only include rows we actually have a value for, so the table never
  // shows an empty field.
  const rows: [string, string][] = [
    ["Role", jobTitle],
    ["Company", companyName],
  ];

  if (location) rows.push(["Location", location]);
  if (expectedSalary) rows.push(["Expected salary", expectedSalary]);
  rows.push(["Applied on", appliedOn]);

  const html = shell({
    preheader: `Your application for ${jobTitle} at ${companyName} is in.`,
    footerText:
      "You're receiving this because you applied through WorkNest. Questions? Just reply to this email.",
    body:
      headingRows(
        "Application received",
        `You've applied, ${firstName}`,
        `Your application for <strong>${jobTitle}</strong> at <strong>${companyName}</strong> is in. Here's what we sent them.`
      ) +
      summaryRows(rows) +
      buttonRow(`${appUrl}/applications`, "Track this application") +
      bulletsRow([
        "<strong>A real person reads it</strong> — not a keyword filter.",
        "<strong>You'll hear back either way</strong>, usually within a few days.",
        "<strong>Your status moves in the open</strong> — submitted, reviewed, shortlisted, interviewing.",
      ]) +
      noticeRow(
        "No black hole. If you're not moving forward, we'll tell you that too, rather than leaving you guessing."
      ),
  });

  const text = [
    `You've applied, ${firstName}.`,
    "",
    `Role: ${jobTitle}`,
    `Company: ${companyName}`,
    location ? `Location: ${location}` : "",
    expectedSalary ? `Expected salary: ${expectedSalary}` : "",
    `Applied on: ${appliedOn}`,
    "",
    `Track this application: ${appUrl}/applications`,
    "",
    "A real person on our team reads your application and updates you either way.",
  ]
    .filter(Boolean)
    .join("\n");

  await send({
    to: email,
    name,
    subject: `Application received — ${jobTitle} at ${companyName}`,
    html,
    text,
  });
}

// ---------------------------------------------------------------------------
// Email 5 — sent every time a reviewer moves an application to a new stage.
//
// One function, not five — the copy just changes per status. Keeping it in
// one place means every stage email shares the same layout and tone, and
// adding a new status later is a one-line addition to STAGE_COPY rather than
// a whole new function.
// ---------------------------------------------------------------------------
type ReviewStatus = "review" | "shortlisted" | "interview" | "offer" | "hired" | "rejected";

// Every status gets the same three pieces of copy, each a function of
// (firstName, jobTitle, companyName) so any of them can be used freely
// without special-casing a particular status.
type StageCopyBuilder = (firstName: string, jobTitle: string, companyName: string) => string;

const STAGE_COPY: Record<
  ReviewStatus,
  { eyebrow: string; heading: StageCopyBuilder; intro: StageCopyBuilder; bullet: string }
> = {
  review: {
    eyebrow: "Status update",
    heading: (firstName) => `We're reading your application, ${firstName}`,
    intro: (_firstName, jobTitle, companyName) =>
      `A real person on our team is now reviewing your application for <strong>${jobTitle}</strong> at <strong>${companyName}</strong>.`,
    bullet: "We'll be in touch either way — no black hole.",
  },
  shortlisted: {
    eyebrow: "Good news",
    heading: (firstName) => `You've been shortlisted, ${firstName}`,
    intro: (_firstName, jobTitle, companyName) =>
      `Your application for <strong>${jobTitle}</strong> has been shortlisted and passed on to <strong>${companyName}</strong>.`,
    bullet: "The company is now reviewing your profile directly.",
  },
  interview: {
    eyebrow: "Great news",
    heading: (_firstName, _jobTitle, companyName) => `${companyName} would like to interview you`,
    intro: (_firstName, jobTitle, companyName) =>
      `<strong>${companyName}</strong> would like to move forward with an interview for <strong>${jobTitle}</strong>. They'll reach out with times shortly.`,
    bullet: "Keep an eye on your inbox for scheduling details.",
  },
  offer: {
    eyebrow: "Congratulations",
    heading: (firstName) => `You have an offer, ${firstName}`,
    intro: (_firstName, jobTitle, companyName) =>
      `<strong>${companyName}</strong> would like to offer you the <strong>${jobTitle}</strong> role. Congratulations — this is the whole point of WorkNest.`,
    bullet: "The company will follow up directly with next steps.",
  },
  hired: {
    eyebrow: "You're hired",
    heading: (firstName) => `Welcome to the team, ${firstName}`,
    intro: (_firstName, jobTitle, companyName) =>
      `You've accepted the <strong>${jobTitle}</strong> role at <strong>${companyName}</strong>. This is exactly what WorkNest is for.`,
    bullet: "The company will be in touch with onboarding details.",
  },
  rejected: {
    eyebrow: "Status update",
    heading: (firstName) => `An update on your application, ${firstName}`,
    intro: (_firstName, jobTitle, companyName) =>
      `You weren't selected for <strong>${jobTitle}</strong> at <strong>${companyName}</strong> this time.`,
    bullet: "Your profile stays on WorkNest — new roles open every week.",
  },
};

export async function sendApplicationStatusEmail(options: {
  email: string;
  name: string;
  jobTitle: string;
  companyName: string;
  status: ReviewStatus;
  note?: string;
}) {
  const { email, name, jobTitle, companyName, status, note } = options;
  const firstName = name.split(" ")[0];
  const appUrl = process.env.CLIENT_ORIGIN || "http://localhost:5190";

  const copy = STAGE_COPY[status];
  const heading = copy.heading(firstName, jobTitle, companyName);

  const html = shell({
    preheader: `${copy.eyebrow}: ${jobTitle} at ${companyName}`,
    footerText:
      "You're receiving this because you applied through WorkNest. Questions? Just reply to this email.",
    body:
      headingRows(copy.eyebrow, heading, copy.intro(firstName, jobTitle, companyName)) +
      buttonRow(`${appUrl}/applications`, "View your application") +
      bulletsRow([copy.bullet]) +
      (note ? noticeRow(note) : ""),
  });

  const text = [
    heading,
    "",
    copy.intro(firstName, jobTitle, companyName).replace(/<\/?strong>/g, ""),
    "",
    `View your application: ${appUrl}/applications`,
    "",
    copy.bullet,
    note ? `\n${note}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  await send({
    to: email,
    name,
    subject: `${copy.eyebrow} — ${jobTitle} at ${companyName}`,
    html,
    text,
  });
}
