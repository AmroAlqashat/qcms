import { Injectable } from '@nestjs/common';

@Injectable()
export class MailService {
  sendOtp(email: string, code: string) {
    console.log(`[Email emulation]: email: ${email} | OTP: ${code}`);
  };
}
