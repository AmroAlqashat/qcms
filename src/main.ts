import { NestFactory } from '@nestjs/core';
import { ValidationPipe, UnprocessableEntityException } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { engine } from 'express-handlebars';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { NotFoundFilter } from './common/filters/not-found.filter';
import { BadRequestFilter } from './common/filters/bad-request.filter';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const isProduction = process.env.NODE_ENV === 'production';
  const sessionSecret = process.env.SESSION_SECRET;
  const databaseUrl = process.env.DATABASE_URL;
  if (!sessionSecret) throw new Error('SESSION_SECRET is required');
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

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
        maxAge: 30 * 60 * 1000, // 30 minutes of inactivity
      },
    }),
  );

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

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) =>
        new UnprocessableEntityException({
          message: 'Validation failed',
          errors: Object.fromEntries(
            errors.map((e) => [
              e.property,
              Object.values(e.constraints ?? {})[0],
            ]),
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
