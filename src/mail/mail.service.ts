import { MailerService } from '@nestjs-modules/mailer';
import { Injectable, InternalServerErrorException } from '@nestjs/common';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) { }

  async sendOtp(email: string, code: string) {
    if (!process.env.EMAIL_SENDER_ADDRESS)
      throw Error('EMAIL_SENDER_ADDRESS is requried in env');
    await this.sendEmail(email, 'your otp', `<p>Your OTP is: ${code}</p>`);
  }

  private async sendEmail(
    to: string,
    subject: string,
    body: string,
  ): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: to,
        subject: subject,
        text: body,
      });
      console.log(`Email successfully sent to ${to}`);
    } catch (error) {
      console.error('SMTP Email Error: ', error);
      throw new InternalServerErrorException('Failed to send email.');
    }
  }
}
