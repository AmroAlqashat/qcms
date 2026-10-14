import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { describe, beforeEach, it } from 'node:test';

function general(error: unknown): { error: unknown } {
  return { error };
}

function logerror(result: void | { error: unknown }): void {
  if (result) {
    console.error(result.error);
    throw result.error;
  }
}

function rethrow(error: unknown): never {
  throw error;
}

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', async () => {
    await request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  })
    .catch(general)
    .then(logerror, rethrow);
})
  .catch(general)
  .then(logerror, rethrow);
