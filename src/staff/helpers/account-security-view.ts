export type SecurityFlow = 'password' | 'forgot-password' | 'email';

export function accountSecurityView(
  flow: SecurityFlow,
  email = '',
  verification = true,
  alreadySent = false,
) {
  const forgot = flow === 'forgot-password';
  const emailChange = flow === 'email';
  return {
    title: emailChange ? 'تغيير البريد الإلكتروني' : 'تغيير كلمة المرور',
    heading: emailChange
      ? 'تأكيد البريد الإلكتروني الجديد'
      : 'تأكيد تغيير كلمة المرور',
    description:
      'أدخل رمز التحقق المكوّن من ستة أرقام. الرمز صالح لمدة خمس دقائق.',
    dialogId: 'account-otp-dialog',
    flow,
    email,
    emailChange,
    passwordFields: !emailChange,
    verification,
    alreadySent,
    action: emailChange
      ? '/staff/change-email'
      : forgot
        ? '/staff/forgot-my-password/reset'
        : '/staff/reset-my-password',
    resendAction: emailChange
      ? '/staff/change-email/resend-otp'
      : forgot
        ? '/staff/forgot-my-password/resend-otp'
        : '/staff/reset-my-password/send-otp',
    restartHref: emailChange
      ? '/staff/change-email'
      : forgot
        ? '/staff/forgot-my-password'
        : undefined,
    submitLabel: emailChange ? 'تأكيد وحفظ البريد الجديد' : 'حفظ كلمة المرور',
    sendEmail: emailChange || forgot,
  };
}
