// Renders the three emails to HTML files so you can open them in a browser.
// Run with: npx tsx preview-emails.ts
import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";

const captured: Array<{ subject: string; html: string }> = [];

// Brevo's SDK sends with fetch under the hood. We replace fetch so nothing
// leaves the machine — we just grab the HTML and pretend it worked.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init: any) => {
  if (String(url).includes("brevo.com")) {
    const body = JSON.parse(init.body);
    captured.push({ subject: body.subject, html: body.htmlContent });
    return new Response(JSON.stringify({ messageId: "preview" }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  }
  return realFetch(url, init);
}) as typeof fetch;

async function run() {
  const svc = await import("./src/services/emailService");

  await svc.sendVerificationEmail("test@example.com", "Israel Emmanuel", "424242");
  await svc.sendPasswordResetEmail("test@example.com", "Israel Emmanuel", "918273");
  await svc.sendWelcomeEmail("test@example.com", "Israel Emmanuel");
  await svc.sendApplicationEmail({
    email: "test@example.com",
    name: "Israel Emmanuel",
    jobTitle: "Frontend Engineer",
    companyName: "Paystack",
    location: "Lagos, Nigeria",
    expectedSalary: "₦600,000 – ₦850,000 / month",
  });

  const outDir = path.join(process.cwd(), "email-preview");
  fs.mkdirSync(outDir, { recursive: true });

  const names = ["verification", "reset", "welcome", "application"];
  captured.forEach((item, i) => {
    fs.writeFileSync(path.join(outDir, `${names[i]}.html`), item.html);
    console.log(`${names[i]}.html  <-  "${item.subject}"  (${item.html.length} chars)`);
  });
}

run();
