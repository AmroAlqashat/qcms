import { MailerService } from '@nestjs-modules/mailer';
import { Injectable, InternalServerErrorException } from '@nestjs/common';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendOtp(email: string, code: string) {
    if (!process.env.EMAIL_SENDER_ADDRESS)
      throw Error('EMAIL_SENDER_ADDRESS is requried in env');
    const subject = 'رمز التحقق الخاص بك | QCMS';
    const text = [
      'تأكيد هويتك',
      'استخدم رمز التحقق التالي لإكمال طلبك في نظام QCMS:',
      '',
      code,
      '',
      'تنتهي صلاحية هذا الرمز بعد خمس دقائق من إصداره.',
      'حفاظًا على أمان حسابك، لا تشارك الرمز مع أي شخص.',
      'إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة.',
      '',
      'هذه رسالة آلية، يرجى عدم الرد عليها.',
      'QCMS',
    ].join('\n');
    const escapedCode = code.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return entities[character];
    });
    // Inline styles and a presentation table work without email-client scripts.
    const html = `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:24px 12px;background-color:#f3f6f5;font-family:Arial,Tahoma,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #dce5e2;border-radius:12px;">
      <tr>
        <td dir="rtl" style="padding:32px 24px;text-align:right;line-height:1.8;">
          <p dir="ltr" style="margin:0 0 24px;color:#287a73;font-size:20px;font-weight:bold;text-align:right;">QCMS</p>
          <h1 style="margin:0 0 12px;font-size:24px;">تأكيد هويتك</h1>
          <p style="margin:0 0 20px;">استخدم رمز التحقق التالي لإكمال طلبك في نظام QCMS:</p>
          <p dir="ltr" style="margin:0;padding:20px 12px;background-color:#edf5f3;border:1px solid #c9dfd9;border-radius:8px;text-align:center;font-family:Arial,sans-serif;font-size:36px;font-weight:bold;line-height:1.4;color:#185c56;">${escapedCode}</p>
          <p style="margin:8px 0 24px;text-align:center;font-size:13px;color:#52635f;">يمكنك تحديد الرمز ونسخه ولصقه في صفحة التحقق.</p>
          <p style="margin:0 0 12px;">تنتهي صلاحية هذا الرمز بعد <strong>خمس دقائق من إصداره</strong>.</p>
          <p style="margin:0 0 12px;">حفاظًا على أمان حسابك، لا تشارك الرمز مع أي شخص.</p>
          <p style="margin:0 0 24px;">إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة.</p>
          <p style="margin:0;padding-top:20px;border-top:1px solid #e5ebe8;font-size:12px;color:#52635f;">هذه رسالة آلية، يرجى عدم الرد عليها.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
    await this.sendEmail(email, subject, text, html);
  }

  private async sendEmail(
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: to,
        subject: subject,
        text,
        html,
      });
      console.log(`Email successfully sent to ${to}`);
    } catch (error) {
      console.error('SMTP Email Error: ', error);
      throw new InternalServerErrorException('Failed to send email.');
    }
  }
}
