import { NestFactory } from '@nestjs/core';
import { ValidationPipe, UnprocessableEntityException } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { engine } from 'express-handlebars';
import type { HelperOptions } from 'handlebars';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { NotFoundFilter } from './common/filters/not-found.filter';
import { BadRequestFilter } from './common/filters/bad-request.filter';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { SettingsService } from './settings/settings.service';
import { csrfMiddleware } from './common/middleware/csrf.middleware';

// A property's own message, or else the first one from its nested DTO
// (e.g. form.components), so nested errors still reach the response under
// the top-level property name.
function firstValidationMessage(error: ValidationError): string | undefined {
  const own = Object.values(error.constraints ?? {})[0];
  if (own) return own;

  for (const child of error.children ?? []) {
    const message = firstValidationMessage(child);
    if (message) return message;
  }

  return undefined;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const settings = app.get(SettingsService, { strict: false });
  const isProduction = process.env.NODE_ENV === 'production';
  const sessionSecret = process.env.SESSION_SECRET;
  const databaseUrl = process.env.DATABASE_URL;
  if (!sessionSecret) throw new Error('متغير البيئة SESSION_SECRET مطلوب');
  if (!databaseUrl) throw new Error('متغير البيئة DATABASE_URL مطلوب');

  // Production traffic must reach the app only through one trusted load balancer.
  if (isProduction) app.set('trust proxy', 1);

  const PgSession = connectPgSimple(session);

  app.use(
    session({
      name: isProduction ? '__Host-qcms.sid' : 'qcms.sid',
      secret: sessionSecret,
      store: new PgSession({
        conString: databaseUrl,
        tableName: 'sessions',
        createTableIfMissing: false,
      }),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 60 * 1000, // 30 minutes is default. A middleware is responsable for handling customizable session timout from DB.
      },
    }),
  );

  // Middleware for customizable session timeout
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const minutes = await settings.getSessionTimeoutMinutes();
      if (req.session) req.session.cookie.maxAge = minutes * 60_000;
      next();
    } catch (err) {
      next(err);
    }
  });

  // To triger $disconnect in PrismaService.onModuleDestroy() and close the DB connection
  app.enableShutdownHooks();

  app.useStaticAssets(join(__dirname, '..', 'public'));
  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.engine(
    'hbs',
    engine({
      extname: '.hbs',
      defaultLayout: 'main',
      layoutsDir: join(__dirname, '..', 'views', 'layouts'),
      partialsDir: join(__dirname, '..', 'views', 'partials'),
      helpers: {
        eq: (a: any, b: any) => a === b,
        // Lets a view add page-specific assets to slots in the layout:
        //   {{#section "styles"}}<link ...>{{/section}}  ->  {{{_sections.styles}}}
        // Views render before their layout, so the slot is filled in time.
        // Stored on the root context so it also works inside partials/blocks.
        section(this: unknown, name: string, options: HelperOptions) {
          const root = (options.data as { root: Record<string, unknown> }).root;
          const sections = (root._sections ??= {}) as Record<string, string>;
          sections[name] = (sections[name] ?? '') + options.fn(this);
          return null;
        },
        // Writes a value as JSON inside <script type="application/json">:
        //   <script type="application/json">{{{json form}}}</script>
        // Escaping < > & stops a label like "</script>" from closing the tag
        // early and injecting HTML. Use triple braces: the output is escaped here.
        json(value: unknown) {
          return JSON.stringify(value ?? null)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026')
            .replace(/\u2028/g, '\\u2028')
            .replace(/\u2029/g, '\\u2029');
        },
      },
    }),
  );

  app.setViewEngine('hbs');

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.get('HX-Request') === 'true') {
      res.locals.isHtmx = true;
      res.locals.layout = false;
    }
    next();
  });

  app.use(csrfMiddleware);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) =>
        new UnprocessableEntityException({
          message: 'تعذر التحقق من البيانات المدخلة',
          errors: Object.fromEntries(
            errors.map((e) => [e.property, firstValidationMessage(e)]),
          ),
        }),
    }),
  );

  // Nest resolves global filters in reverse order; specialized filters win.
  app.useGlobalFilters(
    new HttpExceptionFilter(),
    new NotFoundFilter(),
    new BadRequestFilter(),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch((error: unknown) => {
  console.log(error);
  process.exitCode = 1;
});
