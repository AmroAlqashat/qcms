// Demo data covering every part of the app, for manual testing only.
// Run after the base seed:  npm run seed && npm run seed:demo
//
// Safe to run again: rows use fixed ids (or unique fields) and are upserted,
// and every date is set relative to today, so "yesterday" stays yesterday.
// Never run it on a real center's database.
import 'dotenv/config';
import {
  ActivityLevel,
  AttendanceStatus,
  JobTitle,
  Prisma,
  PrismaClient,
  RegistrationStatus,
  ScopeType,
  StaffStatus,
  TermType,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { initializeSuperadmin } from '../src/setup/helpers/initialize-superadmin';
import { validateFormComponents } from '../src/forms/helpers/validate-form-components';
import { validateFormAnswers } from '../src/forms/helpers/validate-form-answers';
import { seedPermissions } from './seed-permissions';

const prisma = new PrismaClient();

// Test credentials (local development only).
const ADMIN_EMAIL = 'admin@gmail.com';
const ADMIN_PASSWORD = 'adminadmin';
// Every demo staff account that can log in uses this password.
const DEMO_STAFF_PASSWORD = 'demo12345';

// Fixed ids: "de300000-<group>-4000-8000-<number>".
const id = (group: string, n: number) =>
  `de300000-${group}-4000-8000-${String(n).padStart(12, '0')}`;

// ---------- dates (Asia/Amman is UTC+3 all year) ----------
const DAY = 86_400_000;
const ammanDay = (offsetDays: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Amman' }).format(
    new Date(Date.now() + offsetDays * DAY),
  );
// A moment in Amman, `offsetDays` from today, at hh:mm.
const at = (offsetDays: number, time: string) =>
  new Date(`${ammanDay(offsetDays)}T${time}:00+03:00`);
// Birth dates are stored at UTC midnight (see applications.service.ts).
const birthDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

// Halaqa schedule: 7 days (Sunday first), '' = no meeting that day.
const schedule = (days: number[], start: string, end: string) => ({
  startTime: Array.from({ length: 7 }, (_, d) =>
    days.includes(d) ? start : '',
  ),
  endTime: Array.from({ length: 7 }, (_, d) => (days.includes(d) ? end : '')),
});

// ---------- the demo form: one of every allowed field type ----------
const DEMO_FORM_ID = id('0f00', 1);
const demoForm = {
  display: 'form',
  components: [
    {
      type: 'panel',
      key: 'generalPanel',
      title: 'معلومات عامة',
      input: false,
      components: [
        {
          type: 'columns',
          key: 'nameColumns',
          input: false,
          columns: [
            {
              width: 6,
              size: 'md',
              components: [
                {
                  type: 'textfield',
                  key: 'nickname',
                  label: 'اسم الشهرة',
                  input: true,
                },
              ],
            },
            {
              width: 6,
              size: 'md',
              components: [
                {
                  type: 'number',
                  key: 'age',
                  label: 'العمر',
                  input: true,
                  validate: { required: true, min: 5, max: 20 },
                },
              ],
            },
          ],
        },
        {
          type: 'email',
          key: 'contactEmail',
          label: 'بريد ولي الأمر',
          input: true,
        },
        {
          type: 'phoneNumber',
          key: 'contactPhone',
          label: 'رقم التواصل',
          input: true,
          inputMask: '',
          validate: { required: true },
        },
      ],
    },
    {
      type: 'fieldset',
      key: 'detailsFieldset',
      legend: 'تفاصيل المشاركة',
      input: false,
      components: [
        {
          type: 'select',
          key: 'shirtSize',
          label: 'مقاس القميص',
          input: true,
          dataSrc: 'values',
          data: {
            values: [
              { label: 'صغير', value: 's' },
              { label: 'متوسط', value: 'm' },
              { label: 'كبير', value: 'l' },
            ],
          },
          validate: { required: true },
        },
        {
          type: 'radio',
          key: 'transport',
          label: 'وسيلة المواصلات',
          input: true,
          values: [
            { label: 'باص المركز', value: 'bus' },
            { label: 'مع ولي الأمر', value: 'parent' },
          ],
          validate: { required: true },
        },
        {
          type: 'selectboxes',
          key: 'meals',
          label: 'الوجبات',
          input: true,
          values: [
            { label: 'فطور', value: 'breakfast' },
            { label: 'غداء', value: 'lunch' },
          ],
        },
        {
          type: 'datetime',
          key: 'arrivalDate',
          label: 'موعد الوصول',
          input: true,
          enableTime: false,
          format: 'yyyy-MM-dd',
        },
        {
          type: 'textarea',
          key: 'notes',
          label: 'ملاحظات',
          input: true,
          validate: { maxLength: 500 },
        },
      ],
    },
    {
      type: 'checkbox',
      key: 'agree',
      label: 'أوافق على شروط النشاط',
      input: true,
      validate: { required: true },
    },
    {
      type: 'button',
      key: 'submit',
      label: 'إرسال',
      action: 'submit',
      input: true,
    },
  ],
};

const answers = (overrides: Record<string, unknown> = {}) => ({
  nickname: 'أبو حمزة',
  age: 12,
  contactEmail: 'parent@example.com',
  contactPhone: '0791234567',
  shirtSize: 'm',
  transport: 'bus',
  meals: { breakfast: true, lunch: false },
  arrivalDate: `${ammanDay(3)}T00:00:00+03:00`,
  notes: 'لا توجد ملاحظات',
  agree: true,
  ...overrides,
});

// Check our own demo data with the app's own rules, so the demo never
// contains something the app itself would reject.
function assertValid() {
  const formError = validateFormComponents(demoForm.components);
  if (formError) throw new Error(`Demo form invalid: ${formError}`);
  for (const sample of [answers(), answers({ transport: 'parent' })]) {
    const result = validateFormAnswers(demoForm, sample);
    if (result.error) throw new Error(`Demo answers invalid: ${result.error}`);
  }
}

async function main() {
  assertValid();
  await prisma.$transaction((tx) => seedPermissions(tx), { timeout: 60_000 });

  // ---------- admin ----------
  const adminHash = await argon2.hash(ADMIN_PASSWORD, {
    type: argon2.argon2id,
  });
  let admin = await prisma.staffMembers.findFirst({
    where: { email: ADMIN_EMAIL },
    select: { id: true },
  });
  if (admin) {
    await prisma.staffMembers.update({
      where: { id: admin.id },
      data: {
        passwordHash: adminHash,
        status: StaffStatus.ACTIVE,
        mustChangePassword: false,
        isDeleted: false,
      },
    });
  } else {
    // Same path as the /setup page: superadmin role, settings, setup done.
    admin = await prisma.$transaction(
      async (tx) => {
        await tx.systemSetups.upsert({
          where: { id: 1 },
          create: { id: 1 },
          update: {},
        });
        return initializeSuperadmin(tx, {
          email: ADMIN_EMAIL,
          fullName: 'مدير النظام',
          passwordHash: adminHash,
        });
      },
      { timeout: 60_000 },
    );
  }
  const adminId = admin.id;

  // ---------- roles ----------
  const permissions = await prisma.permissions.findMany({
    select: {
      id: true,
      allowedScopes: true,
      permission_resources: { select: { eng_name: true } },
    },
  });
  const SUPERVISOR_RESOURCES = new Set([
    'terms',
    'halaqas',
    'activities',
    'activity_participants',
    'students',
    'enrollments',
    'forms',
  ]);

  async function upsertRole(
    name: string,
    description: string,
    grants: { permissionId: string; scopeType: ScopeType }[],
  ) {
    const role = await prisma.roles.upsert({
      where: { name },
      update: { description },
      create: { name, description },
      select: { id: true },
    });
    // Reset the role's permissions so reruns match this file exactly.
    await prisma.rolePermissions.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermissions.createMany({
      data: grants.map((grant) => ({ ...grant, roleId: role.id })),
    });
    return role.id;
  }

  const supervisorRoleId = await upsertRole(
    'مشرف الأنشطة',
    'إدارة الفصول والحلقات والأنشطة والنماذج على مستوى المركز (بيانات تجريبية).',
    permissions
      .filter(
        (p) =>
          SUPERVISOR_RESOURCES.has(p.permission_resources.eng_name) &&
          p.allowedScopes.includes(ScopeType.CENTER_WIDE),
      )
      .map((p) => ({ permissionId: p.id, scopeType: ScopeType.CENTER_WIDE })),
  );
  // Every permission that can be limited to the teacher's own halaqas.
  const teacherRoleId = await upsertRole(
    'معلم',
    'صلاحيات على الحلقات المسندة للمعلم فقط (بيانات تجريبية).',
    permissions
      .filter((p) => p.allowedScopes.includes(ScopeType.ASSIGNED_CLASS))
      .map((p) => ({
        permissionId: p.id,
        scopeType: ScopeType.ASSIGNED_CLASS,
      })),
  );

  // ---------- staff ----------
  const staffHash = await argon2.hash(DEMO_STAFF_PASSWORD, {
    type: argon2.argon2id,
  });
  const staffRows = [
    {
      key: 'supervisor',
      email: 'supervisor@demo.test',
      fullName: 'سعيد المشرف',
      jobTitle: JobTitle.ADMIN,
      status: StaffStatus.ACTIVE,
      canLogin: true,
      roleId: supervisorRoleId,
    },
    {
      key: 'teacher1',
      email: 'teacher1@demo.test',
      fullName: 'عبد الله المعلم',
      jobTitle: JobTitle.TEACHER,
      status: StaffStatus.ACTIVE,
      canLogin: true,
      roleId: teacherRoleId,
    },
    {
      key: 'teacher2',
      email: 'teacher2@demo.test',
      fullName: 'محمود المعلم',
      jobTitle: JobTitle.TEACHER,
      status: StaffStatus.ACTIVE,
      canLogin: true,
      roleId: teacherRoleId,
    },
    {
      key: 'finance',
      email: 'finance@demo.test',
      fullName: 'هالة المحاسبة',
      jobTitle: JobTitle.FINANCE,
      status: StaffStatus.ACTIVE,
      canLogin: true,
      roleId: undefined,
    },
    {
      key: 'invited',
      email: 'invited@demo.test',
      fullName: null,
      jobTitle: null,
      status: StaffStatus.PENDING,
      canLogin: false,
      roleId: undefined,
    },
    {
      key: 'inactive',
      email: 'inactive@demo.test',
      fullName: 'موظف موقوف',
      jobTitle: JobTitle.MISC,
      status: StaffStatus.INACTIVE,
      canLogin: true,
      roleId: undefined,
    },
    {
      key: 'deleted',
      email: 'deleted@demo.test',
      fullName: 'موظف محذوف',
      jobTitle: JobTitle.MISC,
      status: StaffStatus.INACTIVE,
      canLogin: false,
      roleId: undefined,
      isDeleted: true,
    },
  ];
  const staff: Record<string, string> = {};
  for (const [index, row] of staffRows.entries()) {
    const data = {
      fullName: row.fullName,
      jobTitle: row.jobTitle,
      status: row.status,
      passwordHash: row.canLogin ? staffHash : null,
      mustChangePassword: !row.canLogin,
      isDeleted: row.isDeleted ?? false,
      nationalId: row.fullName ? `20000000${index}` : null,
      phone: row.fullName ? `079000000${index}` : null,
      dateOfBirth: row.fullName ? birthDate(`199${index}-03-1${index}`) : null,
    };
    const saved = await prisma.staffMembers.upsert({
      where: { email: row.email },
      update: data,
      create: { email: row.email, ...data },
      select: { id: true },
    });
    staff[row.key] = saved.id;
    if (row.roleId)
      await prisma.roleStaffAssignments.upsert({
        where: { staffId_roleId: { staffId: saved.id, roleId: row.roleId } },
        update: { revokedAt: null },
        create: { staffId: saved.id, roleId: row.roleId, grantedById: adminId },
      });
  }

  // A direct grant (no role): finance can read forms.
  const formsRead = await prisma.permissions.findFirstOrThrow({
    where: {
      permission_resources: { eng_name: 'forms' },
      permission_actions: { eng_name: 'read' },
    },
    select: { id: true },
  });
  await prisma.directPermissionGrants.upsert({
    where: {
      staffId_permissionId_scopeType: {
        staffId: staff.finance,
        permissionId: formsRead.id,
        scopeType: ScopeType.CENTER_WIDE,
      },
    },
    update: { revokedAt: null },
    create: {
      staffId: staff.finance,
      permissionId: formsRead.id,
      scopeType: ScopeType.CENTER_WIDE,
      grantedById: adminId,
    },
  });

  // ---------- terms ----------
  const termRows = [
    {
      termId: '20261',
      type: TermType.STANDARD,
      startDate: at(-30, '00:00'),
      endDate: at(90, '00:00'),
      archivedAt: null,
    },
    {
      termId: '20262',
      type: TermType.CONTINUOUS,
      startDate: null,
      endDate: null,
      archivedAt: null,
    },
    {
      termId: '20252',
      type: TermType.STANDARD,
      startDate: at(-200, '00:00'),
      endDate: at(-40, '00:00'),
      archivedAt: at(-30, '12:00'),
    },
  ];
  const terms: Record<string, string> = {};
  for (const { termId, ...data } of termRows) {
    const term = await prisma.terms.upsert({
      where: { termId },
      update: data,
      create: { termId, ...data },
      select: { id: true },
    });
    terms[termId] = term.id;
  }

  // ---------- halaqas ----------
  const halaqaRows = [
    {
      key: 'abuBakr',
      id: id('0a1a', 1),
      name: 'حلقة أبي بكر',
      termId: terms['20261'],
      meetingDays: schedule([0, 2], '16:00', '18:00'),
      archivedAt: null,
    },
    {
      key: 'omar',
      id: id('0a1a', 2),
      name: 'حلقة عمر',
      termId: terms['20261'],
      meetingDays: schedule([1, 3], '17:00', '19:00'),
      archivedAt: null,
    },
    {
      key: 'fajr',
      id: id('0a1a', 3),
      name: 'حلقة الفجر',
      termId: terms['20262'],
      meetingDays: schedule([6], '06:00', '07:30'),
      archivedAt: null,
    },
    {
      key: 'old',
      id: id('0a1a', 4),
      name: 'حلقة الفصل الماضي',
      termId: terms['20252'],
      meetingDays: schedule([0], '16:00', '17:00'),
      archivedAt: at(-30, '12:00'),
    },
  ];
  const halaqas: Record<string, string> = {};
  for (const { key, id: halaqaId, ...data } of halaqaRows) {
    await prisma.halaqas.upsert({
      where: { id: halaqaId },
      update: data,
      create: { id: halaqaId, ...data },
    });
    halaqas[key] = halaqaId;
  }

  // Teachers see only their own halaqa.
  const classAssignments = [
    { id: id('0c1a', 1), staffId: staff.teacher1, halaqaId: halaqas.abuBakr },
    { id: id('0c1a', 2), staffId: staff.teacher2, halaqaId: halaqas.omar },
  ];
  for (const row of classAssignments)
    await prisma.staffClassAssignments.upsert({
      where: { id: row.id },
      update: { ...row, endedAt: null },
      create: row,
    });

  // ---------- students ----------
  const studentRows = [
    {
      key: 'ahmad',
      nationalId: '9900000001',
      fullName: 'أحمد علي',
      dob: '2013-04-12',
      expected: 'يقبل في أنشطة حلقة أبي بكر وأنشطة المركز',
    },
    {
      key: 'sara',
      nationalId: '9900000002',
      fullName: 'سارة محمود',
      dob: '2012-09-03',
      expected: 'نُقلت إلى حلقة عمر: تُرفض في نشاط حلقة أبي بكر',
    },
    {
      key: 'yousef',
      nationalId: '9900000003',
      fullName: 'يوسف خالد',
      dob: '2014-01-25',
      expected: 'انتهى تسجيله في أبي بكر: يُرفض في نشاطها',
    },
    {
      key: 'maryam',
      nationalId: '9900000004',
      fullName: 'مريم سعيد',
      dob: '2011-11-30',
      expected: 'غير مسجلة في حلقة: أنشطة المركز فقط',
    },
    {
      key: 'khaled',
      nationalId: '9900000005',
      fullName: 'خالد يوسف',
      dob: '2013-07-07',
      expected: 'مسجّل مسبقًا في رحلة الحديقة: 409',
    },
    {
      key: 'layla',
      nationalId: '9900000006',
      fullName: 'ليلى أحمد',
      dob: '2013-04-12',
      expected: 'نفس تاريخ ميلاد أحمد: يقبل بشكل طبيعي',
    },
  ];
  const students: Record<string, string> = {};
  for (const row of studentRows) {
    const data = { fullName: row.fullName, dateOfBirth: birthDate(row.dob) };
    const student = await prisma.students.upsert({
      where: { nationalId: row.nationalId },
      update: data,
      create: { nationalId: row.nationalId, ...data },
      select: { id: true },
    });
    students[row.key] = student.id;
  }

  // Enrollments: current (endedAt null) and finished ones.
  const enrollments = [
    {
      id: id('0e01', 1),
      studentId: students.ahmad,
      halaqaId: halaqas.abuBakr,
      enrolledAt: at(-30, '10:00'),
      endedAt: null,
    },
    {
      id: id('0e01', 2),
      studentId: students.sara,
      halaqaId: halaqas.abuBakr,
      enrolledAt: at(-30, '10:00'),
      endedAt: at(-10, '10:00'),
    },
    {
      id: id('0e01', 3),
      studentId: students.sara,
      halaqaId: halaqas.omar,
      enrolledAt: at(-10, '10:00'),
      endedAt: null,
    },
    {
      id: id('0e01', 4),
      studentId: students.yousef,
      halaqaId: halaqas.abuBakr,
      enrolledAt: at(-30, '10:00'),
      endedAt: at(-5, '10:00'),
    },
    {
      id: id('0e01', 5),
      studentId: students.khaled,
      halaqaId: halaqas.abuBakr,
      enrolledAt: at(-30, '10:00'),
      endedAt: null,
    },
    {
      id: id('0e01', 6),
      studentId: students.layla,
      halaqaId: halaqas.omar,
      enrolledAt: at(-30, '10:00'),
      endedAt: null,
    },
    {
      id: id('0e01', 7),
      studentId: students.maryam,
      halaqaId: halaqas.old,
      enrolledAt: at(-200, '10:00'),
      endedAt: at(-40, '10:00'),
    },
  ];
  for (const row of enrollments)
    await prisma.enrollments.upsert({
      where: { id: row.id },
      update: row,
      create: row,
    });

  // Sara moved from Abu Bakr to Omar.
  const transfer = {
    id: id('0712', 1),
    studentId: students.sara,
    fromHalaqaId: halaqas.abuBakr,
    toHalaqaId: halaqas.omar,
    actingStaffId: adminId,
    transferredAt: at(-10, '10:00'),
  };
  await prisma.halaqaTransfers.upsert({
    where: { id: transfer.id },
    update: transfer,
    create: transfer,
  });

  // ---------- guardians ----------
  const guardians = [
    {
      id: id('0911', 1),
      fullName: 'علي أحمد',
      primaryPhone: '0791111111',
      secondaryPhone: '0781111111',
      children: ['ahmad', 'layla'],
    },
    {
      id: id('0911', 2),
      fullName: 'محمود سالم',
      primaryPhone: '0792222222',
      secondaryPhone: null,
      children: ['sara'],
    },
    {
      id: id('0911', 3),
      fullName: 'خالد عمر',
      primaryPhone: '0793333333',
      secondaryPhone: null,
      children: ['yousef', 'khaled'],
    },
  ];
  let linkNumber = 0;
  for (const { children, ...guardian } of guardians) {
    await prisma.guardians.upsert({
      where: { id: guardian.id },
      update: guardian,
      create: guardian,
    });
    for (const child of children) {
      const link = {
        id: id('0915', ++linkNumber),
        guardianId: guardian.id,
        studentId: students[child],
        createdById: adminId,
      };
      await prisma.guardianStudentLinks.upsert({
        where: { id: link.id },
        update: { ...link, removedAt: null, removedById: null },
        create: link,
      });
    }
  }

  // ---------- special case notes ----------
  const notes = [
    {
      id: id('05c1', 1),
      studentId: students.ahmad,
      note: 'يعاني من حساسية من المكسرات.',
      authorId: adminId,
    },
    {
      id: id('05c1', 2),
      studentId: students.yousef,
      note: 'انتقل إلى مدينة أخرى، تواصل مع ولي الأمر قبل إعادة التسجيل.',
      authorId: staff.teacher1,
    },
  ];
  for (const row of notes)
    await prisma.specialCaseNotes.upsert({
      where: { id: row.id },
      update: row,
      create: row,
    });

  // ---------- term registrations ----------
  const registrations = [
    {
      studentId: students.maryam,
      termId: terms['20261'],
      status: RegistrationStatus.PENDING,
      decidedById: null,
      decidedAt: null,
      rejectionReason: null,
    },
    {
      studentId: students.layla,
      termId: terms['20261'],
      status: RegistrationStatus.APPROVED,
      decidedById: adminId,
      decidedAt: at(-29, '09:00'),
      rejectionReason: null,
    },
    {
      studentId: students.yousef,
      termId: terms['20262'],
      status: RegistrationStatus.REJECTED,
      decidedById: adminId,
      decidedAt: at(-3, '09:00'),
      rejectionReason: 'لا توجد مقاعد شاغرة في حلقة الفجر.',
    },
  ];
  for (const row of registrations)
    await prisma.termRegistrations.upsert({
      where: {
        studentId_termId: { studentId: row.studentId, termId: row.termId },
      },
      update: row,
      create: row,
    });

  // ---------- form ----------
  await prisma.forms.upsert({
    where: { id: DEMO_FORM_ID },
    update: { name: 'استبيان النشاط (تجريبي)', form: demoForm },
    create: {
      id: DEMO_FORM_ID,
      name: 'استبيان النشاط (تجريبي)',
      form: demoForm,
    },
  });

  // ---------- activities ----------
  const activityRows = [
    {
      key: 'trip',
      name: 'رحلة إلى الحديقة',
      level: ActivityLevel.CENTER_WIDE,
      halaqaId: null,
      date: at(10, '09:00'),
      isFormEnabled: true,
      formClosesAt: at(7, '23:00'),
      archivedAt: null,
      note: 'مفتوح، فيه مشاركون: النموذج مقفل للتعديل',
    },
    {
      key: 'contest',
      name: 'مسابقة الحفظ',
      level: ActivityLevel.HALAQA_SPECIFIC,
      halaqaId: halaqas.abuBakr,
      date: at(6, '17:00'),
      isFormEnabled: true,
      formClosesAt: null,
      archivedAt: null,
      note: 'مفتوح لطلاب حلقة أبي بكر فقط',
    },
    {
      key: 'lecture',
      name: 'محاضرة آداب طالب العلم',
      level: ActivityLevel.CENTER_WIDE,
      halaqaId: null,
      date: at(4, '18:00'),
      isFormEnabled: false,
      formClosesAt: null,
      archivedAt: null,
      note: 'التسجيل معطّل',
    },
    {
      key: 'sports',
      name: 'اليوم الرياضي',
      level: ActivityLevel.CENTER_WIDE,
      halaqaId: null,
      date: at(5, '08:00'),
      isFormEnabled: true,
      formClosesAt: at(-1, '23:00'),
      archivedAt: null,
      note: 'انتهى موعد الإغلاق',
    },
    {
      key: 'yesterday',
      name: 'لقاء أولياء الأمور',
      level: ActivityLevel.CENTER_WIDE,
      halaqaId: null,
      date: at(-1, '18:00'),
      isFormEnabled: true,
      formClosesAt: null,
      archivedAt: null,
      note: 'انتهى (أمس)، الحضور مسجّل',
    },
    {
      key: 'today',
      name: 'جلسة مراجعة اليوم',
      level: ActivityLevel.HALAQA_SPECIFIC,
      halaqaId: halaqas.abuBakr,
      date: at(0, '23:59'),
      isFormEnabled: true,
      formClosesAt: null,
      archivedAt: null,
      note: 'اليوم: يمكن تسجيل الحضور',
    },
    {
      key: 'archived',
      name: 'نشاط مؤرشف',
      level: ActivityLevel.CENTER_WIDE,
      halaqaId: null,
      date: at(-20, '18:00'),
      isFormEnabled: false,
      formClosesAt: null,
      archivedAt: at(-15, '12:00'),
      note: 'مؤرشف: صفحة التسجيل 404',
    },
    {
      key: 'oldTerm',
      name: 'نشاط حلقة الفصل الماضي',
      level: ActivityLevel.HALAQA_SPECIFIC,
      halaqaId: halaqas.old,
      date: at(8, '17:00'),
      isFormEnabled: true,
      formClosesAt: null,
      archivedAt: null,
      note: 'حلقته مؤرشفة: يجب أن يُغلق (ثغرة معروفة)',
    },
  ];
  const activities: Record<string, string> = {};
  for (const [index, row] of activityRows.entries()) {
    const activityId = id('0ac7', index + 1);
    // `key` and `note` are only for this file and the summary table.
    const { key, note, ...fields } = row;
    void note;
    const data = { ...fields, location: 'مسجد المركز', formId: DEMO_FORM_ID };
    await prisma.activities.upsert({
      where: { id: activityId },
      update: data,
      create: { id: activityId, ...data },
    });
    activities[key] = activityId;
  }

  // Teacher 1 is also assigned to the contest.
  const activityAssignment = {
    id: id('0aa1', 1),
    staffId: staff.teacher1,
    activityId: activities.contest,
  };
  await prisma.staffActivityAssignments.upsert({
    where: { id: activityAssignment.id },
    update: { ...activityAssignment, endedAt: null },
    create: activityAssignment,
  });

  // ---------- guests ----------
  const guest = {
    id: id('0957', 1),
    fullName: 'عمر الضيف',
    guardianName: 'سالم عمر',
    guardianPhone: '0794444444',
  };
  await prisma.guests.upsert({
    where: { id: guest.id },
    update: guest,
    create: guest,
  });

  // ---------- participants ----------
  // formAnswers {} = registered manually by staff (no answers yet).
  const participants: {
    activity: string;
    studentId?: string;
    guestId?: string;
    formAnswers: Prisma.InputJsonObject;
    attendanceStatus?: AttendanceStatus;
  }[] = [
    { activity: 'trip', studentId: students.khaled, formAnswers: answers() },
    {
      activity: 'trip',
      studentId: students.maryam,
      formAnswers: answers({
        transport: 'parent',
        meals: { breakfast: false, lunch: true },
      }),
    },
    { activity: 'trip', guestId: guest.id, formAnswers: {} },
    {
      activity: 'yesterday',
      studentId: students.ahmad,
      formAnswers: answers(),
      attendanceStatus: AttendanceStatus.PRESENT,
    },
    {
      activity: 'yesterday',
      studentId: students.layla,
      formAnswers: answers(),
      attendanceStatus: AttendanceStatus.ABSENT,
    },
    { activity: 'yesterday', guestId: guest.id, formAnswers: {} },
    { activity: 'today', studentId: students.ahmad, formAnswers: answers() },
    { activity: 'today', studentId: students.khaled, formAnswers: {} },
  ];
  for (const [index, row] of participants.entries()) {
    const participantId = id('0a77', index + 1);
    const data = {
      activityId: activities[row.activity],
      studentId: row.studentId ?? null,
      guestId: row.guestId ?? null,
      formAnswers: row.formAnswers,
      attendanceStatus: row.attendanceStatus ?? null,
      attendedAt: row.attendanceStatus ? at(-1, '18:30') : null,
    };
    await prisma.activityParticipants.upsert({
      where: { id: participantId },
      update: data,
      create: { id: participantId, ...data },
    });
  }

  // ---------- summary ----------
  const origin = `http://localhost:${process.env.PORT ?? 3000}`;
  console.log(
    '\nStaff (demo password: DEMO_STAFF_PASSWORD in prisma/seed-demo.ts)',
  );
  console.table([
    { email: ADMIN_EMAIL, role: 'superadmin' },
    ...staffRows.map((row) => ({
      email: row.email,
      role: `${row.jobTitle ?? '-'} / ${row.status}${row.isDeleted ? ' / deleted' : ''}${row.canLogin ? '' : ' / no login'}`,
    })),
  ]);
  console.log('Students (apply with national ID + date of birth)');
  console.table(
    studentRows.map((row) => ({
      name: row.fullName,
      nationalId: row.nationalId,
      dateOfBirth: row.dob,
      expected: row.expected,
    })),
  );
  console.log('Activities');
  console.table(
    activityRows.map((row) => ({
      name: row.name,
      state: row.note,
      apply: `${origin}/applications/activities/${activities[row.key]}`,
    })),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
