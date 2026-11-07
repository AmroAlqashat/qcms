import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SetupModule } from '../src/setup/setup.module';
import { SetupService } from '../src/setup/setup.service';

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error(
      'Run interactively; do not send setup tokens to deployment logs.',
    );
  const app = await NestFactory.createApplicationContext(SetupModule, {
    logger: false,
    abortOnError: false,
  });
  try {
    const token = await app.get(SetupService).issueSetupToken();
    console.log(
      'Open /setup over HTTPS and provide this token privately to the center owner.',
    );
    console.log(
      'Any previous setup token is now invalid. Expires in 30 minutes:',
    );
    console.log(token);
  } finally {
    await app.close();
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error && error.constructor === Error
      ? error.message
      : 'Token creation failed. Check database access and migrations.',
  );
  process.exitCode = 1;
});
