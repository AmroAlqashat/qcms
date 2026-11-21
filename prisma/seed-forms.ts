import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const starterForm = {
  id: 'a1387869-0b48-4db5-be4c-68c18ace06e8',
  name: 'تسجيل طالب في نشاط',
  form: {
    display: 'form',
    components: [
      {
        type: 'textfield',
        key: 'firstName',
        label: 'اسم الطالب الأول',
        input: true,
        validate: { required: true },
      },
      {
        type: 'textfield',
        key: 'nationalId',
        label: 'الرقم الوطني للطالب',
        input: true,
        validate: { required: true },
      },
      {
        type: 'datetime',
        key: 'dateOfBirth',
        label: 'تاريخ ميلاد الطالب',
        input: true,
        enableTime: false,
        format: 'yyyy-MM-dd',
        validate: { required: true },
      },
      {
        type: 'button',
        key: 'submit',
        label: 'تسجيل الطالب',
        action: 'submit',
        theme: 'primary',
        input: true,
      },
    ],
  },
};

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.forms.upsert({
      where: { id: starterForm.id },
      create: starterForm,
      update: {},
    });
    console.log('Activity registration starter form is available.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
