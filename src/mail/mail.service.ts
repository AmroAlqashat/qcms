import { Injectable } from '@nestjs/common';
import { Resend } from 'nestjs-resend';

const resend = new Resend(process.env.RESEND_API_KEY);

@Injectable()
export class MailService {
  async sendOtp(email: string, code: string) {
    await resend.emails.send({
      from: process.env.EMAIL_SENDER_ADDRESS!,
      to: email,
      subject: 'your otp',
      html: `<p>your otp is: ${code}</p>`,
    });
  }
}
