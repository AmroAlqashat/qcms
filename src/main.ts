import { NestFactory } from '@nestjs/core';
import { ValidationPipe, UnprocessableEntityException } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { engine } from 'express-handlebars';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

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
            errors.map((e) => [e.property, Object.values(e.constraints ?? {})[0]]),
          ),
        }),
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
