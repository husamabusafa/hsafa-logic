import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@hsafa.com";

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set");
    }
    resendClient = new Resend(RESEND_API_KEY);
  }
  return resendClient;
}

export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function getCodeExpiry(): Date {
  return new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
}

export async function sendVerificationEmail(
  email: string,
  name: string,
  code: string
): Promise<void> {
  const resend = getResend();

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "Verify your email — Hsafa",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-size: 24px; font-weight: 600; color: #111; margin: 0;">Hsafa</h1>
        </div>
        <p style="font-size: 16px; color: #333; margin-bottom: 8px;">Hi ${name},</p>
        <p style="font-size: 15px; color: #555; margin-bottom: 24px;">
          Enter this code to verify your email address:
        </p>
        <div style="background: #f4f4f5; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #111;">${code}</span>
        </div>
        <p style="font-size: 13px; color: #999; text-align: center;">
          This code expires in 10 minutes. If you didn't create an account, you can ignore this email.
        </p>
      </div>
    `,
  });
}
